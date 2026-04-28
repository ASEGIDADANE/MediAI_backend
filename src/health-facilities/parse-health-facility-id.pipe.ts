import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/** Max length for public API path param (stable ids like `fac-001`). */
export const HEALTH_FACILITY_ID_MAX_LENGTH = 64;

/**
 * Public facility ids are stable strings (e.g. `fac-001`), not UUIDs.
 * Pattern: `fac-` prefix + ASCII letters, digits, or hyphens (reduces path abuse).
 */
const HEALTH_FACILITY_ID_PATTERN = /^fac-[A-Za-z0-9-]+$/;

@Injectable()
export class ParseHealthFacilityIdPipe
  implements PipeTransform<string, string>
{
  transform(value: string, _metadata: ArgumentMetadata): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Facility id is required');
    }
    const id = value.trim();
    if (id.length > HEALTH_FACILITY_ID_MAX_LENGTH) {
      throw new BadRequestException('Facility id is too long');
    }
    if (!HEALTH_FACILITY_ID_PATTERN.test(id)) {
      throw new BadRequestException(
        'Invalid facility id format; use a stable id such as fac-001',
      );
    }
    return id;
  }
}
