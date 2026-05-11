// Load .env ourselves: ts-node spawns this seed in a fresh process that does
// not inherit Nest's ConfigModule, so DATABASE_URL / SEED_ADMIN_* would be
// undefined without this import.
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import {
  Prisma,
  PrismaClient,
  UserAppRole,
  ChatThreadKind,
  ChatMessageRole,
  OnboardingUserRole,
  OnboardingMeasurementSystem,
  OnboardingSexAtBirth,
  OnboardingPreferredFeature,
  type HealthcareFacilityType,
} from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for prisma seed');
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
      ] as Prisma.InputJsonValue,
      biography: [
        "Dr. Ashenafi is an experienced medical professional with a specialization in tumors of the upper respiratory tract, skin tumors, modern immunotherapies, and hematology. Broad cancer and rare tumors complete his knowledge.",
        'Currently, Dr. Ashenafi is the Chief Physician at the Swiss Cancer Services AG/Seeland Cancer Center in Hirslanden Klinik Linde, Biel, Switzerland. Previously, he worked as the Head of the Interdisciplinary Cancerology Service at Riviera-Chablais Hospital, where he served from 2019 to 2020.',
        "Dr. Ashenafi has held various leadership positions in his career. From 2009 to 2018, he was the Disease Leader for Head and Neck Cancer and Thyroid Cancer. Additionally, he was the Disease Leader for Skin Cancers and Melanoma from 2012 to 2018.",
        "Dr. Ashenafi is a member of numerous national and international scientific societies and associations. He is a founding member and board member of the Swiss Head and Neck Society and the President of the Head and Neck Cancer Working Group.",
      ] as Prisma.InputJsonValue,
      experience: [
        {
          title: 'Head of the Interdisciplinary Cancerology Service, Riviera-Chablais Hospital',
          subtitle: 'Rennaz, Switzerland. 2019 - 2020',
        },
      ] as Prisma.InputJsonValue,
      affiliations: [
        {
          title: 'President of the Head and Neck Cancer Working Group',
          subtitle: 'Since 2016',
        },
      ] as Prisma.InputJsonValue,
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
        sections: a.sections as Prisma.InputJsonValue,
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
        bullets: p.bullets as Prisma.InputJsonValue,
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

const BCRYPT_ROUNDS = 12;

/** Email/password admin for local sign-in (not created when SEED_DEV_ADMIN=false). */
async function seedDevAdmin() {
  const skip =
    process.env.SEED_DEV_ADMIN === '0' ||
    process.env.SEED_DEV_ADMIN === 'false';
  if (skip) {
    console.log('Dev admin seed skipped (SEED_DEV_ADMIN=false).');
    return;
  }

  const email = (
    process.env.DEV_ADMIN_EMAIL ??
    process.env.SEED_ADMIN_EMAIL ??
    'admin@mediai.dev'
  )
    .trim()
    .toLowerCase();
  const password =
    process.env.DEV_ADMIN_PASSWORD ??
    process.env.SEED_ADMIN_PASSWORD ??
    'ChangeMeDev1!';
  if (password.length < 8) {
    console.warn(
      'DEV_ADMIN_PASSWORD must be at least 8 characters; skipping dev admin seed.',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, appRole: UserAppRole.admin },
    update: { passwordHash, appRole: UserAppRole.admin },
  });
  console.log(
    `Dev admin user: ${email} / (password from DEV_ADMIN_PASSWORD, SEED_ADMIN_PASSWORD, or default ChangeMeDev1!)`,
  );
}

/** Public pricing tiers — only when the table is empty. */
async function seedSubscriptionPlansIfEmpty() {
  const n = await prisma.subscriptionPlan.count();
  if (n > 0) {
    console.log('Subscription plans already present; skip.');
    return;
  }

  await prisma.subscriptionPlan.createMany({
    data: [
      {
        name: 'Free',
        description: 'Core AI guidance and education for individuals getting started.',
        monthlyPriceCents: 0,
        yearlyPriceCents: 0,
        features: [
          'Limited AI Doctor questions per day',
          'Symptom guide & glossary',
          'Basic lab result explanations',
        ] as Prisma.InputJsonValue,
        sortOrder: 0,
        active: true,
      },
      {
        name: 'Lite',
        description: 'More daily usage and priority-friendly experience.',
        monthlyPriceCents: 399,
        yearlyPriceCents: 3990,
        features: [
          'Higher daily AI Doctor limits',
          'Save conversation history longer',
          'Email support',
        ] as Prisma.InputJsonValue,
        sortOrder: 1,
        active: true,
      },
      {
        name: 'Pro',
        description: 'For active patients coordinating care and second opinions.',
        monthlyPriceCents: 999,
        yearlyPriceCents: 9990,
        features: [
          'Top usage tier for AI Doctor',
          'Second-opinion workflow helpers',
          'Export-friendly summaries',
        ] as Prisma.InputJsonValue,
        sortOrder: 2,
        active: true,
      },
    ],
  });
  console.log('Seeded 3 subscription plans (Free, Lite, Pro).');
}

/** Second brochure doctor for “Top Doctors” lists / detail UX. */
async function seedSecondTopDoctorIfMissing() {
  const existing = await prisma.topDoctor.findFirst({
    where: { name: 'Dr. Helen Tadesse' },
  });
  if (existing) {
    console.log('Second demo top doctor present; skip.');
    return;
  }

  await prisma.topDoctor.create({
    data: {
      name: 'Dr. Helen Tadesse',
      role: 'Cardiologist',
      specialty: 'Cardiology',
      subSpecialty: 'Preventive Cardiology, Heart Failure',
      yearsOfExperience: 18,
      videoFee: 350,
      writtenFee: 275,
      heroImageUrl: '/sample_doc_photo.png',
      educationDegree: 'MD: Addis Ababa University',
      educationYear: '2008',
      diseases: [
        'Hypertension',
        'Heart Failure',
        'Atrial Fibrillation',
        'Coronary Artery Disease',
        'Lipid Disorders',
      ] as Prisma.InputJsonValue,
      biography: [
        'Dr. Tadesse focuses on preventive cardiology and helping patients understand risk factors before symptoms progress.',
        'She has led community screening programs and works closely with primary care teams on medication titration and lifestyle plans.',
      ] as Prisma.InputJsonValue,
      experience: [
        {
          title: 'Staff Cardiologist, Tikur Anbessa Specialized Hospital',
          subtitle: 'Addis Ababa. 2015 - present',
        },
      ] as Prisma.InputJsonValue,
      affiliations: [
        {
          title: 'Ethiopian Cardiac Society',
          subtitle: 'Member',
        },
      ] as Prisma.InputJsonValue,
      publicationsSummary: 'Co-author on regional hypertension management guidelines.',
      published: true,
      sortOrder: 1,
    },
  });
  console.log('Seeded 2nd top doctor (Dr. Helen Tadesse / Cardiology).');
}

const DEMO_PATIENT_EMAIL = 'patient.demo@mediai.dev';
const DEMO_DOCTOR_EMAIL = 'doctor.demo@mediai.dev';

/** Demo password for patient + doctor demo accounts (override with SEED_DEMO_PASSWORD). */
function demoPassword(): string {
  return process.env.SEED_DEMO_PASSWORD ?? 'DemoMediai2026!';
}

/**
 * Patient + professional users, AI chat threads, doctor↔patient thread/messages,
 * and one support report — safe to re-run (upserts / counts).
 */
async function seedDemoUsersAndActivity() {
  const pwd = demoPassword();
  if (pwd.length < 8) {
    console.warn('SEED_DEMO_PASSWORD must be at least 8 chars; skip demo users.');
    return;
  }

  const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);

  const patient = await prisma.user.upsert({
    where: { email: DEMO_PATIENT_EMAIL },
    create: {
      email: DEMO_PATIENT_EMAIL,
      passwordHash: hash,
      appRole: UserAppRole.user,
    },
    update: { passwordHash: hash, appRole: UserAppRole.user },
  });

  const doctor = await prisma.user.upsert({
    where: { email: DEMO_DOCTOR_EMAIL },
    create: {
      email: DEMO_DOCTOR_EMAIL,
      passwordHash: hash,
      appRole: UserAppRole.user,
    },
    update: { passwordHash: hash, appRole: UserAppRole.user },
  });

  const patientMedicalHistory = {
    chronicDiseases: ['Hypertension'],
    chronicDetails: 'Diagnosed 2021; well controlled on medication.',
    familyHistory: ['Diabetes', 'Heart Disease'],
    familyHistoryDetails: 'Father had type 2 diabetes.',
    allergies: ['Penicillin'],
    allergyDetails: 'Rash in childhood.',
    surgicalHistory: 'Appendectomy 2010',
    currentMedications: 'Lisinopril 10mg daily',
    pastMedications: '',
    smokingIntensity: 'Never',
    alcoholIntake: 'Occasional',
    dietaryHabits: 'Mediterranean-style, low salt',
    activityLevel: 'Walks 30 min, 4x/week',
    sleepPattern: '6–7 hours',
    stressLevel: 'Moderate (work)',
  } as Prisma.InputJsonValue;

  await prisma.userProfile.upsert({
    where: { userId: patient.id },
    create: {
      userId: patient.id,
      role: OnboardingUserRole.personal,
      preferredName: 'Meron',
      confirmedAdult: true,
      region: 'Addis Ababa',
      ageYears: 34,
      measurementSystem: OnboardingMeasurementSystem.metric,
      weight: '62',
      heightFeet: null,
      heightInches: null,
      heightCm: '165',
      sexAtBirth: OnboardingSexAtBirth.female,
      preferredFeature: OnboardingPreferredFeature.ai_doctor,
      medicalHistory: patientMedicalHistory,
      aiDoctorSetupCompleted: true,
    },
    update: {
      role: OnboardingUserRole.personal,
      preferredName: 'Meron',
      confirmedAdult: true,
      region: 'Addis Ababa',
      ageYears: 34,
      measurementSystem: OnboardingMeasurementSystem.metric,
      weight: '62',
      heightCm: '165',
      heightFeet: null,
      heightInches: null,
      sexAtBirth: OnboardingSexAtBirth.female,
      preferredFeature: OnboardingPreferredFeature.ai_doctor,
      medicalHistory: patientMedicalHistory,
      aiDoctorSetupCompleted: true,
    },
  });

  const doctorProfessional = {
    title: 'dr',
    fullName: 'Dr. Yonas Bekele',
    specialty: 'Internal Medicine',
    region: 'Addis Ababa',
  } as Prisma.InputJsonValue;

  await prisma.userProfile.upsert({
    where: { userId: doctor.id },
    create: {
      userId: doctor.id,
      role: OnboardingUserRole.professional,
      preferredName: 'Dr. Yonas',
      confirmedAdult: true,
      region: 'Addis Ababa',
      ageYears: 42,
      measurementSystem: OnboardingMeasurementSystem.metric,
      weight: '78',
      heightFeet: null,
      heightInches: null,
      heightCm: '182',
      sexAtBirth: OnboardingSexAtBirth.male,
      preferredFeature: OnboardingPreferredFeature.top_doctors,
      professionalProfile: doctorProfessional,
      aiDoctorSetupCompleted: true,
    },
    update: {
      role: OnboardingUserRole.professional,
      preferredName: 'Dr. Yonas',
      confirmedAdult: true,
      region: 'Addis Ababa',
      ageYears: 42,
      measurementSystem: OnboardingMeasurementSystem.metric,
      weight: '78',
      heightCm: '182',
      heightFeet: null,
      heightInches: null,
      sexAtBirth: OnboardingSexAtBirth.male,
      preferredFeature: OnboardingPreferredFeature.top_doctors,
      professionalProfile: doctorProfessional,
      aiDoctorSetupCompleted: true,
    },
  });

  let selfConv = await prisma.chatConversation.findFirst({
    where: {
      userId: patient.id,
      kind: ChatThreadKind.personal,
      patientUserId: null,
    },
  });
  if (!selfConv) {
    selfConv = await prisma.chatConversation.create({
      data: {
        kind: ChatThreadKind.personal,
        userId: patient.id,
        patientUserId: null,
      },
    });
  }
  const selfMsgCount = await prisma.chatMessage.count({
    where: { conversationId: selfConv.id },
  });
  if (selfMsgCount === 0) {
    await prisma.chatMessage.createMany({
      data: [
        {
          conversationId: selfConv.id,
          role: ChatMessageRole.user,
          content:
            'I have had a dull headache for three days and feel tired. Could this be serious?',
        },
        {
          conversationId: selfConv.id,
          role: ChatMessageRole.assistant,
          content:
            'Headaches with fatigue are common and often benign, but persistent or worsening symptoms deserve attention. Consider hydration, sleep, and stress; seek urgent care for sudden severe headache, fever, neck stiffness, vision changes, weakness, or confusion. This is general information only — a clinician can evaluate you properly.',
        },
      ],
    });
  }

  let clinicalConv = await prisma.chatConversation.findFirst({
    where: {
      userId: doctor.id,
      kind: ChatThreadKind.personal,
      patientUserId: patient.id,
    },
  });
  if (!clinicalConv) {
    clinicalConv = await prisma.chatConversation.create({
      data: {
        kind: ChatThreadKind.personal,
        userId: doctor.id,
        patientUserId: patient.id,
      },
    });
  }
  const clinicalMsgCount = await prisma.chatMessage.count({
    where: { conversationId: clinicalConv.id },
  });
  if (clinicalMsgCount === 0) {
    await prisma.chatMessage.createMany({
      data: [
        {
          conversationId: clinicalConv.id,
          role: ChatMessageRole.user,
          content:
            'Summarize this patient’s hypertension management priorities for today’s telehealth visit.',
        },
        {
          conversationId: clinicalConv.id,
          role: ChatMessageRole.assistant,
          content:
            'Demo summary: patient reports controlled hypertension on lisinopril, family history of diabetes and heart disease, penicillin allergy documented. Reinforce adherence, home BP monitoring, lifestyle salt reduction, and follow-up labs as per local protocol. Not a substitute for clinical judgment.',
        },
      ],
    });
  }

  let thread = await prisma.doctorPatientThread.findUnique({
    where: {
      doctorUserId_patientUserId: {
        doctorUserId: doctor.id,
        patientUserId: patient.id,
      },
    },
  });
  if (!thread) {
    thread = await prisma.doctorPatientThread.create({
      data: {
        doctorUserId: doctor.id,
        patientUserId: patient.id,
      },
    });
  }
  const dmCount = await prisma.doctorPatientMessage.count({
    where: { threadId: thread.id },
  });
  if (dmCount === 0) {
    await prisma.doctorPatientMessage.createMany({
      data: [
        {
          threadId: thread.id,
          senderUserId: doctor.id,
          body: 'Hi Meron — I reviewed your latest BP log. Please continue lisinopril and send a reading next week.',
        },
        {
          threadId: thread.id,
          senderUserId: patient.id,
          body: 'Thank you, Dr. Yonas. I will log mornings before breakfast.',
        },
      ],
    });
  }

  const reportCount = await prisma.supportReport.count({
    where: { userId: patient.id },
  });
  if (reportCount === 0) {
    await prisma.supportReport.create({
      data: {
        userId: patient.id,
        message: 'Demo: UI looks great; dark mode on dashboard would be nice.',
      },
    });
  }

  console.log(
    `Demo accounts (password: env SEED_DEMO_PASSWORD or default DemoMediai2026!):\n` +
      `  Patient: ${DEMO_PATIENT_EMAIL}\n` +
      `  Doctor:  ${DEMO_DOCTOR_EMAIL}`,
  );
}

export async function main() {
  await seedTopDoctor();
  await seedBlog();
  await seedEducation();
  await seedHealthFacilities();
  await seedDevAdmin();
  await seedSubscriptionPlansIfEmpty();
  await seedSecondTopDoctorIfMissing();
  if (process.env.SEED_DEMO_DATA !== 'false') {
    await seedDemoUsersAndActivity();
  } else {
    console.log('Demo users/chats skipped (SEED_DEMO_DATA=false).');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
