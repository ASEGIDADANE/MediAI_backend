import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingUserRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  bookingChatWindowEndsAt,
  CHAT_ALLOWED_STATUSES,
  isBookingChatActive,
} from '../consultations/booking-statuses';
import {
  ThreadDetailDto,
  ThreadListDto,
  ThreadMessageDto,
  ThreadSummaryDto,
  UnreadCountDto,
} from './dto/thread-message.dto';

const PREVIEW_LIMIT = 200;

// Phase 4 — chat is locked until the doctor approves a booking. See
// `CHAT_ALLOWED_STATUSES` in `consultations/booking-statuses.ts` for the
// exact rule.
const ACTIVE_BOOKING_STATUSES = CHAT_ALLOWED_STATUSES;

type DoctorSnapshot = {
  doctorUserId: string;
  doctorName: string;
  doctorSpecialty: string | null;
};

type PatientSnapshot = {
  patientUserId: string;
  patientName: string;
};

type StoredMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Doctor↔patient messaging service for the calling user. The endpoints are
 * symmetric: a patient sees only the doctors they're talking to, and a doctor
 * sees only the patients they're talking to. The caller's
 * `UserProfile.role` decides which side of every thread they are on.
 *
 * Read-state tracking lives on `DoctorPatientMessage.readAt`: a message is
 * "unread" for the caller when `readAt IS NULL` and the sender is not the
 * caller. `getThread` (patient side) and
 * `ProfessionalService.listMessages` (doctor side) both flush the relevant
 * unread messages on fetch, so opening a conversation clears that thread's
 * badge.
 */
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inbox view: every thread the caller participates in (as doctor or
   * patient), sorted most-recent-activity first. Empty threads with no
   * messages exchanged are filtered out so the inbox doesn't grow every time
   * a doctor merely opens a patient's profile (which lazily creates a thread).
   */
  async listThreads(callerUserId: string): Promise<ThreadListDto> {
    const role = await this.resolveCallerRole(callerUserId);

    // Doctor inbox is additionally gated by the same active-booking rule that
    // `ProfessionalService.listPatients` enforces, so the doctor's "Messages"
    // page can never show threads with patients they no longer have a
    // working relationship with (e.g. cancelled / unpaid bookings). Patient
    // inbox is *not* gated — patients always keep visibility into doctors
    // they messaged, regardless of booking state on the doctor's side.
    const where: Prisma.DoctorPatientThreadWhereInput =
      role === OnboardingUserRole.professional
        ? {
            doctorUserId: callerUserId,
            messages: { some: {} },
            patient: {
              consultationBookings: {
                some: {
                  topDoctorId: callerUserId,
                  status: { in: ACTIVE_BOOKING_STATUSES },
                },
              },
            },
          }
        : { patientUserId: callerUserId, messages: { some: {} } };

    const threads = await this.prisma.doctorPatientThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { preferredName: true, professionalProfile: true },
            },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { preferredName: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            senderUserId: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                readAt: null,
                NOT: { senderUserId: callerUserId },
              },
            },
          },
        },
      },
    });

    const items: ThreadSummaryDto[] = threads.map((t) => {
      const doctor = this.toDoctorSnapshot(t.doctor);
      const patient = this.toPatientSnapshot(t.patient);
      const last = t.messages[0];
      return {
        threadId: t.id,
        ...doctor,
        ...patient,
        lastMessageAt: (last?.createdAt ?? t.updatedAt).toISOString(),
        lastMessagePreview: last ? truncate(last.body, PREVIEW_LIMIT) : null,
        lastMessageSender: last
          ? last.senderUserId === t.doctorUserId
            ? 'doctor'
            : 'patient'
          : null,
        unreadCount: t._count.messages,
      };
    });

    return { items };
  }

  /**
   * Total unread inbound messages for the caller across every thread they're
   * a participant in. Cheap aggregate query that powers the navbar badge.
   * Works for both patient and doctor accounts because we filter by
   * `senderUserId !== caller` rather than hardcoding a side.
   */
  async getUnreadCount(callerUserId: string): Promise<UnreadCountDto> {
    const role = await this.resolveCallerRole(callerUserId);

    // Mirror `listThreads`: doctors only get badge counts for threads
    // backed by an active booking; otherwise the navbar could read "3 unread"
    // while the inbox lists 0 conversations.
    const threadFilter: Prisma.DoctorPatientThreadWhereInput =
      role === OnboardingUserRole.professional
        ? {
            doctorUserId: callerUserId,
            patient: {
              consultationBookings: {
                some: {
                  topDoctorId: callerUserId,
                  status: { in: ACTIVE_BOOKING_STATUSES },
                },
              },
            },
          }
        : { patientUserId: callerUserId };

    const count = await this.prisma.doctorPatientMessage.count({
      where: {
        readAt: null,
        NOT: { senderUserId: callerUserId },
        thread: threadFilter,
      },
    });

    return { count };
  }

  /**
   * Fetch a single thread (caller must be the patient on it) and mark all
   * doctor → patient messages as read. Messages are returned oldest → newest
   * to match the chat UI rendering order.
   */
  async getThread(
    callerUserId: string,
    threadId: string,
    limit: number,
  ): Promise<ThreadDetailDto> {
    const thread = await this.requirePatientThread(callerUserId, threadId);

    await this.prisma.doctorPatientMessage.updateMany({
      where: {
        threadId: thread.id,
        readAt: null,
        NOT: { senderUserId: callerUserId },
      },
      data: { readAt: new Date() },
    });

    const rows = await this.prisma.doctorPatientMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const messages: ThreadMessageDto[] = rows
      .reverse()
      .map((m) => this.toMessageDto(m, callerUserId));

    const chatWindowEndsAt = await this.resolveChatWindowEndsAt(
      callerUserId,
      thread.doctorUserId,
    );

    return {
      threadId: thread.id,
      ...this.toDoctorSnapshot(thread.doctor),
      messages,
      chatWindowEndsAt,
    };
  }

  /**
   * Patient → doctor reply in an existing thread.
   *
   * Phase 4 chat-gating (two layers):
   *
   *   1. Status: the patient must currently have at least one booking with
   *      this doctor in `CHAT_ALLOWED_STATUSES` (approved / completed /
   *      legacy confirmed). Pending/rejected/cancelled don't qualify.
   *
   *   2. Time window: at least one of those bookings must be inside its
   *      consultation window — `scheduledFor + duration + SLOT_END_GRACE`
   *      for approved bookings, `completedAt + POST_COMPLETION_GRACE` for
   *      completed ones. Outside the window the patient must pay for a
   *      follow-up before they can keep messaging.
   *
   * Threads themselves stay forever for medical record continuity; only
   * the "send" action is gated.
   */
  async sendMessage(
    callerUserId: string,
    threadId: string,
    body: string,
  ): Promise<ThreadMessageDto> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Message body cannot be empty.');
    }

    const thread = await this.requirePatientThread(callerUserId, threadId);

    await this.assertChatWindowOpen(callerUserId, thread.doctorUserId);

    const [, msg] = await this.prisma.$transaction([
      this.prisma.doctorPatientThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.doctorPatientMessage.create({
        data: {
          threadId: thread.id,
          senderUserId: callerUserId,
          body: trimmed,
        },
      }),
    ]);

    return this.toMessageDto(msg, callerUserId);
  }

  /**
   * Throws `ForbiddenException` unless the patient currently has at least
   * one booking with this doctor whose consultation window is open. Used
   * by `sendMessage`; the doctor side runs an equivalent check in
   * `ProfessionalService.sendMessage`.
   *
   * Why this is a JS post-filter (not a single Prisma `where`): the
   * window math depends on each row's `scheduledFor + durationMinutes`,
   * which Prisma can't express portably without a raw query. The set is
   * tiny (a single patient/doctor pair rarely has more than a handful of
   * bookings), so a `take: 5` find + JS filter is cheap and clearer than
   * raw SQL.
   */
  private async assertChatWindowOpen(
    patientUserId: string,
    doctorUserId: string,
  ): Promise<void> {
    const candidates = await this.prisma.consultationBooking.findMany({
      where: {
        patientUserId,
        topDoctorId: doctorUserId,
        status: { in: CHAT_ALLOWED_STATUSES },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        durationMinutes: true,
        completedAt: true,
        createdAt: true,
      },
    });
    const now = new Date();
    const active = candidates.find((b) => isBookingChatActive(b, now));
    if (active) return;
    // Anything in CHAT_ALLOWED_STATUSES (just expired)? Give a different
    // copy so the patient knows the path is "book a follow-up".
    if (candidates.length > 0) {
      throw new ForbiddenException(
        'This consultation has ended. Book a follow-up consultation to keep messaging.',
      );
    }
    throw new ForbiddenException(
      'Chat is locked until you have a doctor-approved consultation with this doctor.',
    );
  }

  /**
   * Returns the ISO timestamp at which chat will next close for this
   * patient↔doctor pair, or `null` if no window is currently open. Used by
   * `getThread` to feed the frontend's composer-lock UI.
   */
  async resolveChatWindowEndsAt(
    patientUserId: string,
    doctorUserId: string,
  ): Promise<string | null> {
    const candidates = await this.prisma.consultationBooking.findMany({
      where: {
        patientUserId,
        topDoctorId: doctorUserId,
        status: { in: CHAT_ALLOWED_STATUSES },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        durationMinutes: true,
        completedAt: true,
        createdAt: true,
      },
    });
    const now = new Date();
    // Pick the *latest* window end across all currently-active bookings —
    // if a patient has multiple, the chat is open until the last one closes.
    let latest: Date | null = null;
    for (const b of candidates) {
      if (!isBookingChatActive(b, now)) continue;
      const endsAt = bookingChatWindowEndsAt(b);
      if (endsAt && (!latest || endsAt.getTime() > latest.getTime())) {
        latest = endsAt;
      }
    }
    return latest?.toISOString() ?? null;
  }

  // --- helpers ---

  private async resolveCallerRole(
    callerUserId: string,
  ): Promise<OnboardingUserRole | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: { role: true },
    });
    return profile?.role ?? null;
  }

  private async requirePatientThread(callerUserId: string, threadId: string) {
    const thread = await this.prisma.doctorPatientThread.findUnique({
      where: { id: threadId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { preferredName: true, professionalProfile: true },
            },
          },
        },
      },
    });
    if (!thread) {
      throw new NotFoundException('Thread not found.');
    }
    if (thread.patientUserId !== callerUserId) {
      // Hide whether the thread exists at all from non-participants.
      throw new ForbiddenException('You are not a participant in this thread.');
    }
    return thread;
  }

  private toMessageDto(
    m: StoredMessage,
    callerUserId: string,
  ): ThreadMessageDto {
    const isMine = m.senderUserId === callerUserId;
    return {
      id: m.id,
      threadId: m.threadId,
      sender: isMine ? 'patient' : 'doctor',
      senderUserId: m.senderUserId,
      mine: isMine,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    };
  }

  private toDoctorSnapshot(doctor: {
    id: string;
    email: string;
    profile: {
      preferredName: string | null;
      professionalProfile: unknown;
    } | null;
  }): DoctorSnapshot {
    const pp = doctor.profile?.professionalProfile;
    const ppRecord =
      pp && typeof pp === 'object' && !Array.isArray(pp)
        ? (pp as Record<string, unknown>)
        : null;

    const fullName =
      ppRecord && typeof ppRecord.fullName === 'string'
        ? ppRecord.fullName.trim()
        : '';
    const preferred = doctor.profile?.preferredName?.trim() ?? '';
    const fallback = doctor.email.split('@')[0] ?? doctor.email;

    const specialty =
      ppRecord && typeof ppRecord.specialty === 'string'
        ? ppRecord.specialty.trim()
        : '';

    return {
      doctorUserId: doctor.id,
      doctorName: fullName || preferred || fallback,
      doctorSpecialty: specialty.length > 0 ? specialty : null,
    };
  }

  private toPatientSnapshot(
    patient: {
      id: string;
      email: string;
      profile: { preferredName: string | null } | null;
    } | null,
  ): PatientSnapshot {
    if (!patient) {
      return { patientUserId: '', patientName: 'Unknown patient' };
    }
    const preferred = patient.profile?.preferredName?.trim() ?? '';
    const fallback = patient.email.split('@')[0] ?? patient.email;
    return {
      patientUserId: patient.id,
      patientName: preferred || fallback,
    };
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trimEnd()}…`;
}
