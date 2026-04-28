import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserAppRole } from '../src/generated/prisma/client';

const run = process.env.DATABASE_URL && process.env.RUN_ADMIN_E2E === '1';
const d = run ? describe : describe.skip;

d('Admin v2 (e2e, RUN_ADMIN_E2E=1)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const password = 'AdminE2E1!zz';
  let email: string;
  let adminToken: string;
  let userToken: string;

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

    email = `e2e-admin-${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const userId = (reg.body.user as { id: string }).id;

    await prisma.user.update({
      where: { id: userId },
      data: { appRole: UserAppRole.admin },
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    adminToken = login.body.accessToken as string;

    const email2 = `e2e-user-${Date.now()}@test.local`;
    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email2, password })
      .expect(201);
    userToken = reg2.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/admin/summary (admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      userCount: expect.any(Number),
      profileCount: expect.any(Number),
      supportReportCount: expect.any(Number),
      adminCount: expect.any(Number),
      last24hRegistrations: expect.any(Number),
    });
  });

  it('GET /api/admin/users (admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&pageSize=5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pageSize: 5,
    });
    const row = (res.body.items as { email: string }[]).find((u) => u.email === email);
    expect(row).toMatchObject({
      email,
      hasProfile: false,
    });
  });

  it('GET /api/admin/summary (non-admin) 403', () => {
    return request(app.getHttpServer())
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});
