import { toTopDoctorDto } from './top-doctors.mapper';
import type { TopDoctor } from '../generated/prisma/client';

describe('toTopDoctorDto', () => {
  it('maps Prisma row to MediAI TopDoctor shape', () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Dr. Test',
      role: 'Oncologist',
      specialty: 'Oncology',
      subSpecialty: 'Medical Oncology',
      yearsOfExperience: 10,
      videoFee: 100,
      writtenFee: 200,
      heroImageUrl: '/x.png',
      educationDegree: 'MD',
      educationYear: '2010',
      publicationsSummary: 'Many papers',
      diseases: ['A', 'B'],
      biography: ['p1', 'p2'],
      experience: [{ title: 'T', subtitle: 'S' }],
      affiliations: [{ title: 'A', subtitle: 'B' }],
      published: true,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TopDoctor;

    const dto = toTopDoctorDto(row);
    expect(dto.id).toBe(row.id);
    expect(dto.consultationFees).toEqual({ video: 100, written: 200 });
    expect(dto.education).toEqual({ degree: 'MD', year: '2010' });
    expect(dto.diseases).toEqual(['A', 'B']);
    expect(dto.experience[0]).toEqual({ title: 'T', subtitle: 'S' });
  });
});
