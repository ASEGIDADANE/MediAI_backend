import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * DB-backed cases require a working `DATABASE_URL` and migrations (incl. `healthcare_facility`).
 * Prevents `npm run test:e2e` from failing when the DB is unreachable.
 */
const runHealthFacilitiesDbE2e =
  process.env.DATABASE_URL && process.env.RUN_HEALTH_FACILITIES_E2E === '1';
const describeWithDb = runHealthFacilitiesDbE2e ? describe : describe.skip;

describe('Health facilities (e2e) — id validation', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health-facilities/:id with bad id returns 400', () => {
    return request(app.getHttpServer())
      .get('/api/health-facilities/not-a-valid-id')
      .expect(400);
  });
});

describeWithDb('Health facilities (e2e) — with database', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health-facilities returns list envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health-facilities')
      .expect(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      page: expect.any(Number),
      pageSize: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it('GET /api/health-facilities/fac-001 returns 200 with facility shape or 404', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/health-facilities/fac-001',
    );
    if (res.status === 200) {
      expect(res.body).toMatchObject({
        id: 'fac-001',
        name: expect.any(String),
        type: expect.stringMatching(/hospital|pharmacy|clinic/),
        address: expect.any(String),
        phone: expect.any(String),
        rating: expect.any(Number),
        verified: expect.any(Boolean),
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        openNow: expect.any(Boolean),
      });
    } else {
      expect(res.status).toBe(404);
    }
  });
});
