import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserAppRole } from '../../generated/prisma/client';

export type RequestUser = { id: string; email: string; appRole: UserAppRole };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
