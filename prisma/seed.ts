import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Prisma,
  PrismaClient,
  type HealthcareFacilityType,
} from '../src/generated/prisma/client';

const prisma = new PrismaClient();

type SeedArticle = {
  id: string;
  title: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  imageSrc: string;
  intro: string;
  sections: { title: string; body: string }[];
};

async function seedTopDoctor() {
  const count = await prisma.topDoctor.count();
  if (count > 0) {
    console.log('Top doctors already present; skip.');
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

async function seedBlog() {
  if ((await prisma.blogArticle.count()) > 0) {
    console.log('Blog articles already present; skip.');
    return;
  }

  const p = path.join(__dirname, 'data', 'blog-seed.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as SeedArticle[];
  const idMap = new Map<string, string>();

  for (const a of raw) {
    const publishedAt = new Date(Date.parse(a.date));
    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error(`Bad date: ${a.date}`);
    }
    const created = await prisma.blogArticle.create({
      data: {
        title: a.title,
        category: a.category,
        author: a.author,
        readTime: a.readTime,
        imageSrc: a.imageSrc,
        intro: a.intro,
        sections: a.sections as Prisma.JsonValue,
        published: true,
        publishedAt,
        dateDisplay: a.date,
        sortOrder: parseInt(a.id, 10),
      },
    });
    idMap.set(a.id, created.id);
  }

  const g = (legacy: string) => {
    const u = idMap.get(legacy);
    if (!u) {
      throw new Error(`Missing legacy id ${legacy}`);
    }
    return u;
  };

  await prisma.blogHomeConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      featuredArticleId: g('1'),
      popularArticleIds: [g('2'), g('3')],
      aiHealthcareArticleIds: [g('2'), g('3'), g('4')],
      secondOpinionArticleIds: [g('5'), g('6'), g('7')],
      companyNewsArticleIds: [g('8'), g('9'), g('10')],
    },
    update: {
      featuredArticleId: g('1'),
      popularArticleIds: [g('2'), g('3')],
      aiHealthcareArticleIds: [g('2'), g('3'), g('4')],
      secondOpinionArticleIds: [g('5'), g('6'), g('7')],
      companyNewsArticleIds: [g('8'), g('9'), g('10')],
    },
  });

  console.log(`Seeded ${raw.length} blog articles + home config.`);
}

async function seedEducation() {
  if ((await prisma.educationResource.count()) > 0) {
    console.log('Education resources already present; skip.');
    return;
  }

  const pages: {
    slug: 'symptom-guide' | 'glossary' | 'knowledge-base';
    sortOrder: number;
    title: string;
    description: string;
    bullets: string[];
  }[] = [
    {
      slug: 'symptom-guide',
      sortOrder: 1,
      title: 'Symptom Guide',
      description:
        'Use the MediAI symptom guide to understand common signs, prepare smarter questions, and know when to seek urgent care.',
      bullets: [
        'Review common symptom patterns in clear, non-technical language.',
        'Prepare for care visits with focused questions and useful context.',
        'Understand which symptoms may need urgent clinical attention.',
      ],
    },
    {
      slug: 'glossary',
      sortOrder: 2,
      title: 'Glossary',
      description:
        'Look up common healthcare, lab, and AI terms used across MediAI so the product stays easy to understand.',
      bullets: [
        'Learn the meaning of common lab, symptom, and treatment terms.',
        'Understand AI and medical language that appears in explanations and summaries.',
        'Build confidence before appointments, result reviews, and follow-up questions.',
      ],
    },
    {
      slug: 'knowledge-base',
      sortOrder: 3,
      title: 'Knowledge Base',
      description:
        'Browse foundational MediAI help content, feature explanations, and product guidance in one place.',
      bullets: [
        'Understand how each MediAI workflow is designed to support patients and professionals.',
        'Find setup guidance for onboarding, AI Doctor, lab tests, and second opinions.',
        'Get quick answers about features, privacy expectations, and recommended usage.',
      ],
    },
  ];

  for (const p of pages) {
    await prisma.educationResource.create({
      data: {
        slug: p.slug,
        title: p.title,
        description: p.description,
        bullets: p.bullets as Prisma.JsonValue,
        iconKey: p.slug,
        published: true,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log('Seeded 3 education resources (symptom guide, glossary, knowledge base).');
}

type HealthFacilitySeedRow = {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  rating: number;
  verified: boolean;
  latitude: number;
  longitude: number;
  openNow: boolean;
};

async function seedHealthFacilities() {
  if ((await prisma.healthcareFacility.count()) > 0) {
    console.log('Healthcare facilities already present; skip.');
    return;
  }

  const p = path.join(__dirname, 'data', 'health-facilities-seed.json');
  const raw = JSON.parse(
    fs.readFileSync(p, 'utf-8'),
  ) as HealthFacilitySeedRow[];

  for (const r of raw) {
    await prisma.healthcareFacility.create({
      data: {
        id: r.id,
        name: r.name,
        type: r.type as HealthcareFacilityType,
        address: r.address,
        phone: r.phone,
        rating: r.rating,
        verified: r.verified,
        latitude: r.latitude,
        longitude: r.longitude,
        openNow: r.openNow,
        published: true,
      },
    });
  }
  console.log(`Seeded ${raw.length} healthcare facilities (facility locator).`);
}

export async function main() {
  await seedTopDoctor();
  await seedBlog();
  await seedEducation();
  await seedHealthFacilities();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
