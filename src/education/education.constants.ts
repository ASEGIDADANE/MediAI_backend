export const EDUCATION_SLUGS = [
  'symptom-guide',
  'glossary',
  'knowledge-base',
] as const;

export type EducationSlug = (typeof EDUCATION_SLUGS)[number];

export function isEducationSlug(s: string): s is EducationSlug {
  return (EDUCATION_SLUGS as readonly string[]).includes(s);
}
