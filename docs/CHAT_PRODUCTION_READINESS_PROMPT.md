# Senior Backend — Chat module production hardening (implementation prompt)

**Role you are taking:** Staff / senior backend engineer on MediAI_backend (NestJS, Prisma, PostgreSQL, JWT, optional pgvector).

**Non-negotiables:**
- Implement **only in `MediAI_backend`**. Do **not** modify the MediAI Next.js app, axios, or `sendMockChatMessage` in this phase.
- Treat `docs/CHAT_IMPLEMENTATION_SPEC.md` (feature contract) and **`docs/CHAT_MODULE_FINALIZATION_BACKEND.md`** (gap closure) as the baseline. This document **raises the bar to production** (reliability, operability, security, clarity).
- The **“Frontend reference”** sections in those docs are **read-only** documentation for a **later** integration; do not build UI here.

Use the sections below as a **task backlog and acceptance bar**. Check items off in PR descriptions.

---

## A. API contract and legacy

1. **Legacy `POST /api/chat/reply`:** implement **one** of: **410** with a stable JSON error body and migration link to `GET /api/docs` or to general JSON endpoint, **or** a **thin, documented proxy** to general (no user profile) returning `{ reply, author }` for compatibility. **Remove** silent divergence between mock and real stack.
2. **Versioning / deprecation:** OpenAPI `deprecated: true` on legacy; document removal timeline in `README.md`.
3. **Idempotency (optional):** accept `clientRequestId` (header or body) for `POST` chat routes; de-dupe in-memory 60s window or document “at-least-once” and accept duplicates in DB with optional unique index later.

---

## B. Security and trust boundaries

1. **Authorization on every new read path:** any `GET /api/chat/...` must assert `ChatConversation.userId === JWT sub` (personal) or a documented, secure rule for `clientSessionId` (if you expose general history at all).
2. **Never** add `userId` or `profile` to request body for personal chat; keep identity from **JWT `sub` only** (regression test).
3. **PII/PHI logging:** guardrails — no full `message`, `systemPrompt`, or `userBlock` in `log.info` in production. Use `requestId`, `userId` (if any), `conversationId`, `route`, `latencyMs`, `model`, `usage`, `httpStatus` only. Code review: grep for `log` in `chat/`.
4. **Streaming:** if auth fails mid-request, return **4xx** before any SSE body; if provider fails, one `data: {"error":{...}}` (or document exact shape) and close stream — document for clients in Swagger.

---

## C. Reliability and degradations

1. **LLM down:** `LlmService` should map to **502/503** with a **user-safe** message, no API key in response; **retry=0** for client in body header optional.
2. **RAG down / pgvector missing:** `RagService` already swallows; ensure **no** 500 to user; personal/general still return reply without citations (document).
3. **Timeout:** set **fetch** timeouts on LLM and embedding calls (e.g. 30s) via `AbortSignal` + `ConfigService`; 504 to client on timeout.
4. **Max payload** — already 8k on message; confirm body parser limits align for Nest/Express.

---

## D. Throttling and abuse (production bar)

1. **Anonymous `POST /api/chat/general/...`:** stricter cap **per client IP** (or `X-Forwarded-For` when behind a trusted proxy — document trust requirement). Use env, e.g. `CHAT_ANON_GENERAL_RPM=20` vs `CHAT_AUTH_GENERAL_RPM=60`. Implement via custom guard or Throttler `generateKey` per route.
2. **Authenticated** personal + general: per-`userId` limits; separate limits for **stream** vs **JSON** if you expect higher stream fan-out.
3. **Optional (phase 2):** in-process **daily** cap for authed users (`CHAT_DAILY_CAP=500`) with clear 429 and `Reset` semantics in README; document **not** multi-replica safe without Redis.

---

## E. RAG and embeddings (operations)

1. **Single source of truth** for “dummy” embedding: extract shared util used by `RagService` + `ingest-guidelines` script; README: **never** mix dummy query with real-ingested chunks.
2. **Ingestion:** add `npm run` script validation — fail if `RAG_ENABLED=true` but `DocumentChunk` count = 0 (optional preflight or doc check).
3. **Backups:** document that RAG is **in DB**; backup strategy is operator responsibility (out of code).

---

## F. Read APIs (for a future “conversation list” UI; backend only)

1. `GET /api/chat/conversations` (JWT) — list threads for `sub` (`kind`, `id`, `createdAt`, `updatedAt`, optional one-line `lastMessagePreview` with max length 200, **redacted** if you ever add scrubbing).
2. `GET /api/chat/conversations/:id/messages?limit=&before=` (JWT) — only if `:id` belongs to `sub`; paginate; return roles + content as stored (clients handle rendering).
3. **General anonymous:** do **not** add list-by-session without a **high-entropy** secret in URL or HMAC — or defer general list entirely and document as **personal-only v1**.

---

## G. Observability (production)

1. **Structured logging:** at least one log line per completed chat request: `event=chat_response`, `requestId`, `mode=personal|general`, `userId?`, `stream=false|true`, `ms`, `llmModel`, `ragHits` (count), `status=ok|error` — **no** free-text PHI.
2. **Metrics (optional in code):** increment counters `chat_requests_total{mode,status}` if you add Prometheus; else document “add from logs.”
3. **Correlation:** echo `X-Request-Id` if present, else generate; attach to all logs in request scope (Nest `ClsService` or middleware) — optional if time-boxed, but document gap.

---

## H. Tests (Definition of done)

1. **Unit:** retain / extend `sendGeneral` does not call `UserContextService`; add tests for **ownership** on a fake `GET` controller if you add it.
2. **E2E (opt-in `RUN_CHAT_E2E=1`):** register → onboard → two personal messages same `conversationId` → assert mock LLM sees **2+** user messages in the payload. General: no cross-user PII in prompt (existing idea from finalization doc).
3. **Load:** not required; document p95 target in README (operator-run).

---

## I. Documentation (ship with code)

1. `README.md` — throttling table, RAG + dummy vs real, new GET routes, E2E env, streaming error format, trust proxy for IP, timeouts.
2. `docs/CHAT_MODULE_FINALIZATION_BACKEND.md` — mark completed **§** with dates or link to PRs.

---

## J. Frontend (documentation only — do not implement)

Reference for **future** client work (no code in this task):

| Concern | Later integration |
|--------|--------------------|
| Base URL | `NEXT_PUBLIC_API_URL` → Nest `https://.../api` |
| Auth | `Authorization: Bearer` on personal; optional on general |
| State | Store `conversationId` / `sessionId` in client for multi-turn |
| Legacy | Remove or redirect `app/api/chat/reply` in Next when Nest is source of truth |

**Exact file paths** for the current MediAI app remain in `docs/CHAT_IMPLEMENTATION_SPEC.md` **§11**.

---

## K. One-sentence success criterion

A security-reviewed, throttled, logged, and tested **MediAI_backend** chat module that can run **reliably** in production (with **clear** RAG/embedding and legacy behavior) while the **Next.js** team integrates **only after** this backend work is complete and contract-stable.

---

*End of prompt. Implement in small PRs: (1) legacy + throttles + docs, (2) GET conversations, (3) E2E + hardening, (4) optional daily caps and observability.*
