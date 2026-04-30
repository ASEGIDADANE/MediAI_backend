<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

MediAI backend: NestJS + Prisma + PostgreSQL, JWT auth, onboarding, and **public CMS-style JSON** routes aligned with the MediAI Next.js `src/app/api` handlers.

**Chat (RAG + multi-turn + streaming):** see `docs/CHAT_IMPLEMENTATION_SPEC.md` and table below. **Backend finalization (gaps):** `docs/CHAT_MODULE_FINALIZATION_BACKEND.md`. **Production-hardening prompt (senior backend, same scope):** `docs/CHAT_PRODUCTION_READINESS_PROMPT.md`. **Next.js / MediAI app — API contract for chat (no app code in this repo):** `docs/CHAT_FRONTEND_HANDOFF.md`.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `FRONTEND_URL` | `http://localhost:3000` | CORS |
| `DATABASE_URL` | — | PostgreSQL. **RAG** requires the **`vector`** extension (`CREATE EXTENSION vector;` in migration `..._rag_documents_pgvector`). Use a server or Docker image with **pgvector** installed (repo `docker-compose` uses `pgvector/pgvector:pg16`). Plain `postgres` images may not provide the extension. |
| `JWT_SECRET` | (required in prod) | |
| `JWT_EXPIRES` | `7d` | |
| `LLM_API_KEY` / `OPENAI_API_KEY` | — | `dummy` / unset = no paid API (deterministic dev text). **OpenAI:** `sk-…`, `CHAT_LLM_MODEL` (default `gpt-4o-mini`), `LLM_BASE_URL`. **Google Gemini:** keys starting with `AIza` (or `LLM_PROVIDER=gemini`) use `GEMINI_MODEL` (default `gemini-2.0-flash`) and `GEMINI_API_BASE`. |
| `EMBEDDING_API_KEY` | (falls back to LLM key) | **OpenAI path only:** when not using Gemini for embeddings |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model; 1536-dim |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | When `LLM_API_KEY` is `AIza…` (or `LLM_PROVIDER=gemini`), RAG uses Gemini `embedContent` with `outputDimensionality=1536` (same as DB) |
| `USER_CONTEXT_MAX_CHARS` | `4000` | Max size of the personal **user context** block |
| `RAG_ENABLED` | `false` | `true` = retrieve from `Document` / `DocumentChunk` (pgvector) |
| `RAG_TOP_K` | `5` | Chunks per query |
| `RAG_MAX_CHUNK_CHARS` | `2000` | Citation excerpt cap |
| `CHAT_MAX_HISTORY_CHARS` | `24000` | **Total** char budget for system + history in one LLM call |
| `CHAT_MAX_HISTORY_PAIRS` | `20` | Max user+assistant **pairs** loaded from DB |
| `CHAT_ANON_GENERAL_RPM` | `20` | Per-**IP** cap (1 min window) for `POST /api/chat/general/*` when **no** Bearer (trust `X-Forwarded-For` only behind a **trusted** reverse proxy) |
| `CHAT_AUTH_GENERAL_RPM` | `40` | Per-`userId` (JWT `sub`) for general chat when Bearer present |
| `CHAT_DAILY_CAP` | `0` | In-process **UTC** daily cap on **completed** assistant turns per authed `userId` (personal + general with login); `0` = off; not safe across many replicas without Redis |
| `LLM_REQUEST_TIMEOUT_MS` | `30000` | `fetch` timeout for OpenAI **chat** calls → **504** to client on timeout |
| `EMBEDDING_REQUEST_TIMEOUT_MS` | `30000` | Same for RAG `embeddings` (errors degrade to no citations) |
| `ME_EXPORT_MAX_BYTES` | `5000000` | Max JSON size for `GET /api/me/export` (else **413**) |

**Trust / compliance (export, delete, audit):** `GET /api/me/export` downloads a JSON bundle (profile, chat, support reports). `DELETE /api/me/account` requires `password` (email users) or `{ "confirm": "DELETE" }` (Google-only). **Support** rows for that user are **deleted** with the account. `AccountAuditLog` records sensitive **writes** (field names / sizes only, no full PHI). `X-Forwarded-For` is used for best-effort IP in audit rows only when you trust your reverse proxy. JWTs remain valid until **expiry** after delete (no blocklist in v1).

**RAG + dummy vectors:** `RagService` and `scripts/ingest-guidelines.ts` share `src/chat/embedding-dummy.util.ts` and `src/chat/llm-provider.util.ts`. With `LLM_API_KEY` unset or dummy, query and ingest use the **same** deterministic hash. With a **Gemini** key, both use `gemini-embedding-001` (or `GEMINI_EMBEDDING_MODEL`) at 1536 dimensions. **Do not** query dummy hashes against **real** vectors, or mix OpenAI-ingested chunks with Gemini query embeddings (re-ingest with one mode only).

**Ingest guidelines (dev):** after migrate + `RAG_ENABLED` setup, run `npm run ingest:guidelines` (uses `LLM_API_KEY=dummy` → **hash** embeddings; for production similarity with OpenAI, ingest with a **real** key re-run). Default folder: `docs/guidelines/`. The script logs total `DocumentChunk` count; if the API has `RAG_ENABLED=true` but the count is **0**, startup logs a warning and retrieval returns no matches until you ingest.

### MediAI config & chat API (global prefix `api`)

Swagger: `http://localhost:4000/docs` (or your `PORT`).

**Public (no token):** `GET /api/landing`, `GET /api/onboarding/config`, `GET /api/dashboard/config`, `GET /api/chat/config`, `GET /api/ai-doctor/config`, `POST /api/chat/reply` (**410 Gone** — use general/personal JSON below), `POST /api/chat/report-issue` (body `{ "message": string }`; **optional** Bearer to attach `userId`).

**Top doctors (public, brochure-style directory):** Fees are **USD whole dollars** (same convention as MediAI `TopDoctor.consultationFees`). **Consultation booking / payments are not implemented** in v1 — read-only listings only.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/top-doctors/specialties` | Sorted distinct specialties (`published` rows only). |
| `GET` | `/api/top-doctors` | Paginated list: `page`, `pageSize` (max 50), optional `specialty`, optional `q` (max 120 chars; searches name, specialty, sub-specialty, diseases JSON text). |
| `GET` | `/api/top-doctors/:id` | Full detail (same JSON shape as MediAI `src/lib/top-doctors-content.ts` `TopDoctor`). **404** if missing or unpublished. |

**Healthcare facilities (public, facility locator):** MediAI loads the directory from this API (`GET /health-facilities` → `items[]`, same JSON shape as `HealthcareFacilityDto` in `MediAI/src/lib/health-facilities-api.ts`). Stable ids such as `fac-001`. Read-only; no admin API in v1.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health-facilities` | Paginated list: `page`, `pageSize` (max 50), optional `type` (`hospital` \| `pharmacy` \| `clinic`), optional `q` (max 120 chars; name + address). Optional `lat`+`lng` (with optional `radiusKm`, default 10 km) for geo-aware ordering and `distanceKm` on items. |
| `GET` | `/api/health-facilities/:id` | One facility by id (e.g. `fac-001`). **400** if id format is invalid. **404** if missing or unpublished. |

**Integration details (query params, examples, errors, ops):** `docs/HEALTH_FACILITIES_API_V1.md`.

**Admin — top doctors (JWT + `appRole = admin`):** `POST /api/admin/top-doctors` (create), `PATCH /api/admin/top-doctors/:id` (partial update), `DELETE /api/admin/top-doctors/:id` (soft-delete: `published = false`). Same Bearer auth as other admin routes.

**Seed (dev):** after migrate, `npx prisma db seed` inserts one sample doctor (if empty), **blog** articles from `prisma/data/blog-seed.json` (exported from MediAI `blog-content`) plus `blog_home_config`, **3 education resources** (symptom guide, glossary, knowledge base) if empty, and **healthcare facilities** from `prisma/data/health-facilities-seed.json` (if the table is empty) for the facility locator.

**Blog (public, MediAI `BlogArticle` shape):** `date` in JSON is **`dateDisplay` when set**, else derived from **`publishedAt`** (UTC) as `Jan 07, 2025` style. **Comments / likes are not in v1.**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/blog/home` | Curated UUIDs: `featuredArticleId`, `popularArticleIds`, `aiHealthcareArticleIds`, `secondOpinionArticleIds`, `companyNewsArticleIds` (replaces hardcoded lists in `blog-content.ts`). |
| `GET` | `/api/blog/categories` | Distinct categories, published only. |
| `GET` | `/api/blog/articles` | Paginated: `page`, `pageSize` (max 50), optional `category` (case-insensitive equality), optional `q` (title + intro, max 120 chars). |
| `GET` | `/api/blog/articles/:id` | Full article. **404** if missing or unpublished. |

**Admin — blog (JWT + admin):** `POST /api/admin/blog/articles`, `PATCH /api/admin/blog/articles/:id`, `DELETE` (soft), `PUT /api/admin/blog/home` (replace curation).

**Education / help (public, MediAI `ResourcePageTemplate` props):** `slug` is one of `symptom-guide`, `glossary`, `knowledge-base`. API returns `title`, `description`, `bullets[]`, optional `iconKey` (defaults to `slug` in JSON).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/education/resources` | All **published** rows, ordered by `sortOrder` then `slug`. |
| `GET` | `/api/education/resources/:slug` | One resource. **404** for unknown slug or unpublished. |

**Admin — education (JWT + admin):** `GET /api/admin/education/resources` (all, incl. unpublished), `POST /api/admin/education/resources` (**409** on duplicate `slug`), `PATCH /api/admin/education/resources/:id`, `DELETE` (soft).

**Chat (LLM) — JSON:** `POST /api/chat/personal/messages` (**JWT**), `POST /api/chat/general/messages` (optional JWT). **Multi-turn:** send `conversationId` / `sessionId` to continue. Response includes `messageId` (general includes assistant `messageId`). LLM/embedding errors map to **502/503/504** (no key material in body).

**Chat — read (JWT, personal only):** `GET /api/chat/conversations?page&pageSize`, `GET /api/chat/conversations/:id/messages?limit&before` (cursor `before` = message id; only if conversation belongs to JWT `sub`).

**Chat — SSE:** `POST /api/chat/personal/messages/stream`, `POST /api/chat/general/messages/stream` (same bodies). Response `text/event-stream`: lines `data: {"token":...}` then `data: {"done":true,...}` and `data: [DONE]`. On failure **after** 200, one line `data: {"error":{"code","message"}}` (no PHI) then the stream ends.

**Throttling (chat):** Global default **120/min** (Nest `ThrottlerGuard`) on most routes; `POST /api/chat/general/messages` (+ stream) use **separate** env caps (`CHAT_ANON_GENERAL_RPM` / `CHAT_AUTH_GENERAL_RPM`) and **skip** the default throttler for those two routes. Personal routes use stricter per-route `@Throttle` values. See `docs/CHAT_PRODUCTION_READINESS_PROMPT.md` for the full bar.

**Admin (JWT + `appRole = admin`):**
- **`GET /api/admin/config`** — static dashboard shell data (stat cards, mock tables, etc.; mirrors MediAI admin UI).
- **`GET /api/admin/summary`** — **live** DB counts: `userCount`, `profileCount`, `supportReportCount`, `adminCount`, `last24hRegistrations` (Option A: merge with static config on the client when you wire the admin UI).
- **`GET /api/admin/users`** — paginated user list (safe fields; optional `q` = email contains, max 120 chars).
- **`GET /api/admin/support-reports`** — paginated support tickets (`messagePreview` max 500 chars; optional `userId` filter).

Promote a user to admin (SQL) — re-login not strictly required: JWT strategy reloads `appRole` from the DB on each request, but a new token is fine too:  
`UPDATE "User" SET "appRole" = 'admin' WHERE email = 'you@example.com';`

**Current user (Phase 3) — source of truth for dashboard / AI Doctor localStorage cutover (JWT on all):**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/me/profile` | `profile` (MediAI `DashboardProfile` + optional `professionalProfile` JSON), `medicalHistory` (`MedicalHistoryData` or `null`), `aiDoctorSetupCompleted`. Returns **200** with `profile: null` if onboarding was never completed (no `UserProfile` row). |
| `PATCH` | `/api/me/profile` | Partial update; `professionalProfile` is shallow-merged with the stored object. Throttled. |
| `PUT` | `/api/me/medical-history` | Replaces the full `MedicalHistoryData` JSON. Throttled. |
| `PATCH` | `/api/me/ai-doctor/setup` | Body `{ "completed": boolean }` — replaces `mediai-ai-doctor-setup-completed` in the browser. |
| `GET` | `/api/me/export` | JSON **attachment**: export of profile, chat, support reports (throttled; `ME_EXPORT_MAX_BYTES`). |
| `DELETE` | `/api/me/account` | Irreversible: `{ "password" }` or `{ "confirm": "DELETE" }` for OAuth-only. Throttled. |

- **Data modeling (Phase 3):** `UserProfile` stores `professionalProfile` and `medicalHistory` as **JSONB** (Option A) plus `aiDoctorSetupCompleted`. This keeps parity with `DashboardProfile` / `ProfessionalProfile` / `MedicalHistoryData` in MediAI `src/lib/dashboard-content.ts` without normalizing to many tables (no ad-hoc SQL reporting on those fields in this phase).
- **`age`:** Stored as `ageYears` (integer) in the DB; API responses use **string** `age` (e.g. `"48"`) to match the frontend.
- **`sexAtBirth`:** The database column is required; the API always returns `male` \| `female` \| `other` (not `null`).
- **`preferredFeature`:** String IDs in JSON match the app (`ai-doctor`, `lab-test-interpretation`, `top-doctors`). Legacy `lab-interpretation` in PATCH/POST bodies maps to the same Prisma value as `lab-test-interpretation` when writing.
- **Immutability:** `role` is not changed by `/api/me/*`; the same rules as `POST /api/onboarding/complete` apply (change role is forbidden after first set).
- **Security / privacy:** All `/api/me/*` operations are user-scoped via JWT `sub` only (no `userId` in path/body for impersonation). **Do not log** full `profile` or `medicalHistory` at `info` in production. Encryption at rest and transport (TLS) are **infrastructure** concerns.

**curl examples**

```bash
curl -sS "http://localhost:4000/api/landing" | head -c 200
# Legacy reply: 410 Gone
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/chat/reply" \
  -H "Content-Type: application/json" -d '{"mode":"general","message":"test"}'
```

Prisma: `npx prisma migrate deploy` (or `migrate dev`) after setting `DATABASE_URL`.

---

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests (CMS routes; no DB required for most)
$ npm run test:e2e

# Phase 3 user profile e2e (`test/me.e2e-spec.ts`): requires migrated DB and opt-in
$ RUN_ME_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPatterns=me.e2e

# Chat e2e (`test/chat.e2e-spec.ts`): register → onboard → personal multi-turn → list/get messages → 404 for other user’s thread → general without PII in body — requires DB + opt-in
$ cd MediAI_backend && RUN_CHAT_E2E=1 DATABASE_URL="postgresql://USER:PASS@localhost:5432/DB" npm run test:e2e -- --testPathPatterns=chat.e2e

# Trust e2e (`test/trust.e2e-spec.ts`): export + delete account — opt-in
$ RUN_TRUST_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPatterns=trust.e2e

# Admin e2e (`test/admin.e2e-spec.ts`) — opt-in
$ RUN_ADMIN_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPatterns=admin.e2e

# Health facilities e2e (`test/health-facilities.e2e-spec.ts`): id validation runs by default; list/detail require migrated DB + opt-in
$ RUN_HEALTH_FACILITIES_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPatterns=health-facilities.e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
