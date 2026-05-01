import type { BlogArticle } from '../generated/prisma/client';
import {
  BlogArticleAdminResponseDto,
  BlogArticleResponseDto,
  BlogSectionDto,
} from './dto/blog-article-response.dto';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Fallback when `dateDisplay` is null: matches style "Jan 07, 2025" from MediAI.
 */
export function formatBlogDateFromPublishedAt(publishedAt: Date): string {
  const m = MONTHS[publishedAt.getUTCMonth()];
  const day = publishedAt.getUTCDate().toString().padStart(2, '0');
  return `${m} ${day}, ${publishedAt.getUTCFullYear()}`;
}

function mapSections(row: BlogArticle): BlogSectionDto[] {
  const raw = row.sections;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (s): s is { title: string; body: string } =>
        s !== null &&
        typeof s === 'object' &&
        'title' in s &&
        'body' in s &&
        typeof (s as { title: unknown }).title === 'string' &&
        typeof (s as { body: unknown }).body === 'string',
    )
    .map((s) => ({ title: s.title, body: s.body }));
}

export function toBlogArticleDto(row: BlogArticle): BlogArticleResponseDto {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    author: row.author,
    date: row.dateDisplay ?? formatBlogDateFromPublishedAt(row.publishedAt),
    readTime: row.readTime,
    imageSrc: row.imageSrc,
    intro: row.intro,
    sections: mapSections(row),
  };
}

export function toBlogArticleAdminDto(row: BlogArticle): BlogArticleAdminResponseDto {
  return {
    ...toBlogArticleDto(row),
    published: row.published,
    publishedAt: row.publishedAt.toISOString(),
    dateDisplay: row.dateDisplay,
    sortOrder: row.sortOrder,
  };
}
