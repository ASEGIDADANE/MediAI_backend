import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountAuditAction,
  ConsultationType,
  OnboardingUserRole,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountAuditService } from '../me/account-audit.service';
import { SLOT_HOLDING_STATUSES } from '../consultations/booking-statuses';
import {
  PutWeeklyAvailabilityDto,
  WeeklyAvailabilityListDto,
  WeeklyAvailabilityRuleDto,
} from './dto/weekly-availability-rule.dto';
import {
  CreateUnavailableDateDto,
  UnavailableDateDto,
  UnavailableDateListDto,
} from './dto/unavailable-date.dto';
import {
  DoctorCapacityDto,
  PutDoctorCapacityDto,
} from './dto/doctor-capacity.dto';
import {
  AvailabilitySlotDto,
  AvailabilitySlotsListDto,
} from './dto/availability-slot.dto';
import {
  AvailabilityRuleInput,
  ExistingBookingInput,
  UnavailableDateInput,
  computeAvailableSlots,
} from './slot-generator';

const DEFAULT_SLOT_DAYS = 14;
const MAX_SLOT_DAYS = 60;
const MAX_RULES_PER_DOCTOR = 50;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountAuditService,
  ) {}

  // ------------------------------------------------------------------
  // Doctor-side (caller must be `professional`)
  // ------------------------------------------------------------------

  async listMyRules(callerUserId: string): Promise<WeeklyAvailabilityListDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const rows = await this.prisma.weeklyAvailabilityRule.findMany({
      where: { doctorUserId: callerUserId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTimeMinutes: 'asc' }],
    });
    return { items: rows.map(toRuleDto) };
  }

  /**
   * Full replace of the doctor's weekly rules. The transaction strategy is
   * "delete-then-insert" so the caller can submit completely new patterns
   * without us having to diff. Ids on the inbound array are ignored — the DB
   * mints fresh ids on every PUT.
   */
  async replaceMyRules(
    callerUserId: string,
    dto: PutWeeklyAvailabilityDto,
  ): Promise<WeeklyAvailabilityListDto> {
    await this.assertCallerIsProfessional(callerUserId);

    if (dto.items.length > MAX_RULES_PER_DOCTOR) {
      throw new BadRequestException(
        `At most ${MAX_RULES_PER_DOCTOR} availability rules are allowed.`,
      );
    }
    for (const item of dto.items) {
      assertRuleShape(item);
    }

    await this.prisma.$transaction([
      this.prisma.weeklyAvailabilityRule.deleteMany({
        where: { doctorUserId: callerUserId },
      }),
      ...(dto.items.length > 0
        ? [
            this.prisma.weeklyAvailabilityRule.createMany({
              data: dto.items.map((item) => ({
                doctorUserId: callerUserId,
                dayOfWeek: item.dayOfWeek,
                startTimeMinutes: item.startTimeMinutes,
                endTimeMinutes: item.endTimeMinutes,
                slotDurationMinutes: item.slotDurationMinutes,
                timezone: item.timezone,
              })),
            }),
          ]
        : []),
    ]);

    // Phase 6 — audit only; no in-app notification (availability edits are
    // owned by the doctor and don't directly impact a single patient).
    await this.logAvailabilityChange(callerUserId, {
      scope: 'weeklyRules',
      ruleCount: dto.items.length,
    });

    return this.listMyRules(callerUserId);
  }

  async listMyUnavailableDates(
    callerUserId: string,
  ): Promise<UnavailableDateListDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const rows = await this.prisma.doctorUnavailableDate.findMany({
      where: { doctorUserId: callerUserId },
      orderBy: { date: 'asc' },
    });
    return { items: rows.map(toUnavailableDateDto) };
  }

  async createUnavailableDate(
    callerUserId: string,
    dto: CreateUnavailableDateDto,
  ): Promise<UnavailableDateDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    try {
      const row = await this.prisma.doctorUnavailableDate.create({
        data: {
          doctorUserId: callerUserId,
          date,
          reason: dto.reason ?? null,
        },
      });
      await this.logAvailabilityChange(callerUserId, {
        scope: 'unavailableDateCreated',
        date: dto.date,
      });
      return toUnavailableDateDto(row);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Unique violation on (doctor_user_id, date) — block already exists.
        throw new BadRequestException(
          'This date is already marked as unavailable.',
        );
      }
      throw e;
    }
  }

  async deleteUnavailableDate(callerUserId: string, id: string): Promise<void> {
    await this.assertCallerIsProfessional(callerUserId);
    const row = await this.prisma.doctorUnavailableDate.findUnique({
      where: { id },
      select: { doctorUserId: true },
    });
    if (!row || row.doctorUserId !== callerUserId) {
      // Same 404-everywhere pattern as Phase 1: avoid leaking existence.
      throw new NotFoundException('Unavailable date not found.');
    }
    await this.prisma.doctorUnavailableDate.delete({ where: { id } });
    await this.logAvailabilityChange(callerUserId, {
      scope: 'unavailableDateRemoved',
    });
  }

  async getMyCapacity(callerUserId: string): Promise<DoctorCapacityDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const row = await this.prisma.doctorCapacity.findUnique({
      where: { doctorUserId: callerUserId },
    });
    return toCapacityDto(row);
  }

  async putMyCapacity(
    callerUserId: string,
    dto: PutDoctorCapacityDto,
  ): Promise<DoctorCapacityDto> {
    await this.assertCallerIsProfessional(callerUserId);

    const existing = await this.prisma.doctorCapacity.findUnique({
      where: { doctorUserId: callerUserId },
    });

    const next = {
      maxAppointmentsPerDay:
        dto.maxAppointmentsPerDay === undefined
          ? (existing?.maxAppointmentsPerDay ?? null)
          : dto.maxAppointmentsPerDay,
      defaultConsultationType:
        dto.defaultConsultationType ??
        existing?.defaultConsultationType ??
        ConsultationType.video,
      acceptedConsultationTypes:
        dto.acceptedConsultationTypes ??
        (existing ? readAcceptedTypes(existing.acceptedConsultationTypes) : []),
    };

    const row = await this.prisma.doctorCapacity.upsert({
      where: { doctorUserId: callerUserId },
      create: {
        doctorUserId: callerUserId,
        maxAppointmentsPerDay: next.maxAppointmentsPerDay,
        defaultConsultationType: next.defaultConsultationType,
        acceptedConsultationTypes: next.acceptedConsultationTypes,
      },
      update: {
        maxAppointmentsPerDay: next.maxAppointmentsPerDay,
        defaultConsultationType: next.defaultConsultationType,
        acceptedConsultationTypes: next.acceptedConsultationTypes,
      },
    });
    await this.logAvailabilityChange(callerUserId, {
      scope: 'capacity',
      hasAppointmentCap: next.maxAppointmentsPerDay != null,
      acceptedConsultationTypesCount: next.acceptedConsultationTypes.length,
    });
    return toCapacityDto(row);
  }

  /**
   * Phase 6 — single chokepoint for availability audit logging. Swallows
   * failures so a transient audit-table issue can't block the doctor from
   * editing their schedule.
   */
  private async logAvailabilityChange(
    doctorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.log(
        doctorUserId,
        AccountAuditAction.availability_updated,
        undefined,
        metadata as Prisma.InputJsonValue,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[availability] audit log failed for doctor=${doctorUserId}:`,
        err,
      );
    }
  }

  // ------------------------------------------------------------------
  // Public — anyone (authenticated or not, depending on route) computes
  // bookable slots for a given doctor.
  // ------------------------------------------------------------------

  async computeSlots(
    doctorUserId: string,
    from?: string,
    days?: number,
  ): Promise<AvailabilitySlotsListDto> {
    // Verify the target is actually a doctor — `personal` users have no
    // availability and exposing 200/[] for them would let patients enumerate
    // the user table by id.
    const targetProfile = await this.prisma.userProfile.findUnique({
      where: { userId: doctorUserId },
      select: { role: true },
    });
    if (
      !targetProfile ||
      targetProfile.role !== OnboardingUserRole.professional
    ) {
      throw new NotFoundException('Doctor not found.');
    }

    const fromDate = parseFromDate(from);
    const daysCount = clampDays(days);

    const windowEnd = new Date(
      fromDate.getTime() + daysCount * 24 * 60 * 60 * 1000,
    );

    const [rules, unavailable, bookings, capacity] = await Promise.all([
      this.prisma.weeklyAvailabilityRule.findMany({
        where: { doctorUserId },
      }),
      this.prisma.doctorUnavailableDate.findMany({
        where: { doctorUserId, date: { gte: fromDate, lt: windowEnd } },
      }),
      // Phase 3 added `scheduledFor` + `durationMinutes` to
      // `ConsultationBooking`, so slot overlap is now an exact range query
      // instead of the createdAt-based placeholder Phase 2 shipped with.
      // Bookings without `scheduledFor` (legacy / unscheduled) fall back to
      // a conservative `createdAt + 30min` hold so they still block slots.
      this.prisma.consultationBooking.findMany({
        where: {
          topDoctorId: doctorUserId,
          status: { in: SLOT_HOLDING_STATUSES },
          OR: [
            {
              scheduledFor: {
                gte: new Date(fromDate.getTime() - 24 * 60 * 60 * 1000),
                lt: new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000),
              },
            },
            {
              scheduledFor: null,
              createdAt: {
                gte: new Date(fromDate.getTime() - 24 * 60 * 60 * 1000),
                lt: new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
        select: {
          scheduledFor: true,
          durationMinutes: true,
          createdAt: true,
        },
      }),
      this.prisma.doctorCapacity.findUnique({ where: { doctorUserId } }),
    ]);

    const ruleInputs: AvailabilityRuleInput[] = rules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTimeMinutes: r.startTimeMinutes,
      endTimeMinutes: r.endTimeMinutes,
      slotDurationMinutes: r.slotDurationMinutes,
      timezone: r.timezone,
    }));

    // Use the most common timezone among the rules as the tz to interpret
    // bare-date `DoctorUnavailableDate` rows in. Falls back to UTC. (All of
    // a doctor's rules are typically the same tz in practice.)
    const tz = ruleInputs.find((r) => r.timezone)?.timezone ?? 'UTC';

    const unavailableInputs: UnavailableDateInput[] = unavailable.map((u) => ({
      date: u.date,
      timezone: tz,
    }));

    const bookingInputs: ExistingBookingInput[] = bookings.map((b) => {
      // Prefer the explicit schedule; fall back to a `createdAt + 30min`
      // hold for legacy unscheduled bookings so they still block.
      const start = b.scheduledFor ?? b.createdAt;
      const durationMs = (b.scheduledFor ? b.durationMinutes : 30) * 60 * 1000;
      return {
        startsAt: start,
        endsAt: new Date(start.getTime() + durationMs),
      };
    });

    const slots = computeAvailableSlots({
      from: fromDate,
      days: daysCount,
      rules: ruleInputs,
      unavailableDates: unavailableInputs,
      existingBookings: bookingInputs,
      maxAppointmentsPerDay: capacity?.maxAppointmentsPerDay ?? null,
    });

    return { items: slots };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async assertCallerIsProfessional(
    callerUserId: string,
  ): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: { role: true },
    });
    if (!profile || profile.role !== OnboardingUserRole.professional) {
      throw new ForbiddenException(
        'Only professional users can manage availability.',
      );
    }
  }
}

function toRuleDto(row: {
  id: string;
  dayOfWeek: number;
  startTimeMinutes: number;
  endTimeMinutes: number;
  slotDurationMinutes: number;
  timezone: string;
}): WeeklyAvailabilityRuleDto {
  return {
    id: row.id,
    dayOfWeek: row.dayOfWeek,
    startTimeMinutes: row.startTimeMinutes,
    endTimeMinutes: row.endTimeMinutes,
    slotDurationMinutes: row.slotDurationMinutes,
    timezone: row.timezone,
  };
}

function toUnavailableDateDto(row: {
  id: string;
  date: Date;
  reason: string | null;
}): UnavailableDateDto {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    reason: row.reason,
  };
}

function toCapacityDto(
  row:
    | {
        maxAppointmentsPerDay: number | null;
        defaultConsultationType: ConsultationType;
        acceptedConsultationTypes: Prisma.JsonValue;
      }
    | null
    | undefined,
): DoctorCapacityDto {
  if (!row) {
    return {
      maxAppointmentsPerDay: null,
      defaultConsultationType: ConsultationType.video,
      acceptedConsultationTypes: [],
    };
  }
  return {
    maxAppointmentsPerDay: row.maxAppointmentsPerDay,
    defaultConsultationType: row.defaultConsultationType,
    acceptedConsultationTypes: readAcceptedTypes(row.acceptedConsultationTypes),
  };
}

function readAcceptedTypes(value: Prisma.JsonValue): ConsultationType[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(Object.values(ConsultationType));
  return value.filter(
    (v): v is ConsultationType => typeof v === 'string' && valid.has(v),
  );
}

function assertRuleShape(item: WeeklyAvailabilityRuleDto): void {
  if (item.endTimeMinutes <= item.startTimeMinutes) {
    throw new BadRequestException(
      'endTimeMinutes must be greater than startTimeMinutes.',
    );
  }
  if (item.slotDurationMinutes > item.endTimeMinutes - item.startTimeMinutes) {
    throw new BadRequestException(
      'slotDurationMinutes must be no larger than the window length.',
    );
  }
  if (!item.timezone || item.timezone.length > 64) {
    throw new BadRequestException('timezone is required (IANA name).');
  }
}

function parseFromDate(from?: string): Date {
  if (!from) return new Date();
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid `from` timestamp.');
  }
  return d;
}

function clampDays(days?: number): number {
  if (days === undefined || days === null) return DEFAULT_SLOT_DAYS;
  if (days < 1) return 1;
  if (days > MAX_SLOT_DAYS) return MAX_SLOT_DAYS;
  return Math.floor(days);
}

export { AvailabilitySlotDto };
