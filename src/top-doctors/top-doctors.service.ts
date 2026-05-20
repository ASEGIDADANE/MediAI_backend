import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConditionCategory,
  ConsultationType,
  MedicalSpecialty,
  OnboardingUserRole,
  Prisma,
  ProfessionalVerificationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONDITION_CATEGORY_LABELS,
  MEDICAL_SPECIALTY_LABELS,
  specialtiesForConditions,
} from '../consultations/consultation-matching.constants';
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

/**
 * Best-effort coercion of `DoctorCapacity.acceptedConsultationTypes` (Prisma
 * JSON) into a typed array of `ConsultationType`. Unknown / malformed values
 * are stripped — an invalid entry shouldn't break the listing.
 */
function parseAcceptedConsultationTypes(
  value: Prisma.JsonValue | null,
): ConsultationType[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(Object.values(ConsultationType));
  const out: ConsultationType[] = [];
  for (const v of value) {
    if (typeof v === 'string' && allowed.has(v)) {
      out.push(v as ConsultationType);
    }
  }
  return out;
}

/**
 * Score how strongly the doctor's `acceptedConsultationTypes` opt-in matches
 * the patient's requested consultation type:
 *   * `2` — doctor explicitly listed this type.
 *   * `1` — doctor accepts everything (empty array — the default).
 *   * `0` — doctor opted into a different non-empty subset.
 */
function scoreConsultationOptIn(
  accepted: ConsultationType[],
  requested: ConsultationType,
): number {
  if (accepted.length === 0) return 1;
  return accepted.includes(requested) ? 2 : 0;
}

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
   * Phase 5 — accepts an optional `callerUserId` so we can infer the
   * patient's region + primary conditions from their profile when those are
   * not passed explicitly. Anonymous calls still work; they just don't get
   * the `inRegion` / `matchesConditions` enrichment.
   *
   * Filter precedence:
   *   1. `medicalSpecialties[]` (explicit) — strict `IN (...)` filter.
   *   2. `conditions[]` (or patient's saved `primaryConditions`) — expanded
   *      to specialties via `CONDITION_TO_SPECIALTIES`, then strict `IN`.
   *   3. Legacy `specialty` free-text — case-insensitive substring on the
   *      doctor's `professionalProfile.specialty` JSON path. Kept for
   *      backward compat with the existing dropdown on `/dashboard/top-
   *      doctors`.
   *
   * Sort order:
   *   * `inRegion = true` first (when caller has a region),
   *   * then `matchesConditions = true` (when a condition filter is active),
   *   * then DB-side fallback (`verificationReviewedAt desc, preferredName`).
   *
   * The first two are computed in JS after the DB returns the page; this is
   * slightly imperfect for cross-page sorting but completely correct for
   * the top page that 99% of patients ever look at.
   */
  async listPublic(dto: TopDoctorsQueryDto, callerUserId?: string | null) {
    const { take, skip, page, pageSize } = takeSkipTopDoctors(
      dto.page,
      dto.pageSize,
    );
    const specialty = dto.specialty?.trim();
    const q = dto.q?.trim().slice(0, 120);

    // Resolve the caller's region + (optional) condition preferences for
    // ranking. We only pull this for *personal* callers — a doctor browsing
    // the Top Doctors page shouldn't get their own region/conditions
    // applied as filters.
    const callerContext = callerUserId
      ? await this.resolveCallerContext(callerUserId)
      : null;

    // Decide which specialty set (if any) to filter on.
    const explicitSpecialties = dto.medicalSpecialties?.length
      ? dto.medicalSpecialties
      : null;
    const conditionInput =
      dto.conditions?.length
        ? dto.conditions
        : callerContext?.primaryConditions ?? null;
    const conditionSpecialties = explicitSpecialties
      ? null
      : specialtiesForConditions(conditionInput);
    const matchingSpecialties: MedicalSpecialty[] | null =
      explicitSpecialties ?? conditionSpecialties;
    // The badge / sort is "active" whenever we have *anything* to match
    // against — including the patient's saved `primaryConditions`. This is
    // what makes the badge appear automatically the first time a patient
    // who has filled in their concerns opens /top-doctors, with no extra
    // UI affordance.
    const conditionFilterActive =
      (dto.conditions?.length ?? 0) > 0 ||
      (dto.medicalSpecialties?.length ?? 0) > 0 ||
      (callerContext?.primaryConditions.length ?? 0) > 0;

    const callerRegion =
      (dto.region?.trim() || callerContext?.region || '').toLowerCase() || null;

    const where: Prisma.UserProfileWhereInput = {
      role: OnboardingUserRole.professional,
      verificationStatus: ProfessionalVerificationStatus.verified,
      ...(matchingSpecialties && matchingSpecialties.length > 0
        ? { medicalSpecialty: { in: matchingSpecialties } }
        : {}),
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
          region: true,
          medicalSpecialty: true,
          verificationReviewedAt: true,
          professionalProfile: true,
          user: {
            select: {
              capacity: {
                select: { acceptedConsultationTypes: true },
              },
            },
          },
        },
      }),
      this.prisma.userProfile.count({ where }),
    ]);

    const matchingSpecialtySet = new Set<MedicalSpecialty>(
      matchingSpecialties ?? [],
    );

    const enriched = rows.map((row) => {
      const accepted = parseAcceptedConsultationTypes(
        row.user?.capacity?.acceptedConsultationTypes ?? null,
      );
      const inRegion =
        callerRegion !== null && row.region.toLowerCase() === callerRegion;
      const matchesConditions =
        conditionFilterActive &&
        row.medicalSpecialty !== null &&
        matchingSpecialtySet.has(row.medicalSpecialty);
      return {
        row,
        accepted,
        inRegion,
        matchesConditions,
      };
    });

    // In-page re-sort. Stable: equal keys preserve the DB order
    // (verificationReviewedAt desc → preferredName asc).
    enriched.sort((a, b) => {
      if (callerRegion !== null) {
        if (a.inRegion !== b.inRegion) return a.inRegion ? -1 : 1;
      }
      if (conditionFilterActive) {
        if (a.matchesConditions !== b.matchesConditions) {
          return a.matchesConditions ? -1 : 1;
        }
      }
      // Phase 5 — soft consultation-type filter. Doctors who *explicitly*
      // accept the requested type rank above those who haven't declared
      // (empty array = "accepts all", which we treat as neutral, not
      // explicit). Doctors who declared a different set go last.
      if (dto.consultationType) {
        const aOpt = scoreConsultationOptIn(a.accepted, dto.consultationType);
        const bOpt = scoreConsultationOptIn(b.accepted, dto.consultationType);
        if (aOpt !== bOpt) return bOpt - aOpt;
      }
      return 0;
    });

    return {
      items: enriched.map(({ row, accepted, inRegion, matchesConditions }) =>
        userProfileRowToTopDoctorDto({
          userId: row.userId,
          preferredName: row.preferredName,
          professionalProfile: row.professionalProfile,
          medicalSpecialty: row.medicalSpecialty,
          region: row.region,
          acceptedConsultationTypes: accepted,
          // Only attach the badges when the caller supplied enough context
          // for them to mean something.
          ...(callerRegion !== null ? { inRegion } : {}),
          ...(conditionFilterActive ? { matchesConditions } : {}),
        } as Parameters<typeof userProfileRowToTopDoctorDto>[0] & {
          inRegion?: boolean;
          matchesConditions?: boolean;
        }),
      ),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Helper: load just the bits of the caller's profile that influence
   * ranking. Returns null when the caller isn't a personal user — we
   * deliberately don't infer any context for doctors browsing.
   */
  private async resolveCallerContext(callerUserId: string): Promise<{
    region: string | null;
    primaryConditions: ConditionCategory[];
  } | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: {
        role: true,
        region: true,
        primaryConditions: true,
      },
    });
    if (!profile) return null;
    if (profile.role !== OnboardingUserRole.personal) return null;
    return {
      region: profile.region || null,
      primaryConditions: profile.primaryConditions ?? [],
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
        region: true,
        medicalSpecialty: true,
        professionalProfile: true,
        user: {
          select: {
            capacity: {
              select: { acceptedConsultationTypes: true },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Top doctor not found');
    }
    return userProfileRowToTopDoctorDto({
      userId: row.userId,
      preferredName: row.preferredName,
      professionalProfile: row.professionalProfile,
      medicalSpecialty: row.medicalSpecialty,
      region: row.region,
      acceptedConsultationTypes: parseAcceptedConsultationTypes(
        row.user?.capacity?.acceptedConsultationTypes ?? null,
      ),
    });
  }

  /**
   * Phase 5 — option lists for the matching pickers. Returned eagerly (no
   * DB hit; the data is static) so the frontend can load both pickers in
   * one round-trip while the rest of the page renders.
   */
  getMatchOptions() {
    return {
      conditionCategories: Object.entries(CONDITION_CATEGORY_LABELS).map(
        ([value, label]) => ({ value, label }),
      ),
      medicalSpecialties: Object.entries(MEDICAL_SPECIALTY_LABELS).map(
        ([value, label]) => ({ value, label }),
      ),
    };
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
