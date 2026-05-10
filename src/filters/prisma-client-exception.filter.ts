import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const DB_DOWN_CODES = new Set(['P1000', 'P1001', 'P1017']);

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host
      .switchToHttp()
      .getResponse<{ status: (c: number) => { json: (b: unknown) => void } }>();
    if (DB_DOWN_CODES.has(exception.code)) {
      this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message:
          'Database is unavailable. Ensure PostgreSQL is running and DATABASE_URL ' +
          'user/password match your server (e.g. password for role `medi_ai`).',
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
