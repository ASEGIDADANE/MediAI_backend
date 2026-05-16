import './load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaClientExceptionFilter } from './filters/prisma-client-exception.filter';

/** In non-production, allow both localhost and 127.0.0.1 so browser origin matches CORS. */
function resolveCorsOrigin(): string | string[] {
  const primary = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  if (process.env.NODE_ENV === 'production') {
    return primary;
  }
  try {
    const u = new URL(primary);
    const altHost =
      u.hostname === 'localhost'
        ? '127.0.0.1'
        : u.hostname === '127.0.0.1'
          ? 'localhost'
          : null;
    if (!altHost) return primary;
    const alt = `${u.protocol}//${altHost}${u.port ? `:${u.port}` : ''}`;
    return alt === primary ? primary : [primary, alt];
  } catch {
    return primary;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaClientExceptionFilter());
  app.enableShutdownHooks();

  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MediAI API')
    .setDescription(
      'MediAI backend — auth, onboarding profile persistence, and future modules. ' +
        'Onboarding config mirrors the MediAI wizard; `GET|PATCH /me/profile`, `PUT /me/medical-history`, and `PATCH /me/ai-doctor/setup` require JWT. ' +
        'All JSON routes use the global `/api` prefix.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description:
          'Paste the value from POST /api/auth/login or register (accessToken)',
        in: 'header',
      },
      'access-token',
    )
    .addTag('auth', 'Registration, login, JWT, Google OAuth, password reset')
    .addTag(
      'onboarding',
      'Wizard config (public) and user profile persistence (JWT)',
    )
    .addTag('health', 'Service health')
    .addTag('landing', 'Marketing / landing JSON')
    .addTag('blog', 'Public blog (MediAI BlogArticle shape); no comments in v1')
    .addTag(
      'education',
      'Static help / education (symptom guide, glossary, knowledge base)',
    )
    .addTag('dashboard', 'Dashboard home config')
    .addTag(
      'chat',
      'AI chat: OpenAI- or Google Gemini–compatible LLM (`LLM_API_KEY`); personal (JWT) vs general; multi-turn; optional RAG when `RAG_ENABLED=true` (pgvector + `DocumentChunk`). JSON: `POST /api/chat/personal|general/messages`. Streaming (SSE): `.../stream`. Legacy `POST /api/chat/reply` returns **410 Gone**.',
    )
    .addTag('ai-doctor', 'AI Doctor wizard config')
    .addTag(
      'top-doctors',
      'Public top doctors directory (USD fees); consultation booking not in v1',
    )
    .addTag(
      'health-facilities',
      'Public healthcare facilities (hospital, pharmacy, clinic) for the facility locator; read-only',
    )
    .addTag('admin', 'Admin dashboard (JWT + admin role)')
    .addTag(
      'me',
      'Current user — canonical dashboard profile, medical history JSON, AI doctor setup (JWT; replaces localStorage in Phase 3 cutover)',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (_controllerKey: string, methodKey: string) =>
      methodKey,
  });
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
}

bootstrap();
