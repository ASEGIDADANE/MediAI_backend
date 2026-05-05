import type { EducationResource } from '../generated/prisma/client';
import { toEducationResourceAdminDto, toEducationResourceDto } from './education.mapper';

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

describe('toEducationResourceAdminDto', () => {
  it('includes admin fields and ISO updatedAt', () => {
    const updated = new Date('2026-01-15T12:00:00.000Z');
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'glossary',
      title: 'G',
      description: 'D',
      bullets: ['x'],
      iconKey: null,
      published: false,
      sortOrder: 3,
      createdAt: new Date(),
      updatedAt: updated,
    } as EducationResource;
    const dto = toEducationResourceAdminDto(row);
    expect(dto.id).toBe(row.id);
    expect(dto.published).toBe(false);
    expect(dto.sortOrder).toBe(3);
    expect(dto.updatedAt).toBe('2026-01-15T12:00:00.000Z');
    expect(dto.iconKey).toBe('glossary');
  });
});
