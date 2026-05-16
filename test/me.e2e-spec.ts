import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Opt-in: requires a working `DATABASE_URL` and schema migrated (see README Phase 3).
 * Prevents `test:e2e` from failing when env points at a dead or wrong database.
 */
const runMeE2e = process.env.DATABASE_URL && process.env.RUN_ME_E2E === '1';
const describeWithDb = runMeE2e ? describe : describe.skip;

describeWithDb('Phase 3 — /api/me (e2e)', () => {
  let app: INestApplication<App>;
  const password = 'TestPass1!zz';
  let email: string;
  let token: string;

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

    email = `e2e-me-${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    token = reg.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/me/profile before onboarding: profile null', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({
      profile: null,
      medicalHistory: null,
      aiDoctorSetupCompleted: false,
    });
  });

  it('onboarding then GET has dashboard-shaped profile and defaults', async () => {
    await request(app.getHttpServer())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'personal',
        preferredName: 'E2E',
        confirmedAdult: true,
        region: 'Addis Ababa',
        age: 35,
        measurementSystem: 'metric',
        weight: '70',
        heightCm: '175',
        sexAtBirth: 'female',
        preferredFeature: 'lab-test-interpretation',
      })
      .expect(200);

    const r1 = await request(app.getHttpServer())
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(r1.body.profile).toMatchObject({
      preferredName: 'E2E',
      age: '35',
      region: 'Addis Ababa',
      measurementSystem: 'metric',
      weight: '70',
      heightCm: '175',
      sexAtBirth: 'female',
      preferredFeature: 'lab-test-interpretation',
    });
    expect(r1.body.aiDoctorSetupCompleted).toBe(false);
  });

  it('PATCH /api/me/profile is idempotent with same body', async () => {
    const body = { preferredName: 'E2E' };
    const a = await request(app.getHttpServer())
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const b = await request(app.getHttpServer())
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(b.body).toEqual(a.body);
  });

  it('PUT /api/me/medical-history and second GET returns persisted data', async () => {
    const history = {
      chronicDiseases: ['X'],
      chronicDetails: 'd1',
      allergies: [],
      allergyDetails: '',
      currentMedications: 'a',
      pastMedications: 'b',
      smokingIntensity: 'n',
      alcoholIntake: 'm',
      dietaryHabits: 'o',
      activityLevel: 'l',
      sleepPattern: 'd',
      stressLevel: 'low',
    };
    const put = await request(app.getHttpServer())
      .put('/api/me/medical-history')
      .set('Authorization', `Bearer ${token}`)
      .send(history)
      .expect(200);
    expect(put.body.medicalHistory).toMatchObject({ chronicDiseases: ['X'] });

    const g = await request(app.getHttpServer())
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(g.body.medicalHistory).toMatchObject({ chronicDiseases: ['X'] });
  });

  it('PATCH /api/me/ai-doctor/setup', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/me/ai-doctor/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({ completed: true })
      .expect(200);
    expect(res.body.aiDoctorSetupCompleted).toBe(true);
  });
});
