import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DATABASE_UNAVAILABLE_USER_MESSAGE } from '../constants/database-unavailable.message';
import { Prisma } from '../generated/prisma/client';
import { isDatabaseUnavailablePrismaError } from '../prisma/is-database-unavailable-prisma-error';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host
      .switchToHttp()
      .getResponse<{ status: (c: number) => { json: (b: unknown) => void } }>();
    if (isDatabaseUnavailablePrismaError(exception)) {
      this.logger.warn(`Prisma ${exception.code}: ${exception.message}`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: DATABASE_UNAVAILABLE_USER_MESSAGE,
      });
    }
    this.logger.error(exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  }
}
