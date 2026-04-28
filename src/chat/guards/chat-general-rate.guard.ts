import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { HttpException, HttpStatus } from '@nestjs/common';

type Hit = { count: number; windowStart: number };

/**
 * In-memory per-minute limit for `POST /chat/general/*`: stricter for anonymous (IP) than for authenticated userId.
 * Not distributed across multiple app instances; document in README. Trust `X-Forwarded-For` only behind a **trusted** proxy.
 */
@Injectable()
export class ChatGeneralRateGuard implements CanActivate {
  private readonly store = new Map<string, Hit>();
  private readonly windowMs = 60_000;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const authRpm = Number(
      this.config.get('CHAT_AUTH_GENERAL_RPM', '40') || 40,
    );
    const anonRpm = Number(
      this.config.get('CHAT_ANON_GENERAL_RPM', '20') || 20,
    );
    const req = context.switchToHttp().getRequest<
      Request & { user?: { id: string } }
    >();
    const user = req.user;
    const limit = user ? authRpm : anonRpm;
    const key = user
      ? `g:u:${user.id}`
      : `g:ip:${this.getClientIp(req)}`;
    const now = Date.now();
    let h = this.store.get(key);
    if (!h || now - h.windowStart >= this.windowMs) {
      h = { count: 0, windowStart: now };
      this.store.set(key, h);
    }
    h.count += 1;
    if (h.count > limit) {
      throw new HttpException(
        'Too many general chat requests, try again in a minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private getClientIp(req: Request): string {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) {
      return xf.split(',')[0]!.trim();
    }
    if (Array.isArray(xf) && xf[0]) {
      return String(xf[0]).split(',')[0]!.trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}
