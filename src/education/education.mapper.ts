import type { EducationResource } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { EducationResourceAdminResponseDto } from './dto/education-resource-admin-response.dto';
import { EducationResourceResponseDto } from './dto/education-resource-response.dto';

function asStringArray(bullets: Prisma.JsonValue): string[] {
  if (!Array.isArray(bullets)) {
    return [];
  }
  return bullets.filter((x) => typeof x === 'string');
}

export function toEducationResourceDto(
  row: EducationResource,
): EducationResourceResponseDto {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    bullets: asStringArray(row.bullets),
    iconKey: row.iconKey ?? row.slug,
  };
}

export function toEducationResourceAdminDto(
  row: EducationResource,
): EducationResourceAdminResponseDto {
  const base = toEducationResourceDto(row);
  return {
    id: row.id,
    slug: base.slug,
    title: base.title,
    description: base.description,
    bullets: base.bullets,
    iconKey: base.iconKey,
    published: row.published,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}
