import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import {
  AssistantAccessStatus,
  ConsultationType,
  ConsultationBookingStatus,
  OnboardingUserRole,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssistantAccessPlanListResponseDto,
  AssistantAccessPlanResponseDto,
  BillingConsultationSummaryDto,
  MeBillingResponseDto,
} from './dto/payments.dto';
import { ChapaClient, type ChapaVerifyResult } from './chapa.client';
import { formatPaymentPrice } from './payment-format.util';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaClient,
    private readonly config: ConfigService,
  ) {}

  async listAssistantPlans(): Promise<AssistantAccessPlanListResponseDto> {
    const rows = await this.prisma.assistantAccessPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((row) => this.toAssistantPlanDto(row)) };
  }

  async getMyBilling(userId: string): Promise<MeBillingResponseDto> {
    await this.expireStaleAssistantAccess(userId);

    const [active, latest, consultations] = await this.prisma.$transaction([
      this.prisma.userAssistantAccess.findFirst({
        where: {
          userId,
          status: AssistantAccessStatus.active,
          endsAt: { gt: new Date() },
        },
        include: { plan: true },
        orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.userAssistantAccess.findFirst({
        where: { userId },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.consultationBooking.findMany({
        where: { patientUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          topDoctor: {
            select: {
              email: true,
              profile: {
                select: {
                  preferredName: true,
                  professionalProfile: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const assistant = active ?? latest;
    return {
      assistantAccess: {
        active: Boolean(
          active &&
            active.status === AssistantAccessStatus.active &&
            active.endsAt &&
            active.endsAt > new Date(),
        ),
        status: assistant?.status ?? null,
        planName: assistant?.plan.name ?? null,
        priceDisplay: assistant
          ? formatPaymentPrice(assistant.amountCents, assistant.currency)
          : null,
        startsAt: assistant?.startsAt?.toISOString() ?? null,
        endsAt: assistant?.endsAt?.toISOString() ?? null,
        paidAt: assistant?.paidAt?.toISOString() ?? null,
      },
      recentConsultations: consultations.map((row) =>
        this.toConsultationSummary(row),
      ),
    };
  }

  async initiateAssistantPayment(userId: string, planId: string) {
    const [user, profile, plan] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, appRole: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { role: true },
      }),
      this.prisma.assistantAccessPlan.findFirst({
        where: { id: planId, active: true },
      }),
    ]);

    if (!user || user.appRole !== UserAppRole.user) {
      throw new UnauthorizedException('Only signed-in patients can purchase access.');
    }
    if (!profile || profile.role !== OnboardingUserRole.personal) {
      throw new ForbiddenException(
        'Assistant access is only available for personal patient accounts.',
      );
    }
    if (!plan) {
      throw new BadRequestException('Assistant access plan not found.');
    }

    const txRef = buildTxRef('assistant');
    const access = await this.prisma.userAssistantAccess.create({
      data: {
        userId,
        planId: plan.id,
        status: AssistantAccessStatus.pending,
        txRef,
        amountCents: plan.priceCents,
        currency: plan.currency,
      },
    });

    try {
      const checkout = await this.chapa.initializePayment({
        amountCents: plan.priceCents,
        currency: plan.currency,
        email: user.email,
        txRef,
        callbackUrl: this.getCallbackUrl(),
        returnUrl: this.getReturnUrl('assistant'),
        title: 'MediAI Assistant',
        description: `${plan.name}: ${plan.durationDays} day personalized health assistant access`,
        meta: {
          userId,
          accessId: access.id,
          kind: 'assistant_access',
        },
      });

      await this.prisma.userAssistantAccess.update({
        where: { id: access.id },
        data: { chapaCheckoutUrl: checkout.checkoutUrl },
      });

      return {
        txRef,
        checkoutUrl: checkout.checkoutUrl,
        accessId: access.id,
      };
    } catch (error) {
      await this.prisma.userAssistantAccess.update({
        where: { id: access.id },
        data: { status: AssistantAccessStatus.failed },
      });
      throw error;
    }
  }

  async initiateConsultationPayment(userId: string, bookingId: string) {
    const booking = await this.prisma.consultationBooking.findFirst({
      where: { id: bookingId, patientUserId: userId },
      include: {
        patient: { select: { email: true } },
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });
    if (!booking) {
      throw new ForbiddenException('Consultation booking not found.');
    }
    if (
      booking.status === ConsultationBookingStatus.paid ||
      booking.status === ConsultationBookingStatus.confirmed
    ) {
      throw new ConflictException('This consultation has already been paid.');
    }

    const txRef = buildTxRef('consultation');
    const doctorName = doctorDisplayName(booking.topDoctor);
    try {
      const checkout = await this.chapa.initializePayment({
        amountCents: booking.consultationFeeCents,
        currency: booking.currency,
        email: booking.patient.email,
        txRef,
        callbackUrl: this.getCallbackUrl(),
        returnUrl: this.getReturnUrl('consultation', booking.id),
        title: 'MediAI Consult',
        description: `${booking.consultationType} consultation with ${doctorName}`,
        meta: {
          bookingId: booking.id,
          topDoctorId: booking.topDoctorId,
          kind: 'consultation_booking',
        },
      });

      await this.prisma.consultationBooking.update({
        where: { id: booking.id },
        data: {
          chapaTxRef: txRef,
          chapaReference: null,
          status: ConsultationBookingStatus.pending_payment,
        },
      });

      return {
        txRef,
        checkoutUrl: checkout.checkoutUrl,
        bookingId: booking.id,
      };
    } catch (error) {
      await this.prisma.consultationBooking.update({
        where: { id: booking.id },
        data: { status: ConsultationBookingStatus.failed },
      });
      throw error;
    }
  }

  async handleChapaCallback(params: {
    txRef?: string;
    trxRef?: string;
    refId?: string;
    status?: string;
  }): Promise<{ ok: true }> {
    const txRef = params.txRef ?? params.trxRef;
    if (!txRef) {
      throw new BadRequestException('Missing tx_ref');
    }
    await this.finalizeByVerifiedTransaction({
      txRef,
      chapaReference: params.refId ?? null,
      eventType: `callback.${(params.status ?? 'unknown').toLowerCase()}`,
      payload: params,
    });
    return { ok: true } as const;
  }

  async handleChapaWebhook(
    payload: Record<string, unknown>,
    signatureHeaders: {
      chapaSignature?: string;
      xChapaSignature?: string;
    },
  ): Promise<{ ok: true }> {
    this.verifyWebhookSignature(payload, signatureHeaders);
    const txRef = readString(payload, 'tx_ref') ?? readString(payload, 'trx_ref');
    if (!txRef) {
      throw new BadRequestException('Webhook payload missing tx_ref');
    }
    await this.finalizeByVerifiedTransaction({
      txRef,
      chapaReference: readString(payload, 'reference') ?? null,
      eventType: readString(payload, 'event') ?? 'webhook.unknown',
      payload,
    });
    return { ok: true } as const;
  }

  async requireActiveAssistantAccess(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (!profile) {
      return;
    }
    // Professional clinical-assistant flows are not monetized by this V1 pass.
    if (profile.role === OnboardingUserRole.professional) {
      return;
    }

    await this.expireStaleAssistantAccess(userId);
    const active = await this.prisma.userAssistantAccess.findFirst({
      where: {
        userId,
        status: AssistantAccessStatus.active,
        endsAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!active) {
      throw new ForbiddenException(
        'Personalized health assistant access requires an active payment.',
      );
    }
  }

  private async finalizeByVerifiedTransaction(args: {
    txRef: string;
    chapaReference: string | null;
    eventType: string;
    payload: unknown;
  }) {
    const verified = await this.chapa.verifyTransaction(args.txRef);
    if (verified.txRef !== args.txRef) {
      throw new BadRequestException('Verified payment reference does not match.');
    }
    const reference = verified.chapaReference ?? args.chapaReference;
    const dedupeKey = [
      'chapa',
      args.eventType,
      verified.txRef,
      reference ?? 'none',
    ].join(':');

    await this.prisma.$transaction(async (tx) => {
      const created = await createPaymentEventIfNew(tx, {
        eventType: args.eventType,
        txRef: verified.txRef,
        chapaReference: reference,
        payload: args.payload,
        dedupeKey,
      });
      if (!created) {
        return;
      }

      const access = await tx.userAssistantAccess.findUnique({
        where: { txRef: verified.txRef },
        include: { plan: true },
      });
      if (access) {
        await this.applyAssistantVerification(tx, access, verified, reference);
        await tx.paymentEvent.update({
          where: { dedupeKey },
          data: { processedAt: new Date() },
        });
        return;
      }

      const booking = await tx.consultationBooking.findFirst({
        where: { chapaTxRef: verified.txRef },
      });
      if (booking) {
        await this.applyConsultationVerification(tx, booking, verified, reference);
        await tx.paymentEvent.update({
          where: { dedupeKey },
          data: { processedAt: new Date() },
        });
        return;
      }

      await tx.paymentEvent.update({
        where: { dedupeKey },
        data: { processedAt: new Date() },
      });
    });
  }

  private async applyAssistantVerification(
    tx: Prisma.TransactionClient,
    access: {
      id: string;
      amountCents: number;
      currency: string;
      status: AssistantAccessStatus;
      plan: { durationDays: number };
      paidAt: Date | null;
    },
    verified: ChapaVerifyResult,
    reference: string | null,
  ) {
    this.assertAmountCurrency(access.amountCents, access.currency, verified);
    const nextStatus = assistantStatusFromProvider(verified.status);
    if (access.paidAt || access.status === AssistantAccessStatus.active) {
      return;
    }
    if (nextStatus !== AssistantAccessStatus.active) {
      await tx.userAssistantAccess.update({
        where: { id: access.id },
        data: {
          status: nextStatus,
          chapaReference: reference,
        },
      });
      return;
    }
    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + access.plan.durationDays * 24 * 60 * 60 * 1000,
    );
    await tx.userAssistantAccess.update({
      where: { id: access.id },
      data: {
        status: AssistantAccessStatus.active,
        chapaReference: reference,
        startsAt,
        endsAt,
        paidAt: startsAt,
      },
    });
  }

  private async applyConsultationVerification(
    tx: Prisma.TransactionClient,
    booking: {
      id: string;
      consultationFeeCents: number;
      currency: string;
      status: ConsultationBookingStatus;
      paidAt: Date | null;
    },
    verified: ChapaVerifyResult,
    reference: string | null,
  ) {
    this.assertAmountCurrency(
      booking.consultationFeeCents,
      booking.currency,
      verified,
    );
    if (booking.paidAt || booking.status === ConsultationBookingStatus.confirmed) {
      return;
    }

    const nextStatus = consultationStatusFromProvider(verified.status);
    if (
      nextStatus === ConsultationBookingStatus.failed ||
      nextStatus === ConsultationBookingStatus.cancelled
    ) {
      await tx.consultationBooking.update({
        where: { id: booking.id },
        data: {
          status: nextStatus,
          chapaReference: reference,
        },
      });
      return;
    }
    if (nextStatus !== ConsultationBookingStatus.confirmed) {
      await tx.consultationBooking.update({
        where: { id: booking.id },
        data: {
          status: nextStatus,
          chapaReference: reference,
        },
      });
      return;
    }

    const paidAt = new Date();
    await tx.consultationBooking.update({
      where: { id: booking.id },
      data: {
        status: ConsultationBookingStatus.confirmed,
        chapaReference: reference,
        paidAt,
      },
    });
  }

  private assertAmountCurrency(
    expectedAmountCents: number,
    expectedCurrency: string,
    verified: ChapaVerifyResult,
  ) {
    if (verified.amountCents !== expectedAmountCents) {
      throw new BadRequestException('Verified payment amount does not match.');
    }
    if (verified.currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      throw new BadRequestException('Verified payment currency does not match.');
    }
    if (verified.status === '') {
      throw new BadRequestException('Verified payment status missing.');
    }
  }

  private verifyWebhookSignature(
    payload: Record<string, unknown>,
    headers: { chapaSignature?: string; xChapaSignature?: string },
  ) {
    const secret = this.config.get<string>('CHAPA_WEBHOOK_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Webhook secret is not configured.');
    }
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const valid = [headers.chapaSignature, headers.xChapaSignature]
      .filter((value): value is string => Boolean(value))
      .some((value) => safeHexEqual(value, expected));
    if (!valid) {
      throw new UnauthorizedException('Invalid Chapa webhook signature.');
    }
  }

  private getCallbackUrl(): string {
    const explicit = this.config.get<string>('CHAPA_CALLBACK_URL');
    if (explicit) return explicit;
    const port = this.config.get<string>('PORT') ?? '4000';
    return `http://localhost:${port}/api/payments/chapa/callback`;
  }

  private getReturnUrl(kind: 'assistant' | 'consultation', bookingId?: string) {
    const base =
      this.config.get<string>('CHAPA_RETURN_URL') ??
      `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/payment/chapa/return`;
    const url = new URL(base);
    url.searchParams.set('kind', kind);
    if (bookingId) {
      url.searchParams.set('bookingId', bookingId);
    }
    return url.toString();
  }

  private async expireStaleAssistantAccess(userId: string) {
    await this.prisma.userAssistantAccess.updateMany({
      where: {
        userId,
        status: AssistantAccessStatus.active,
        endsAt: { lt: new Date() },
      },
      data: { status: AssistantAccessStatus.expired },
    });
  }

  private toAssistantPlanDto(row: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    durationDays: number;
    active: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): AssistantAccessPlanResponseDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priceCents: row.priceCents,
      currency: row.currency,
      priceDisplay: formatPaymentPrice(row.priceCents, row.currency),
      durationDays: row.durationDays,
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toConsultationSummary(row: {
    id: string;
    topDoctorId: string;
    consultationType: ConsultationType;
    status: ConsultationBookingStatus;
    consultationFeeCents: number;
    currency: string;
    paidAt: Date | null;
    createdAt: Date;
    topDoctor: {
      email: string;
      profile: {
        preferredName: string;
        professionalProfile: unknown;
      } | null;
    };
  }): BillingConsultationSummaryDto {
    return {
      id: row.id,
      topDoctorId: row.topDoctorId,
      topDoctorName: doctorDisplayName(row.topDoctor),
      consultationType: row.consultationType,
      status: row.status,
      consultationFeeCents: row.consultationFeeCents,
      consultationFeeDisplay: formatPaymentPrice(
        row.consultationFeeCents,
        row.currency,
      ),
      currency: row.currency,
      paidAt: row.paidAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

async function createPaymentEventIfNew(
  tx: Prisma.TransactionClient,
  input: {
    eventType: string;
    txRef: string;
    chapaReference: string | null;
    payload: unknown;
    dedupeKey: string;
  },
): Promise<boolean> {
  try {
    await tx.paymentEvent.create({
      data: {
        eventType: input.eventType,
        txRef: input.txRef,
        chapaReference: input.chapaReference,
        dedupeKey: input.dedupeKey,
        payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return false;
    }
    throw error;
  }
}

function assistantStatusFromProvider(status: string): AssistantAccessStatus {
  if (status === 'success') return AssistantAccessStatus.active;
  if (status === 'pending') return AssistantAccessStatus.pending;
  if (status.includes('cancel')) return AssistantAccessStatus.cancelled;
  return AssistantAccessStatus.failed;
}

function consultationStatusFromProvider(
  status: string,
): ConsultationBookingStatus {
  if (status === 'success') return ConsultationBookingStatus.confirmed;
  if (status === 'pending') return ConsultationBookingStatus.pending_payment;
  if (status.includes('cancel')) return ConsultationBookingStatus.cancelled;
  return ConsultationBookingStatus.failed;
}

function buildTxRef(kind: 'assistant' | 'consultation'): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return `mediai-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function doctorDisplayName(doctor: {
  email: string;
  profile: {
    preferredName: string;
    professionalProfile: unknown;
  } | null;
}): string {
  const fullName = readObjectString(doctor.profile?.professionalProfile, 'fullName');
  return fullName ?? doctor.profile?.preferredName ?? doctor.email;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === 'string' && next.trim() !== '' ? next : null;
}

function readObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === 'string' && next.trim() !== '' ? next.trim() : null;
}

function safeHexEqual(a: string, b: string): boolean {
  try {
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
