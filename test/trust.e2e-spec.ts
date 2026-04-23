import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const run = process.env.DATABASE_URL && process.env.RUN_TRUST_E2E === '1';
const d = run ? describe : describe.skip;

d('Trust — export & delete (e2e, RUN_TRUST_E2E=1)', () => {
  let app: INestApplication<App>;
  const password = 'TrustE2E1!aa';
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

    email = `e2e-trust-${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    token = reg.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/me/export returns JSON attachment with exportVersion 1', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body).toMatchObject({
      exportVersion: 1,
      user: { email },
      me: expect.any(Object),
    });
  });

  it('DELETE /api/me/account with wrong password returns 401', () => {
    return request(app.getHttpServer())
      .delete('/api/me/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong-password' })
      .expect(401);
  });

  it('DELETE /api/me/account with correct password returns 204', async () => {
    await request(app.getHttpServer())
      .delete('/api/me/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password })
      .expect(204);
  });
});
