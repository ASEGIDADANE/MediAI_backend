import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MediAI CMS & chat routes (e2e)', () => {
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

  it('GET /api/landing includes required keys', async () => {
    const res = await request(app.getHttpServer()).get('/api/landing').expect(200);
    expect(res.body).toMatchObject({
      navItems: expect.any(Array),
      heroHighlights: expect.any(Array),
      benefitItems: expect.any(Array),
      showcaseItems: expect.any(Array),
      securityItems: expect.any(Array),
      testimonialItems: expect.any(Array),
      faqItems: expect.any(Array),
      footerColumns: expect.any(Array),
    });
  });

  it('GET /api/onboarding/config includes professional option arrays', async () => {
    const res = await request(app.getHttpServer()).get('/api/onboarding/config').expect(200);
    expect(res.body).toMatchObject({
      userRoleOptions: expect.any(Array),
      professionalTitleOptions: expect.any(Array),
      professionalSpecialtyOptions: expect.any(Array),
      professionalCompletionItems: expect.any(Array),
      smokingIntensityOptions: expect.any(Array),
      featureOptions: expect.arrayContaining([
        expect.objectContaining({ id: 'lab-test-interpretation' }),
      ]),
    });
  });

  it('GET /api/dashboard/config', async () => {
    const res = await request(app.getHttpServer()).get('/api/dashboard/config').expect(200);
    expect(res.body).toMatchObject({
      defaultDashboardProfile: expect.any(Object),
      dashboardCards: expect.any(Array),
      consultDoctorsCard: expect.any(Object),
      mainHealthInfoSections: expect.any(Array),
    });
  });

  it('GET /api/chat/config', async () => {
    const res = await request(app.getHttpServer()).get('/api/chat/config').expect(200);
    expect(res.body).toMatchObject({
      doctorTypeOptions: expect.any(Array),
      chatHistoryItems: expect.any(Array),
      seededPersonalConversation: expect.any(Array),
    });
  });

  it('GET /api/ai-doctor/config', async () => {
    const res = await request(app.getHttpServer()).get('/api/ai-doctor/config').expect(200);
    expect(res.body).toMatchObject({
      aiDoctorBenefits: expect.any(Array),
      medicalHistorySteps: expect.any(Array),
      medicalHistoryTotalSteps: 12,
    });
  });

  it('GET /api/admin/config returns 401 without JWT', () => {
    return request(app.getHttpServer()).get('/api/admin/config').expect(401);
  });

  it('POST /api/chat/reply returns 410 Gone with migration hints', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/chat/reply')
      .send({ mode: 'personal', message: 'headache' })
      .expect(410);
    expect(res.body).toMatchObject({
      error: 'gone',
      migration: expect.objectContaining({
        apiDocs: 'GET /api/docs',
        generalJson: 'POST /api/chat/general/messages',
      }),
    });
  });

  it('POST /api/chat/reply 400 for invalid body', () => {
    return request(app.getHttpServer())
      .post('/api/chat/reply')
      .send({ mode: 'invalid', message: 'x' })
      .expect(400);
  });

  it('POST /api/chat/report-issue 400 when message missing or blank', async () => {
    await request(app.getHttpServer()).post('/api/chat/report-issue').send({}).expect(400);
    await request(app.getHttpServer())
      .post('/api/chat/report-issue')
      .send({ message: '   ' })
      .expect(400);
  });
});
