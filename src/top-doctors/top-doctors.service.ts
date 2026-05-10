import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OnboardingUserRole,
  Prisma,
  ProfessionalVerificationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTopDoctorBodyDto,
  PatchTopDoctorBodyDto,
} from './dto/admin-top-doctor-body.dto';
import {
  takeSkipTopDoctors,
  TopDoctorsQueryDto,
} from './dto/top-doctors-query.dto';
import { toTopDoctorDto } from './top-doctors.mapper';
import { userProfileRowToTopDoctorDto } from './user-profile-to-top-doctor.mapper';

@Injectable()
export class TopDoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /* -------------------------------------------------------------------- */
  /*  Public read — sourced from verified registered professionals         */
  /* -------------------------------------------------------------------- */

  /**
   * The public Top Doctors list now reflects real registered doctors whose
   * accounts have been admin-verified. The legacy `TopDoctor` brochure table
   * is no longer queried for public reads (it is left in place so existing
   * admin/CRUD endpoints + migrations don't break, but its rows will not
   * appear on the public page).
   *
   * `q` matches on the doctor's `preferredName` or on the JSON `specialty`
   * field. `specialty` filter does an exact (case-insensitive) match on the
   * JSON `specialty` field.
   */
  async listPublic(dto: TopDoctorsQueryDto) {
    const { take, skip, page, pageSize } = takeSkipTopDoctors(
      dto.page,
      dto.pageSize,
    );
    const specialty = dto.specialty?.trim();
    const q = dto.q?.trim().slice(0, 120);

    const where: Prisma.UserProfileWhereInput = {
      role: OnboardingUserRole.professional,
      verificationStatus: ProfessionalVerificationStatus.verified,
      ...(specialty
        ? {
            professionalProfile: {
              path: ['specialty'],
              string_contains: specialty,
              mode: 'insensitive',
            } as unknown as Prisma.JsonNullableFilter,
          }
        : {}),
      ...(q
        ? {
            OR: [
              { preferredName: { contains: q, mode: 'insensitive' } },
              {
                professionalProfile: {
                  path: ['specialty'],
                  string_contains: q,
                  mode: 'insensitive',
                } as unknown as Prisma.JsonNullableFilter,
              },
              {
                professionalProfile: {
                  path: ['fullName'],
                  string_contains: q,
                  mode: 'insensitive',
                } as unknown as Prisma.JsonNullableFilter,
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.userProfile.findMany({
        where,
        orderBy: [{ verificationReviewedAt: 'desc' }, { preferredName: 'asc' }],
        take,
        skip,
        select: {
          userId: true,
          preferredName: true,
          professionalProfile: true,
        },
      }),
      this.prisma.userProfile.count({ where }),
    ]);

    return {
      items: rows.map(userProfileRowToTopDoctorDto),
      page,
      pageSize,
      total,
    };
  }

  async getPublicById(id: string) {
    const row = await this.prisma.userProfile.findFirst({
      where: {
        userId: id,
        role: OnboardingUserRole.professional,
        verificationStatus: ProfessionalVerificationStatus.verified,
      },
      select: {
        userId: true,
        preferredName: true,
        professionalProfile: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Top doctor not found');
    }
    return userProfileRowToTopDoctorDto(row);
  }

  async listSpecialties(): Promise<string[]> {
    // Pull the `specialty` field out of every verified professional's JSON.
    // Done in JS because Prisma cannot `distinct` on a JSON path.
    const rows = await this.prisma.userProfile.findMany({
      where: {
        role: OnboardingUserRole.professional,
        verificationStatus: ProfessionalVerificationStatus.verified,
      },
      select: { professionalProfile: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      const v = r.professionalProfile;
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as Record<string, unknown>).specialty === 'string'
      ) {
        const s = ((v as Record<string, unknown>).specialty as string).trim();
        if (s !== '') set.add(s);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  bodyToPrismaData(d: CreateTopDoctorBodyDto): Prisma.TopDoctorCreateInput {
    const toJson = (v: unknown): Prisma.InputJsonValue =>
      JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
    return {
      name: d.name,
      role: d.role,
      specialty: d.specialty,
      subSpecialty: d.subSpecialty,
      yearsOfExperience: d.yearsOfExperience,
      videoFee: d.consultationFees.video,
      writtenFee: d.consultationFees.written,
      heroImageUrl: d.heroImageUrl,
      educationDegree: d.education.degree,
      educationYear: d.education.year,
      publicationsSummary: d.publicationsSummary,
      diseases: toJson(d.diseases),
      biography: toJson(d.biography),
      experience: toJson(d.experience),
      affiliations: toJson(d.affiliations),
      published: d.published ?? true,
      sortOrder: d.sortOrder ?? null,
    };
  }

  async createByAdmin(dto: CreateTopDoctorBodyDto) {
    const row = await this.prisma.topDoctor.create({
      data: this.bodyToPrismaData(dto),
    });
    return toTopDoctorDto(row);
  }

  async patchByAdmin(id: string, dto: PatchTopDoctorBodyDto) {
    const existing = await this.prisma.topDoctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Top doctor not found');
    }

    const data: Prisma.TopDoctorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.specialty !== undefined) data.specialty = dto.specialty;
    if (dto.subSpecialty !== undefined) data.subSpecialty = dto.subSpecialty;
    if (dto.yearsOfExperience !== undefined) {
      data.yearsOfExperience = dto.yearsOfExperience;
    }
    if (dto.consultationFees !== undefined) {
      data.videoFee = dto.consultationFees.video;
      data.writtenFee = dto.consultationFees.written;
    }
    if (dto.heroImageUrl !== undefined) data.heroImageUrl = dto.heroImageUrl;
    if (dto.education !== undefined) {
      data.educationDegree = dto.education.degree;
      data.educationYear = dto.education.year;
    }
    if (dto.biography !== undefined) {
      data.biography = JSON.parse(
        JSON.stringify(dto.biography),
      ) as Prisma.InputJsonValue;
    }
    if (dto.experience !== undefined) {
      data.experience = JSON.parse(
        JSON.stringify(dto.experience),
      ) as Prisma.InputJsonValue;
    }
    if (dto.affiliations !== undefined) {
      data.affiliations = JSON.parse(
        JSON.stringify(dto.affiliations),
      ) as Prisma.InputJsonValue;
    }
    if (dto.diseases !== undefined) {
      data.diseases = JSON.parse(
        JSON.stringify(dto.diseases),
      ) as Prisma.InputJsonValue;
    }
    if (dto.publicationsSummary !== undefined) {
      data.publicationsSummary = dto.publicationsSummary;
    }
    if (dto.published !== undefined) data.published = dto.published;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const row = await this.prisma.topDoctor.update({ where: { id }, data });
    return toTopDoctorDto(row);
  }

  async softDeleteByAdmin(id: string) {
    const existing = await this.prisma.topDoctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Top doctor not found');
    }
    await this.prisma.topDoctor.update({
      where: { id },
      data: { published: false },
    });
  }
}
