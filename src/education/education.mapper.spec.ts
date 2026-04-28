import type { EducationResource } from '../generated/prisma/client';
import { toEducationResourceDto } from './education.mapper';

describe('toEducationResourceDto', () => {
  it('maps entity and coerces bullets', () => {
    const row = {
      id: 'a',
      slug: 'glossary',
      title: 'G',
      description: 'D',
      bullets: ['a', 'b', 1, 'c'] as unknown,
      iconKey: 'glossary',
      published: true,
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EducationResource;
    const dto = toEducationResourceDto(row);
    expect(dto.bullets).toEqual(['a', 'b', 'c']);
    expect(dto.iconKey).toBe('glossary');
  });
});
