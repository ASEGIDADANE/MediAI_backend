import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DATABASE_UNAVAILABLE_USER_MESSAGE } from './constants/database-unavailable.message';
import { Prisma } from './generated/prisma/client';
import { AppService } from './app.service';
import { isDatabaseUnavailablePrismaError } from './prisma/is-database-unavailable-prisma-error';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Root health / welcome' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/database')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Verify database connectivity (for sign-in preflight / ops)',
  })
  async getDatabaseHealth(): Promise<{ ok: true }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true as const };
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        isDatabaseUnavailablePrismaError(e)
      ) {
        throw new ServiceUnavailableException(DATABASE_UNAVAILABLE_USER_MESSAGE);
      }
      throw e;
    }
  }
}
