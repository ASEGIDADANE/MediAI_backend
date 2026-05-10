import { ApiProperty } from '@nestjs/swagger';

export class ConsultationFeesDto {
  @ApiProperty({
    example: 490,
    description: 'Video consultation — USD whole dollars',
  })
  video!: number;

  @ApiProperty({
    example: 490,
    description: 'Written consultation — USD whole dollars',
  })
  written!: number;
}

export class TopDoctorEducationDto {
  @ApiProperty()
  degree!: string;

  @ApiProperty()
  year!: string;
}

export class TopDoctorExperienceItemDto {
  @ApiProperty()
  title!: string;

  @ApiProperty()
  subtitle!: string;
}

/** Matches MediAI `src/lib/top-doctors-content.ts` `TopDoctor`. */
export class TopDoctorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  specialty!: string;

  @ApiProperty()
  subSpecialty!: string;

  @ApiProperty()
  yearsOfExperience!: number;

  @ApiProperty()
  consultationFees!: ConsultationFeesDto;

  @ApiProperty()
  heroImageUrl!: string;

  @ApiProperty()
  education!: TopDoctorEducationDto;

  @ApiProperty({ type: [String] })
  biography!: string[];

  @ApiProperty({ type: [TopDoctorExperienceItemDto] })
  experience!: TopDoctorExperienceItemDto[];

  @ApiProperty({ type: [TopDoctorExperienceItemDto] })
  affiliations!: TopDoctorExperienceItemDto[];

  @ApiProperty()
  diseases!: string[];

  @ApiProperty()
  publicationsSummary!: string;
}

export class TopDoctorsListResponseDto {
  @ApiProperty({ type: [TopDoctorDto] })
  items!: TopDoctorDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class TopDoctorSpecialtiesResponseDto {
  @ApiProperty({ type: [String], description: 'Sorted distinct specialties' })
  specialties!: string[];
}
