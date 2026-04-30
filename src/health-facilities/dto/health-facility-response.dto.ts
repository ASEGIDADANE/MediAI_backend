import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthcareFacilityType } from '../../generated/prisma/client';

export class HealthcareFacilityDto {
  @ApiProperty({ example: 'fac-001' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: HealthcareFacilityType })
  type: HealthcareFacilityType;

  @ApiProperty()
  address: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  rating?: number;

  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiPropertyOptional()
  openNow?: boolean;

  @ApiPropertyOptional({
    description:
      'Source of the row: `directory` for the in-house verified directory, `osm` for live OpenStreetMap data.',
    enum: ['directory', 'osm'],
  })
  source?: 'directory' | 'osm';

  @ApiPropertyOptional({
    description:
      'Distance from the requested `lat`/`lng` in kilometres, included only on geo-aware list calls.',
  })
  distanceKm?: number;
}

export class HealthFacilitiesListResponseDto {
  @ApiProperty({ type: [HealthcareFacilityDto] })
  items: HealthcareFacilityDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}
