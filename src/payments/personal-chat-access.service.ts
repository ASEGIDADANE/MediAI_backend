import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssistantAccessStatus,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PersonalTrialSnapshot = {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

export type PersonalChatAccessState = {
  paidActive: boolean;
  trial: PersonalTrialSnapshot;
  personalChatAllowed: boolean;
  personalChatReadOnly: boolean;
};

@Injectable()
export class PersonalChatAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getTrialConfig(): { enabled: boolean; limit: number } {
    const enabled =
      this.config.get<string>('ASSISTANT_TRIAL_ENABLED', 'true') === 'true';
    const limit = Math.max(
      0,
      Number(this.config.get('ASSISTANT_TRIAL_LIMIT', '3') || 3),
    );
    return { enabled, limit };
  }

  async getAccessState(userId: string): Promise<PersonalChatAccessState> {
    const { enabled, limit } = this.getTrialConfig();
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        role: true,
        personalTrialMessagesUsed: true,
        personalTrialExhaustedAt: true,
      },
    });

    if (profile?.role === OnboardingUserRole.professional) {
      return {
        paidActive: false,
        trial: this.trialSnapshot(enabled, limit, 0),
        personalChatAllowed: true,
        personalChatReadOnly: false,
      };
    }

    const paidActive = await this.hasActivePaidPass(userId);
    const used = profile?.personalTrialMessagesUsed ?? 0;
    const trial = this.trialSnapshot(enabled, limit, used);

    if (paidActive) {
      return {
        paidActive: true,
        trial,
        personalChatAllowed: true,
        personalChatReadOnly: false,
      };
    }

    if (!enabled) {
      return {
        paidActive: false,
        trial: { ...trial, enabled: false, remaining: 0, exhausted: true },
        personalChatAllowed: false,
        personalChatReadOnly: false,
      };
    }

    const personalChatAllowed = trial.remaining > 0;
    const personalChatReadOnly = trial.exhausted;

    return {
      paidActive: false,
      trial,
      personalChatAllowed,
      personalChatReadOnly,
    };
  }

  /** List or load personal threads (read-only allowed after trial exhausted). */
  async assertCanReadPersonalChatHistory(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (profile?.role === OnboardingUserRole.professional) {
      return;
    }

    const state = await this.getAccessState(userId);
    if (state.paidActive || state.personalChatAllowed || state.personalChatReadOnly) {
      return;
    }

    this.throwPaymentRequired(state.trial);
  }

  async assertCanSendPersonalMessage(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (profile?.role === OnboardingUserRole.professional) {
      return;
    }

    const state = await this.getAccessState(userId);
    if (state.paidActive || state.personalChatAllowed) {
      return;
    }

    if (state.personalChatReadOnly) {
      this.throwTrialExhausted(state.trial);
    }

    this.throwPaymentRequired(state.trial);
  }

  /**
   * Consume one trial credit after a successful personal self-chat turn.
   * No-op for professionals, paid users, or clinical (doctor→patient) chats.
   */
  async recordTrialUsageIfNeeded(userId: string): Promise<void> {
    const { enabled, limit } = this.getTrialConfig();
    if (!enabled || limit <= 0) {
      return;
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (
      !profile ||
      profile.role !== OnboardingUserRole.personal ||
      (await this.hasActivePaidPass(userId))
    ) {
      return;
    }

    const updated = await this.prisma.userProfile.updateMany({
      where: {
        userId,
        personalTrialMessagesUsed: { lt: limit },
      },
      data: {
        personalTrialMessagesUsed: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return;
    }

    const row = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        personalTrialMessagesUsed: true,
        personalTrialExhaustedAt: true,
      },
    });
    if (
      row &&
      row.personalTrialMessagesUsed >= limit &&
      !row.personalTrialExhaustedAt
    ) {
      await this.prisma.userProfile.update({
        where: { userId },
        data: { personalTrialExhaustedAt: new Date() },
      });
    }
  }

  private async hasActivePaidPass(userId: string): Promise<boolean> {
    await this.expireStaleAssistantAccess(userId);
    const active = await this.prisma.userAssistantAccess.findFirst({
      where: {
        userId,
        status: AssistantAccessStatus.active,
        endsAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(active);
  }

  private async expireStaleAssistantAccess(userId: string): Promise<void> {
    await this.prisma.userAssistantAccess.updateMany({
      where: {
        userId,
        status: AssistantAccessStatus.active,
        endsAt: { lte: new Date() },
      },
      data: { status: AssistantAccessStatus.expired },
    });
  }

  private trialSnapshot(
    enabled: boolean,
    limit: number,
    used: number,
  ): PersonalTrialSnapshot {
    const cappedUsed = Math.min(used, limit);
    const remaining = enabled ? Math.max(0, limit - cappedUsed) : 0;
    return {
      enabled,
      limit,
      used: cappedUsed,
      remaining,
      exhausted: enabled ? cappedUsed >= limit : true,
    };
  }

  private throwTrialExhausted(trial: PersonalTrialSnapshot): never {
    throw new ForbiddenException({
      statusCode: 403,
      message:
        'You have used all free personalized chats. Purchase an assistant pass to continue.',
      error: 'assistant_trial_exhausted',
      trial: {
        limit: trial.limit,
        used: trial.used,
        remaining: 0,
      },
    });
  }

  private throwPaymentRequired(trial: PersonalTrialSnapshot): never {
    throw new ForbiddenException({
      statusCode: 403,
      message:
        'Personalized health assistant access requires an active payment or free trial.',
      error: 'assistant_payment_required',
      trial: {
        limit: trial.limit,
        used: trial.used,
        remaining: trial.remaining,
      },
    });
  }
}
