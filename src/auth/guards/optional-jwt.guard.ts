import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExtractJwt } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveJwtSecret } from '../jwt-config.util';
import type { RequestUser } from '../decorators/current-user.decorator';

type RequestWithUser = { user?: RequestUser; headers: object };

/**
 * Attaches `user` to the request when a valid Bearer token is present; never throws
 * (use for public routes that may still need user id for throttling / abuse only).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<RequestWithUser>();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!token) {
      req.user = undefined;
      return true;
    }
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: resolveJwtSecret(this.config),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, appRole: true },
      });
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          appRole: user.appRole,
        };
      } else {
        req.user = undefined;
      }
    } catch {
      req.user = undefined;
    }
    return true;
  }
}
