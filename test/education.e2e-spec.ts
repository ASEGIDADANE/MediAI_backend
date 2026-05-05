import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserAppRole } from '../src/generated/prisma/client';

const run =
  process.env.DATABASE_URL && process.env.RUN_EDUCATION_E2E === '1';
const d = run ? describe : describe.skip;

d('Education (e2e, RUN_EDUCATION_E2E=1)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const password = 'EduE2E1!zz';
  let adminEmail: string;
  let adminToken: string;
  let glossaryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    adminEmail = `e2e-edu-${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password })
      .expect(201);
    const userId = (reg.body.user as { id: string }).id;
    await prisma.user.update({
      where: { id: userId },
      data: { appRole: UserAppRole.admin },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    adminToken = login.body.accessToken as string;

    const glossary = await prisma.educationResource.findUnique({
      where: { slug: 'glossary' },
    });
    if (!glossary) {
      throw new Error('Expected seeded education row slug=glossary; run prisma db seed.');
    }
    glossaryId = glossary.id;
  });

  afterAll(async () => {
    await prisma.educationResource.update({
      where: { id: glossaryId },
      data: { published: true, sortOrder: 2 },
    });
    await app?.close();
  });

  it('admin list includes id, published, sortOrder, updatedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/education/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const row = res.body.items.find((x: { slug: string }) => x.slug === 'glossary');
    expect(row).toMatchObject({
      id: glossaryId,
      slug: 'glossary',
      published: true,
      bullets: expect.any(Array),
      updatedAt: expect.any(String),
    });
  });

  it('admin GET by id returns admin shape', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id: glossaryId,
      slug: 'glossary',
      published: true,
    });
  });

  it('public list only published; unpublish hides from public GET', async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ published: false })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/education/resources')
      .expect(200);
    const slugs = (list.body.items as { slug: string }[]).map((i) => i.slug);
    expect(slugs).not.toContain('glossary');

    await request(app.getHttpServer()).get('/api/education/resources/glossary').expect(404);

    await request(app.getHttpServer())
      .patch(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ published: true })
      .expect(200);

    await request(app.getHttpServer()).get('/api/education/resources/glossary').expect(200);
  });

  it('admin PATCH sortOrder null clears DB column', async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 7 })
      .expect(200);
    let row = await prisma.educationResource.findUnique({ where: { id: glossaryId } });
    expect(row?.sortOrder).toBe(7);

    await request(app.getHttpServer())
      .patch(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: null })
      .expect(200);
    row = await prisma.educationResource.findUnique({ where: { id: glossaryId } });
    expect(row?.sortOrder).toBeNull();
  });

  it('admin DELETE soft-unpublishes', async () => {
    await request(app.getHttpServer())
      .delete(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const row = await prisma.educationResource.findUnique({
      where: { id: glossaryId },
    });
    expect(row?.published).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/admin/education/resources/${glossaryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ published: true })
      .expect(200);
  });
});
