import { SetMetadata } from '@nestjs/common';
import type { UserAppRole } from '../generated/prisma/client';

export const ROLES_KEY = 'mediai_roles';

export const Roles = (...roles: UserAppRole[]) => SetMetadata(ROLES_KEY, roles);
