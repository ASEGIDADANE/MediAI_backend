// Load .env ourselves: ts-node spawns this seed in a fresh process that does
// not inherit Nest's ConfigModule, so DATABASE_URL / SEED_ADMIN_* would be
// undefined without this import.
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  Prisma,
  PrismaClient,
  UserAppRole,
  type HealthcareFacilityType,
} from '../src/generated/prisma/client';

// Prisma 7's `prisma-client` generator requires a driver adapter (the legacy
// `datasources.db.url` shape was removed). Mirror what `PrismaService` does so
// the seed connects to the same Postgres as the running app.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set; create a .env at MedaiBackend/MediAI_backend/.env (see .env.example).',
  );
}
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BCRYPT_ROUNDS = 12;

type AdminSpec = { email: string; password: string };

/**
 * Collects every admin pair declared in the environment. Two patterns are
 * supported and freely mixed:
 *
 *   1. Unnumbered (back-compat): SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD
 *   2. Numbered (any count):     SEED_ADMIN_1_EMAIL + SEED_ADMIN_1_PASSWORD,
 *                                SEED_ADMIN_2_EMAIL + SEED_ADMIN_2_PASSWORD,
 *                                ... (gaps are allowed; we scan up to 50)
 *
 * Result: an array of {email, password} pairs ready to upsert. Duplicate
 * emails (case-insensitive) keep only the first occurrence.
 */
function collectAdminSpecs(): AdminSpec[] {
  const specs: AdminSpec[] = [];
  const seen = new Set<string>();

  const push = (rawEmail: string | undefined, password: string | undefined) => {
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !password) return;
    if (seen.has(email)) return;
    seen.add(email);
    specs.push({ email, password });
  };

  push(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  for (let i = 1; i <= 50; i += 1) {
    push(
      process.env[`SEED_ADMIN_${i}_EMAIL`],
      process.env[`SEED_ADMIN_${i}_PASSWORD`],
    );
  }
  return specs;
}

/**
 * Upserts a single admin row. Idempotent:
 *   - missing user -> create with appRole=admin and a bcrypt-hashed password,
 *   - existing non-admin -> promote to admin,
 *   - existing admin -> no-op (password is rewritten only when
 *     SEED_ADMIN_RESET_PASSWORD=true so re-running the seed never silently
 *     clobbers a password the user later changed via /forgot-password).
 */
async function upsertAdmin({ email, password }: AdminSpec, resetPassword: boolean) {
  if (password.length < 8) {
    throw new Error(
      `Password for admin ${email} must be at least 8 characters.`,
    );
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, passwordHash, appRole: UserAppRole.admin },
    });
    console.log(`Seeded admin user ${email}.`);
    return;
  }

  const updates: Prisma.UserUpdateInput = {};
  if (existing.appRole !== UserAppRole.admin) updates.appRole = UserAppRole.admin;
  if (resetPassword) updates.passwordHash = passwordHash;

  if (Object.keys(updates).length === 0) {
    console.log(`Admin user ${email} already present; nothing to update.`);
    return;
  }

  await prisma.user.update({ where: { email }, data: updates });
  console.log(
    `Updated existing user ${email} -> appRole=admin${
      resetPassword ? ' (password reset from env)' : ''
    }.`,
  );
}

/**
 * Idempotent admin bootstrap. Reads any number of admin pairs from the
 * environment (see {@link collectAdminSpecs}) and creates / promotes each one.
 *
 * No-ops (with a friendly log) when no admin pair is configured so that
 * contributors who don't want a local admin can still run the seed.
 */
async function seedAdmin() {
  const specs = collectAdminSpecs();
  if (specs.length === 0) {
    console.log(
      'Admin seed skipped: set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (and/or SEED_ADMIN_<N>_EMAIL/SEED_ADMIN_<N>_PASSWORD pairs) in .env to bootstrap admin users.',
    );
    return;
  }
  const resetPassword = process.env.SEED_ADMIN_RESET_PASSWORD === 'true';
  for (const spec of specs) {
    await upsertAdmin(spec, resetPassword);
  }
}

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

type SubscriptionPlanSeed = {
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  features: string[];
  active: boolean;
  sortOrder: number;
};

async function seedSubscriptionPlans() {
  const plans: SubscriptionPlanSeed[] = [
    {
      name: 'Free',
      description:
        'Get started with essential AI-Doctor access for everyday wellness questions.',
      monthlyPriceCents: 0,
      yearlyPriceCents: 0,
      currency: 'USD',
      features: [
        'AI Doctor — general mode',
        'Symptom guide & glossary',
        'Find nearby healthcare facilities',
      ],
      active: true,
      sortOrder: 0,
    },
    {
      name: 'Lite',
      description:
        'Personalised AI-Doctor with your health profile and medical history saved.',
      monthlyPriceCents: 399,
      yearlyPriceCents: 4_788,
      currency: 'USD',
      features: [
        'Everything in Free',
        'Personal AI Doctor with full health profile',
        'Conversation history across devices',
        'Lab test interpretation drafts',
      ],
      active: true,
      sortOrder: 10,
    },
    {
      name: 'Pro',
      description:
        'Advanced clinical guidance plus messaging with verified MediAI doctors.',
      monthlyPriceCents: 799,
      yearlyPriceCents: 9_588,
      currency: 'USD',
      features: [
        'Everything in Lite',
        'Direct messaging with verified doctors',
        'Priority response on second-opinion requests',
        'Unlimited AI conversation history',
      ],
      active: true,
      sortOrder: 20,
    },
  ];

  // Idempotent: only insert plans whose `name` doesn't already exist. We
  // never overwrite an admin-edited plan once it's in the DB — re-running the
  // seed should never silently revert a price change.
  let created = 0;
  for (const p of plans) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { name: p.name },
    });
    if (existing) continue;
    await prisma.subscriptionPlan.create({
      data: {
        name: p.name,
        description: p.description,
        monthlyPriceCents: p.monthlyPriceCents,
        yearlyPriceCents: p.yearlyPriceCents,
        currency: p.currency,
        features: p.features as Prisma.InputJsonValue,
        active: p.active,
        sortOrder: p.sortOrder,
      },
    });
    created += 1;
  }
  if (created > 0) {
    console.log(`Seeded ${created} subscription plan(s).`);
  } else {
    console.log('Subscription plans already present; skip.');
  }
}

export async function main() {
  await seedAdmin();
  await seedTopDoctor();
  await seedBlog();
  await seedEducation();
  await seedHealthFacilities();
  await seedSubscriptionPlans();
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
