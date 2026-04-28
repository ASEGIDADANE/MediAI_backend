import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty()
  phone: string;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty()
  openNow: boolean;
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
