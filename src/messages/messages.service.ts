import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ThreadDetailDto,
  ThreadListDto,
  ThreadMessageDto,
  ThreadSummaryDto,
} from './dto/thread-message.dto';

const PREVIEW_LIMIT = 200;

type DoctorSnapshot = {
  doctorUserId: string;
  doctorName: string;
  doctorSpecialty: string | null;
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
 * Patient-side messaging service. Mirrors `ProfessionalService.{listMessages,
 * sendMessage}` but in the opposite direction:
 * - the caller is always identified as the patient
 * - threads are created lazily by the doctor side; the patient cannot create a
 *   new thread out of thin air, so `sendMessage` requires an existing thread
 * - the patient is authorized only for threads where `patientUserId === caller`
 */
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inbox view: every doctor↔patient thread the caller participates in. */
  async listThreads(callerUserId: string): Promise<ThreadListDto> {
    const threads = await this.prisma.doctorPatientThread.findMany({
      where: { patientUserId: callerUserId },
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
      const last = t.messages[0];
      return {
        threadId: t.id,
        ...doctor,
        lastMessageAt: (last?.createdAt ?? t.updatedAt).toISOString(),
        lastMessagePreview: last ? truncate(last.body, PREVIEW_LIMIT) : null,
        lastMessageSender: last
          ? last.senderUserId === callerUserId
            ? 'patient'
            : 'doctor'
          : null,
        unreadCount: t._count.messages,
      };
    });

    return { items };
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

    return {
      threadId: thread.id,
      ...this.toDoctorSnapshot(thread.doctor),
      messages,
    };
  }

  /** Patient → doctor reply in an existing thread. */
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

  // --- helpers ---

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
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trimEnd()}…`;
}
