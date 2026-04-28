import type { EducationResource } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { EducationResourceResponseDto } from './dto/education-resource-response.dto';

function asStringArray(bullets: Prisma.JsonValue): string[] {
  if (!Array.isArray(bullets)) {
    return [];
  }
  return bullets.filter((x) => typeof x === 'string') as string[];
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
