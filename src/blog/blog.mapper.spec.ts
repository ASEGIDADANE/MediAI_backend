import type { BlogArticle } from '../generated/prisma/client';
import { formatBlogDateFromPublishedAt, toBlogArticleDto } from './blog.mapper';

describe('blog.mapper', () => {
  it('formatBlogDateFromPublishedAt (UTC)', () => {
    const d = new Date(Date.UTC(2025, 0, 7));
    expect(formatBlogDateFromPublishedAt(d)).toBe('Jan 07, 2025');
  });

  it('toBlogArticleDto uses dateDisplay when set', () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'T',
      category: 'C',
      author: 'A',
      readTime: '1 min',
      imageSrc: '/x.png',
      intro: 'i',
      sections: [{ title: 'S', body: 'B' }],
      published: true,
      publishedAt: new Date('2025-06-01T00:00:00.000Z'),
      dateDisplay: 'Custom',
      sortOrder: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BlogArticle;
    const dto = toBlogArticleDto(row);
    expect(dto.date).toBe('Custom');
  });
});
