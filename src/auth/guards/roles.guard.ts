import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserAppRole } from '../../generated/prisma/client';
import { ROLES_KEY } from '../roles.decorator';
import { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      UserAppRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser; headers?: Record<string, string> }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException();
    }
    if (!required.includes(user.appRole)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
