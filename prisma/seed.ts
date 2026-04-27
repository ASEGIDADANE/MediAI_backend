import { Prisma, PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

export async function main() {
  const count = await prisma.topDoctor.count();
  if (count > 0) {
    console.log('Seeded top doctors already present; skip.');
    return;
  }

  await prisma.topDoctor.create({
    data: {
      name: 'Dr. Ashenafi',
      role: 'Oncologist',
      specialty: 'Oncology',
      subSpecialty: 'Medical Oncology, Hematologic Oncology',
      yearsOfExperience: 24,
      videoFee: 490,
      writtenFee: 490,
      heroImageUrl: '/sample_doc_photo.png',
      educationDegree: 'MD: University of Zurich',
      educationYear: '2001',
      diseases: [
        'Skin Cancers',
        'Thyroid Disorders',
        'Breast Cancer',
        'Lung Cancer',
        'Head and Neck Cancer',
        'Lymphoma',
        'Myeloma',
        'Leukemia',
      ] as Prisma.JsonValue,
      biography: [
        "Dr. Ashenafi is an experienced medical professional with a specialization in tumors of the upper respiratory tract, skin tumors, modern immunotherapies, and hematology. Broad cancer and rare tumors complete his knowledge.",
        'Currently, Dr. Ashenafi is the Chief Physician at the Swiss Cancer Services AG/Seeland Cancer Center in Hirslanden Klinik Linde, Biel, Switzerland. Previously, he worked as the Head of the Interdisciplinary Cancerology Service at Riviera-Chablais Hospital, where he served from 2019 to 2020.',
        "Dr. Ashenafi has held various leadership positions in his career. From 2009 to 2018, he was the Disease Leader for Head and Neck Cancer and Thyroid Cancer. Additionally, he was the Disease Leader for Skin Cancers and Melanoma from 2012 to 2018.",
        "Dr. Ashenafi is a member of numerous national and international scientific societies and associations. He is a founding member and board member of the Swiss Head and Neck Society and the President of the Head and Neck Cancer Working Group.",
      ] as Prisma.JsonValue,
      experience: [
        {
          title: 'Head of the Interdisciplinary Cancerology Service, Riviera-Chablais Hospital',
          subtitle: 'Rennaz, Switzerland. 2019 - 2020',
        },
      ] as Prisma.JsonValue,
      affiliations: [
        {
          title: 'President of the Head and Neck Cancer Working Group',
          subtitle: 'Since 2016',
        },
      ] as Prisma.JsonValue,
      publicationsSummary: 'Dr. Ashenafi has more than 40 publications',
      published: true,
      sortOrder: 0,
    },
  });
  console.log('Seeded 1 top doctor (Dr. Ashenafi / Oncology).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
