import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from './current-user.decorator';

/**
 * Set when `OptionalJwtAuthGuard` validated a Bearer token; otherwise `undefined`.
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return request.user;
  },
);
