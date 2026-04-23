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

**Chat (RAG + multi-turn + streaming):** see `docs/CHAT_IMPLEMENTATION_SPEC.md` and table below. **Backend finalization (gaps):** `docs/CHAT_MODULE_FINALIZATION_BACKEND.md`. **Production-hardening prompt (senior backend, same scope):** `docs/CHAT_PRODUCTION_READINESS_PROMPT.md`. MediAI frontend cross-reference is in those docs for a later cutover.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `FRONTEND_URL` | `http://localhost:3000` | CORS |
| `DATABASE_URL` | — | PostgreSQL; **RAG** needs `pgvector` extension (see migration `..._rag_documents_pgvector`) |
| `JWT_SECRET` | (required in prod) | |
| `JWT_EXPIRES` | `7d` | |
| `LLM_API_KEY` / `OPENAI_API_KEY` | — | `dummy` / unset = no paid API (deterministic dev text). Real key: `CHAT_LLM_MODEL` (default `gpt-4o-mini`), `LLM_BASE_URL` for OpenAI-compatible APIs. |
| `EMBEDDING_API_KEY` | (falls back to LLM key) | Used when `RAG_ENABLED=true` for query + ingest |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim vectors in DB |
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

**RAG + dummy vectors:** `RagService` and `scripts/ingest-guidelines.ts` share `src/chat/embedding-dummy.util.ts`. With `LLM_API_KEY` unset or dummy, query and ingest use the **same** deterministic hash. **Do not** query dummy embeddings against chunks produced with a **real** API key (re-ingest with one mode only).

**Ingest guidelines (dev):** after migrate + `RAG_ENABLED` setup, run `npm run ingest:guidelines` (uses `LLM_API_KEY=dummy` → **hash** embeddings; for production similarity with OpenAI, ingest with a **real** key re-run). Default folder: `docs/guidelines/`.

### MediAI config & chat API (global prefix `api`)

Swagger: `http://localhost:4000/docs` (or your `PORT`).

**Public (no token):** `GET /api/landing`, `GET /api/onboarding/config`, `GET /api/dashboard/config`, `GET /api/chat/config`, `GET /api/ai-doctor/config`, `POST /api/chat/reply` (**410 Gone** — use general/personal JSON below), `POST /api/chat/report-issue` (body `{ "message": string }`).

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
$ RUN_ME_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPattern=me.e2e

# Chat e2e (`test/chat.e2e-spec.ts`): multi-turn, read APIs, general PII check — opt-in
$ RUN_CHAT_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPattern=chat.e2e

# Trust e2e (`test/trust.e2e-spec.ts`): export + delete account — opt-in
$ RUN_TRUST_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPattern=trust.e2e

# Admin e2e (`test/admin.e2e-spec.ts`) — opt-in
$ RUN_ADMIN_E2E=1 DATABASE_URL="postgresql://..." npm run test:e2e -- --testPathPattern=admin.e2e

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
