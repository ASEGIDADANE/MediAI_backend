import type { HealthcareFacility } from '../generated/prisma/client';
import { HealthcareFacilityDto } from './dto/health-facility-response.dto';

export function toHealthcareFacilityDto(
  row: HealthcareFacility,
): HealthcareFacilityDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    address: row.address,
    phone: row.phone,
    rating: row.rating,
    verified: row.verified,
    latitude: row.latitude,
    longitude: row.longitude,
    openNow: row.openNow,
    source: 'directory',
  };
}
