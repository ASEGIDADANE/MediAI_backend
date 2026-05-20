import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import {
  AssistantAccessStatus,
  ConsultationType,
  ConsultationBookingStatus,
  NotificationType,
  OnboardingUserRole,
  SubscriptionInterval,
  SubscriptionStatus,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssistantAccessPlanListResponseDto,
  AssistantAccessPlanResponseDto,
  BillingConsultationSummaryDto,
  MeBillingResponseDto,
  MeSubscriptionResponseDto,
  SubscriptionPlanPublicListResponseDto,
  SubscriptionPlanPublicResponseDto,
} from './dto/payments.dto';
import { ChapaClient, type ChapaVerifyResult } from './chapa.client';
import { formatPaymentPrice } from './payment-format.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaClient,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
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
        // Same Chapa-allowed character set as above — avoid colons and
        // parentheses so the hosted receipt isn't rejected at initialize.
        description: `${plan.name} ${plan.durationDays} day personalized assistant access`,
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
      booking.status === ConsultationBookingStatus.confirmed ||
      booking.status === ConsultationBookingStatus.pending_doctor_approval ||
      booking.status === ConsultationBookingStatus.approved ||
      booking.status === ConsultationBookingStatus.completed
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

  // ===========================================================================
  // Phase 7 — SubscriptionPlan checkout (mirrors the assistant-access flow)
  // ===========================================================================
  //
  // Two-tier system:
  //   * Free plan       → no Chapa redirect; we upsert an active row server-side
  //                       so `getMySubscription` and the gate behave uniformly.
  //   * Lite / Pro / …  → standard Chapa initialize → patient redirected to the
  //                       hosted checkout → webhook/callback verifies and flips
  //                       `status: pending → active` with `endsAt` = startsAt +
  //                       interval. The chat gate honours the row.

  /**
   * Public — list every active SubscriptionPlan for the /pricing page. Returns
   * both monthly and yearly cents so the UI can render an interval toggle
   * without a second round-trip.
   */
  async listPublicSubscriptionPlans(): Promise<SubscriptionPlanPublicListResponseDto> {
    const rows = await this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((row) => this.toPublicSubscriptionPlanDto(row)) };
  }

  /**
   * Patient-facing snapshot of *their* current subscription. The personal-chat
   * banner uses this to render "Active until <date>" or "No active plan".
   */
  async getMySubscription(userId: string): Promise<MeSubscriptionResponseDto> {
    await this.expireStaleSubscriptions(userId);
    const [active, latest] = await this.prisma.$transaction([
      this.prisma.userSubscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.active,
          endsAt: { gt: new Date() },
        },
        include: { plan: true },
        orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.userSubscription.findFirst({
        where: { userId },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const sub = active ?? latest;
    return {
      active: Boolean(
        active &&
          active.status === SubscriptionStatus.active &&
          active.endsAt &&
          active.endsAt > new Date(),
      ),
      status: sub?.status ?? null,
      interval: sub?.interval ?? null,
      planId: sub?.plan.id ?? null,
      planName: sub?.plan.name ?? null,
      priceDisplay: sub
        ? formatPaymentPrice(sub.amountCents, sub.currency)
        : null,
      startsAt: sub?.startsAt?.toISOString() ?? null,
      endsAt: sub?.endsAt?.toISOString() ?? null,
      paidAt: sub?.paidAt?.toISOString() ?? null,
    };
  }

  /**
   * Start a Chapa checkout for a paid plan (Lite / Pro) — or, for the Free
   * plan, skip Chapa entirely and create an `active` row in place.
   *
   * The Chapa path mirrors `initiateAssistantPayment` exactly so the existing
   * `finalizeByVerifiedTransaction` plumbing (PaymentEvent dedupe, status
   * machine, etc.) picks it up without any new branches.
   */
  async initiateSubscriptionPayment(
    userId: string,
    planId: string,
    interval: SubscriptionInterval,
  ) {
    const [user, profile, plan] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, appRole: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { role: true },
      }),
      this.prisma.subscriptionPlan.findFirst({
        where: { id: planId, active: true },
      }),
    ]);

    if (!user || user.appRole !== UserAppRole.user) {
      throw new UnauthorizedException(
        'Only signed-in patients can subscribe to a plan.',
      );
    }
    if (!profile || profile.role !== OnboardingUserRole.personal) {
      throw new ForbiddenException(
        'Subscriptions are only available for personal patient accounts.',
      );
    }
    if (!plan) {
      throw new BadRequestException('Subscription plan not found.');
    }

    const priceCents =
      interval === SubscriptionInterval.yearly
        ? plan.yearlyPriceCents
        : plan.monthlyPriceCents;
    if (priceCents < 0) {
      throw new BadRequestException('Plan price is misconfigured.');
    }

    // --- Free plan: auto-grant, no Chapa redirect --------------------------
    //
    // We still write a `UserSubscription` row so `getMySubscription` and the
    // chat gate (when we later distinguish Free vs paid) read uniform data.
    // `endsAt` extends well past any reasonable user lifetime — "Free is
    // always on" — but we don't set it null so the same expiry sweep can
    // handle every row.
    if (priceCents === 0) {
      const startsAt = new Date();
      const endsAt = addInterval(startsAt, interval);
      const txRef = buildSubscriptionTxRef();
      const sub = await this.prisma.userSubscription.create({
        data: {
          userId,
          planId: plan.id,
          interval,
          status: SubscriptionStatus.active,
          txRef,
          amountCents: 0,
          currency: plan.currency,
          startsAt,
          endsAt,
          paidAt: startsAt,
        },
      });
      return {
        txRef,
        freeGranted: true,
        subscriptionId: sub.id,
      };
    }

    // --- Paid plan: Chapa redirect ----------------------------------------
    const txRef = buildSubscriptionTxRef();
    const sub = await this.prisma.userSubscription.create({
      data: {
        userId,
        planId: plan.id,
        interval,
        status: SubscriptionStatus.pending,
        txRef,
        amountCents: priceCents,
        currency: plan.currency,
      },
    });

    try {
      const checkout = await this.chapa.initializePayment({
        amountCents: priceCents,
        currency: plan.currency,
        email: user.email,
        txRef,
        callbackUrl: this.getCallbackUrl(),
        // Stamp `subscriptionId` into the return URL exactly like
        // consultations stamp `bookingId`. Chapa sandbox often drops
        // `tx_ref` on the way back, but the patient still lands on our
        // page with this id and can hit the authenticated finalize
        // endpoint, which re-verifies the stored `txRef` against Chapa.
        returnUrl: this.getReturnUrl('subscription', sub.id),
        title: 'MediAI Plan',
        // Chapa's customization fields only accept letters, numbers,
        // spaces, dots, hyphens, and underscores — no parentheses or
        // colons. Keep the human copy here in that subset so the
        // hosted receipt reads naturally; ChapaClient also defensively
        // strips disallowed characters in case a plan name slips a
        // colon or apostrophe in via the admin editor.
        description: `${plan.name} subscription billed ${interval}`,
        meta: {
          userId,
          subscriptionId: sub.id,
          interval,
          kind: 'subscription',
        },
      });
      await this.prisma.userSubscription.update({
        where: { id: sub.id },
        data: { chapaCheckoutUrl: checkout.checkoutUrl },
      });
      return {
        txRef,
        checkoutUrl: checkout.checkoutUrl,
        subscriptionId: sub.id,
      };
    } catch (error) {
      await this.prisma.userSubscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.failed },
      });
      throw error;
    }
  }

  /**
   * Personal-chat gate. Throws 403 unless the user has *either* an active
   * `UserSubscription` (Lite / Pro / etc.) *or* a still-valid legacy
   * `UserAssistantAccess` pass. Two checks because we're keeping the old
   * 30/90-day passes as a transitional fallback while existing users
   * naturally migrate to the new subscription model.
   *
   * Professionals bypass the gate (clinical assistant flows are not gated
   * by V1 billing).
   */
  async requireActiveSubscription(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (!profile) return;
    if (profile.role === OnboardingUserRole.professional) return;

    await Promise.all([
      this.expireStaleSubscriptions(userId),
      this.expireStaleAssistantAccess(userId),
    ]);

    const [subscription, assistant] = await this.prisma.$transaction([
      this.prisma.userSubscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.active,
          endsAt: { gt: new Date() },
          // Only paid plans unlock personal chat — a Free row exists so the
          // user has a record on file, but it must not satisfy the gate.
          amountCents: { gt: 0 },
        },
        select: { id: true },
      }),
      this.prisma.userAssistantAccess.findFirst({
        where: {
          userId,
          status: AssistantAccessStatus.active,
          endsAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (!subscription && !assistant) {
      throw new ForbiddenException(
        'Personalized health assistant access requires an active subscription.',
      );
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

  /**
   * Dev/sandbox fallback for the consultation flow.
   *
   * In production a successful Chapa payment fires either (a) a signed POST
   * to `/payments/chapa/webhook` or (b) the `callback_url` server-to-server
   * notification. Neither can reach `localhost` in dev, so the patient's
   * browser landing on `/payment/chapa/return?bookingId=...` needs a way to
   * say "go ahead and verify whatever payment was just made against this
   * booking I own".
   *
   * Trust model: the patient must be authenticated AND must own the booking.
   * We then load the txRef we stamped when initiate ran, ask Chapa's verify
   * API whether the transaction is `success`, and only on `success` do we
   * advance the booking — exactly the same code path the real webhook uses
   * (idempotent via the `paymentEvent` table), so calling this twice is a
   * no-op.
   */
  async finalizeConsultationByBookingId(
    userId: string,
    bookingId: string,
  ): Promise<{
    ok: true;
    status: ConsultationBookingStatus;
    paid: boolean;
  }> {
    const booking = await this.prisma.consultationBooking.findFirst({
      where: { id: bookingId, patientUserId: userId },
      select: { id: true, chapaTxRef: true, status: true, paidAt: true },
    });
    if (!booking) {
      throw new ForbiddenException('Consultation booking not found.');
    }
    if (!booking.chapaTxRef) {
      throw new BadRequestException(
        'No Chapa transaction has been started for this booking yet.',
      );
    }
    // If we've already advanced past pending_payment, the webhook/callback
    // must have already run — short-circuit so we don't burn a verify call.
    if (
      booking.paidAt ||
      booking.status !== ConsultationBookingStatus.pending_payment
    ) {
      return {
        ok: true,
        status: booking.status,
        paid: booking.paidAt !== null,
      };
    }
    await this.finalizeByVerifiedTransaction({
      txRef: booking.chapaTxRef,
      chapaReference: null,
      eventType: 'return.manual',
      payload: { bookingId: booking.id, userId },
    });
    const after = await this.prisma.consultationBooking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true, paidAt: true },
    });
    return {
      ok: true,
      status: after.status,
      paid: after.paidAt !== null,
    };
  }

  /**
   * Dev/sandbox fallback for the subscription flow — exact analogue of
   * `finalizeConsultationByBookingId`. Chapa's hosted checkout often
   * drops `tx_ref` from the return URL in sandbox mode, so the patient
   * lands on `/payment/chapa/return?kind=subscription&subscriptionId=…`
   * with no way for the public callback to verify anything. This route
   * takes that id, confirms the caller owns the subscription, and
   * re-runs the standard verify-and-advance path against the stored
   * `txRef`. Idempotent — the underlying `PaymentEvent` dedupe key
   * protects against double-calls, and we short-circuit if the row is
   * already active.
   */
  async finalizeSubscriptionBySubscriptionId(
    userId: string,
    subscriptionId: string,
  ): Promise<{
    ok: true;
    status: SubscriptionStatus;
    active: boolean;
  }> {
    const sub = await this.prisma.userSubscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { id: true, txRef: true, status: true, endsAt: true, paidAt: true },
    });
    if (!sub) {
      throw new ForbiddenException('Subscription not found.');
    }
    // Already advanced — return current state without burning a verify call.
    if (sub.paidAt || sub.status === SubscriptionStatus.active) {
      return {
        ok: true,
        status: sub.status,
        active:
          sub.status === SubscriptionStatus.active &&
          sub.endsAt !== null &&
          sub.endsAt > new Date(),
      };
    }
    await this.finalizeByVerifiedTransaction({
      txRef: sub.txRef,
      chapaReference: null,
      eventType: 'return.manual',
      payload: { subscriptionId: sub.id, userId },
    });
    const after = await this.prisma.userSubscription.findUniqueOrThrow({
      where: { id: sub.id },
      select: { status: true, endsAt: true },
    });
    return {
      ok: true,
      status: after.status,
      active:
        after.status === SubscriptionStatus.active &&
        after.endsAt !== null &&
        after.endsAt > new Date(),
    };
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

    // Capture the booking id from inside the transaction so we can fire
    // notifications *after* commit. Notifying inside the tx would (a) hold
    // a row lock across an outbound email round-trip, and (b) risk
    // committing a notification for a write that later rolled back.
    let advancedBookingId: string | null = null;

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

      // Phase 7 — SubscriptionPlan Chapa flow. Same shape as the assistant
      // pass: pending → active with `endsAt` stamped from the interval.
      const subscription = await tx.userSubscription.findUnique({
        where: { txRef: verified.txRef },
      });
      if (subscription) {
        await this.applySubscriptionVerification(
          tx,
          subscription,
          verified,
          reference,
        );
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
        const wasPendingPayment =
          booking.status === ConsultationBookingStatus.pending_payment &&
          !booking.paidAt;
        await this.applyConsultationVerification(tx, booking, verified, reference);
        if (wasPendingPayment) {
          advancedBookingId = booking.id;
        }
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

    if (advancedBookingId) {
      // Phase 6 — best-effort post-commit fan-out. Failures are logged
      // and swallowed so a flaky email service can't recurse into the
      // payment write path.
      void this.notifyBookingMovedToPendingApproval(advancedBookingId).catch(
        (err) => {
          this.logger.warn(
            `Failed to send post-payment notifications for booking=${advancedBookingId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        },
      );
    }
  }

  /**
   * Phase 6 — after a Chapa payment lands and the booking moves from
   * `pending_payment` → `pending_doctor_approval`, notify *both* sides:
   *
   *   * Patient: "we got your payment, the doctor will respond soon".
   *   * Doctor: "new consultation request waiting on you".
   *
   * Both via in-app + email. The doctor email is the one that genuinely
   * matters — they should respond quickly.
   */
  private async notifyBookingMovedToPendingApproval(
    bookingId: string,
  ): Promise<void> {
    const booking = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        patientUserId: true,
        topDoctorId: true,
        patient: {
          select: { profile: { select: { preferredName: true } } },
        },
        topDoctor: {
          select: { profile: { select: { preferredName: true } } },
        },
      },
    });
    if (!booking) return;
    if (booking.status !== ConsultationBookingStatus.pending_doctor_approval) {
      return;
    }

    const patientName =
      booking.patient?.profile?.preferredName?.trim() || 'A patient';
    const doctorName =
      booking.topDoctor?.profile?.preferredName?.trim() || 'your doctor';

    await this.notifications.enqueue({
      userId: booking.patientUserId,
      type: NotificationType.booking_paid,
      title: 'Payment received — waiting for the doctor',
      body: `Your payment is confirmed. ${doctorName} will review your request shortly.`,
      actionUrl: '/dashboard/consultations',
      metadata: { bookingId },
      channels: ['inApp', 'email'],
    });

    await this.notifications.enqueue({
      userId: booking.topDoctorId,
      type: NotificationType.booking_paid,
      title: 'New consultation request',
      body: `${patientName} paid for a consultation and is waiting on your approval.`,
      actionUrl: '/dashboard/booking-requests',
      metadata: { bookingId, patientUserId: booking.patientUserId },
      channels: ['inApp', 'email'],
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
    // Pre-Phase-3 bookings landed on `confirmed`; Phase-3 bookings land on
    // `pending_doctor_approval`. Either is "already paid" — exit early.
    if (
      booking.paidAt ||
      booking.status === ConsultationBookingStatus.confirmed ||
      booking.status === ConsultationBookingStatus.pending_doctor_approval ||
      booking.status === ConsultationBookingStatus.approved
    ) {
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
    // Non-terminal but not-yet-confirmed states (pending) just record progress.
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

    // Phase 3 — success path moves directly to `pending_doctor_approval` so
    // the doctor's `/booking-requests` inbox lights up. The patient's UI
    // treats both `paid` (transient) and `pending_doctor_approval` as
    // "payment OK, waiting for doctor".
    const paidAt = new Date();
    await tx.consultationBooking.update({
      where: { id: booking.id },
      data: {
        status: ConsultationBookingStatus.pending_doctor_approval,
        chapaReference: reference,
        paidAt,
      },
    });
  }

  /**
   * Chapa's sandbox is *very* loose about what its `/transaction/verify`
   * endpoint returns: amounts often come back as `0`, currencies as `null`,
   * etc., even on a successful test payment. Strict equality there would
   * reject every dev/test flow with "Verified payment amount does not
   * match." while telling us nothing useful about the actual transaction.
   *
   * We detect TEST mode via the secret-key prefix (`CHASECK_TEST-`) and
   * downgrade amount/currency mismatches to warnings in that mode. The
   * underlying `verified.status === 'success'` check still runs upstream
   * via `consultationStatusFromProvider`, so we don't accept failed or
   * pending transactions as paid. In production (live secret without the
   * `_TEST` infix) the checks remain strict.
   */
  private assertAmountCurrency(
    expectedAmountCents: number,
    expectedCurrency: string,
    verified: ChapaVerifyResult,
  ) {
    if (verified.status === '') {
      throw new BadRequestException('Verified payment status missing.');
    }
    const inTestMode = this.isChapaTestMode();
    if (verified.amountCents !== expectedAmountCents) {
      if (!inTestMode) {
        throw new BadRequestException('Verified payment amount does not match.');
      }
      this.logger.warn(
        `Chapa TEST mode: skipping amount mismatch (expected ${expectedAmountCents}, got ${verified.amountCents}).`,
      );
    }
    if (verified.currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      if (!inTestMode) {
        throw new BadRequestException('Verified payment currency does not match.');
      }
      this.logger.warn(
        `Chapa TEST mode: skipping currency mismatch (expected ${expectedCurrency}, got ${verified.currency || 'null'}).`,
      );
    }
  }

  private isChapaTestMode(): boolean {
    const key = this.config.get<string>('CHAPA_SECRET_KEY') ?? '';
    return key.startsWith('CHASECK_TEST-') || key.includes('_TEST-');
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

  private getReturnUrl(
    kind: 'assistant' | 'consultation' | 'subscription',
    id?: string,
  ) {
    const base =
      this.config.get<string>('CHAPA_RETURN_URL') ??
      `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/payment/chapa/return`;
    const url = new URL(base);
    url.searchParams.set('kind', kind);
    // `bookingId` for consultations, `subscriptionId` for subscriptions.
    // Both serve the same purpose: an "owned-by-this-user" id the return
    // page can post to the auth'd finalize route when Chapa drops the
    // tx_ref on the redirect (sandbox does this routinely).
    if (id) {
      if (kind === 'subscription') {
        url.searchParams.set('subscriptionId', id);
      } else if (kind === 'consultation') {
        url.searchParams.set('bookingId', id);
      }
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

  /**
   * Phase 7 — lazy expiry sweep for `UserSubscription`. Called on every read
   * path that depends on "is the user still subscribed?" so we never have to
   * run a background cron.
   */
  private async expireStaleSubscriptions(userId: string) {
    await this.prisma.userSubscription.updateMany({
      where: {
        userId,
        status: SubscriptionStatus.active,
        endsAt: { lt: new Date() },
      },
      data: { status: SubscriptionStatus.expired },
    });
  }

  /**
   * Apply a verified Chapa transaction to a `UserSubscription` row. Mirrors
   * `applyAssistantVerification` — the only difference is the duration
   * comes from the interval (monthly / yearly) rather than a plan-level
   * `durationDays` field.
   */
  private async applySubscriptionVerification(
    tx: Prisma.TransactionClient,
    subscription: {
      id: string;
      amountCents: number;
      currency: string;
      status: SubscriptionStatus;
      interval: SubscriptionInterval;
      paidAt: Date | null;
    },
    verified: ChapaVerifyResult,
    reference: string | null,
  ) {
    this.assertAmountCurrency(
      subscription.amountCents,
      subscription.currency,
      verified,
    );
    const nextStatus = subscriptionStatusFromProvider(verified.status);
    if (subscription.paidAt || subscription.status === SubscriptionStatus.active) {
      return;
    }
    if (nextStatus !== SubscriptionStatus.active) {
      await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          chapaReference: reference,
        },
      });
      return;
    }
    const startsAt = new Date();
    const endsAt = addInterval(startsAt, subscription.interval);
    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.active,
        chapaReference: reference,
        startsAt,
        endsAt,
        paidAt: startsAt,
      },
    });
  }

  private toPublicSubscriptionPlanDto(row: {
    id: string;
    name: string;
    description: string | null;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
    currency: string;
    features: Prisma.JsonValue;
    sortOrder: number;
  }): SubscriptionPlanPublicResponseDto {
    const features = Array.isArray(row.features)
      ? row.features.filter((f): f is string => typeof f === 'string')
      : [];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      monthlyPriceCents: row.monthlyPriceCents,
      yearlyPriceCents: row.yearlyPriceCents,
      monthlyPriceDisplay: formatPaymentPrice(
        row.monthlyPriceCents,
        row.currency,
      ),
      yearlyPriceDisplay: formatPaymentPrice(row.yearlyPriceCents, row.currency),
      currency: row.currency,
      features,
      // Free is identified by *both* prices being zero; we don't hard-code
      // the plan name so admins are free to rename "Free" without
      // breaking the auto-grant path.
      isFree: row.monthlyPriceCents === 0 && row.yearlyPriceCents === 0,
      sortOrder: row.sortOrder,
    };
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
    scheduledFor: Date | null;
    durationMinutes: number;
    meetingLink: string | null;
    meetingLinkSetAt: Date | null;
    createdAt: Date;
    topDoctor: {
      email: string;
      profile: {
        preferredName: string;
        professionalProfile: unknown;
      } | null;
    };
  }): BillingConsultationSummaryDto {
    // Phase 4 visibility gate: mirror the consultations service — only let
    // the patient see the meeting link once the booking has progressed past
    // the doctor's pending-decision window.
    const meetingLinkVisible =
      row.status === ConsultationBookingStatus.approved ||
      row.status === ConsultationBookingStatus.completed ||
      row.status === ConsultationBookingStatus.missed ||
      row.status === ConsultationBookingStatus.confirmed;
    const endsAt =
      row.scheduledFor && row.durationMinutes
        ? new Date(
            row.scheduledFor.getTime() + row.durationMinutes * 60_000,
          ).toISOString()
        : null;
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
      startsAt: row.scheduledFor?.toISOString() ?? null,
      endsAt,
      meetingLink: meetingLinkVisible ? row.meetingLink : null,
      meetingLinkSetAt:
        meetingLinkVisible && row.meetingLinkSetAt
          ? row.meetingLinkSetAt.toISOString()
          : null,
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

function buildSubscriptionTxRef(): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return `mediai-subscription-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function subscriptionStatusFromProvider(status: string): SubscriptionStatus {
  if (status === 'success') return SubscriptionStatus.active;
  if (status === 'pending') return SubscriptionStatus.pending;
  if (status.includes('cancel')) return SubscriptionStatus.cancelled;
  return SubscriptionStatus.failed;
}

/**
 * Add a billing interval to a base timestamp. Months use 30 days and years
 * use 365 days so the expiry sweep can do a single timestamp comparison
 * regardless of calendar quirks — the difference vs `+1 month` only ever
 * matters by ~1-2 days per year, and "the user got an extra day" is the
 * harmless direction to err in.
 */
function addInterval(base: Date, interval: SubscriptionInterval): Date {
  const days = interval === SubscriptionInterval.yearly ? 365 : 30;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
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
