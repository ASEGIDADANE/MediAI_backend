import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * In-process daily cap per authed user (UTC calendar day). Not distributed across replicas.
 * Set `CHAT_DAILY_CAP=0` (default) to disable. See README.
 * Check runs before the LLM call; success increments after a completed reply. Small races possible under parallel requests.
 */
@Injectable()
export class ChatQuotaService {
  private readonly cap: number;
  private readonly byUser = new Map<string, { day: string; count: number }>();

  constructor(config: ConfigService) {
    this.cap = Number(config.get('CHAT_DAILY_CAP', '0') || 0);
  }

  ensureCanSend(
    userId: string | undefined,
    route: 'personal' | 'general',
  ): void {
    void route;
    if (this.cap <= 0 || !userId) {
      return;
    }
    if (this.currentCount(userId) >= this.cap) {
      throw new HttpException(
        {
          error: 'daily_cap',
          message: `Chat daily limit reached (${this.cap} completed messages per day, UTC). Resets at midnight UTC.`,
          reset: 'next_utc_day',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordCompletedTurn(
    userId: string | undefined,
    route: 'personal' | 'general',
  ): void {
    void route;
    if (this.cap <= 0 || !userId) {
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const row = this.getOrNew(userId, day);
    row.count += 1;
  }

  private currentCount(userId: string): number {
    return this.getOrNew(userId, new Date().toISOString().slice(0, 10)).count;
  }

  private getOrNew(
    userId: string,
    day: string,
  ): { day: string; count: number } {
    let r = this.byUser.get(userId);
    if (!r || r.day !== day) {
      r = { day, count: 0 };
      this.byUser.set(userId, r);
    }
    return r;
  }
}
