import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const runChatE2e = process.env.DATABASE_URL && process.env.RUN_CHAT_E2E === '1';
const describeChat = runChatE2e ? describe : describe.skip;

describeChat('Chat — production checks (e2e, RUN_CHAT_E2E=1)', () => {
  let app: INestApplication<App>;
  const password = 'TestPass1!zz';
  let email1: string;
  let token1: string;
  let token2: string;
  let convId: string;

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

    email1 = `e2e-chat1-${Date.now()}@test.local`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email1, password })
      .expect(201);
    token1 = reg1.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        role: 'personal',
        preferredName: 'E2EChat',
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

    const email2 = `e2e-chat2-${Date.now()}@test.local`;
    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email2, password })
      .expect(201);
    token2 = reg2.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('personal first message returns conversationId', async () => {
    const m1 = await request(app.getHttpServer())
      .post('/api/chat/personal/messages')
      .set('Authorization', `Bearer ${token1}`)
      .send({ message: 'First turn for multi-turn test' })
      .expect(200);
    convId = m1.body.conversationId as string;
    expect(typeof convId).toBe('string');
  });

  it('personal second message same thread shows multi-turn in dummy LLM', async () => {
    const m2 = await request(app.getHttpServer())
      .post('/api/chat/personal/messages')
      .set('Authorization', `Bearer ${token1}`)
      .send({ message: 'Second turn', conversationId: convId })
      .expect(200);
    expect(m2.body.reply).toContain('user_turns_in_context');
  });

  it('GET /api/chat/conversations lists personal threads for owner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/chat/conversations')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      items: expect.any(Array),
    });
    const row = (res.body.items as { id: string }[]).find(
      (i) => i.id === convId,
    );
    expect(row).toBeDefined();
  });

  it('GET /api/chat/conversations/:id/messages returns messages for owner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/chat/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      hasMore: false,
    });
    expect((res.body.items as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('GET messages for another user conversation returns 404', () => {
    return request(app.getHttpServer())
      .get(`/api/chat/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(404);
  });

  it('POST /api/chat/general/messages has no PII in JSON response (anonymous)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/chat/general/messages')
      .send({ message: 'What is a healthy diet?' })
      .expect(200);
    const s = JSON.stringify(res.body);
    expect(s).not.toMatch(/@/);
    expect(s).not.toMatch(email1);
    expect(s).toMatchObject({ reply: expect.any(String) });
  });
});
