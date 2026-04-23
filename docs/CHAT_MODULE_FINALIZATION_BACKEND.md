# Chat module — finalization (backend only)

**Use this as the implementation prompt / ticket pack for a coding agent or engineer.**  
**Scope:** `MediAI_backend` only — **do not** modify the MediAI Next.js app in this phase. Expose and document stable APIs; the frontend will integrate **later** using the **§4 Frontend reference** as the contract.

**Prerequisite:** current chat v2 (personal/general JSON, SSE, RAG, multi-turn) is in place. This document closes **known gaps** and **hardens** the module for production.

---

## 1. Objectives

| # | Objective |
|---|-----------|
| O1 | **Retire or strictly scope** the legacy `POST /api/chat/reply` so there is a single, clear product story. |
| O2 | **Document and enforce** embedding / RAG strategy (dummy dev vs OpenAI) so operators cannot misconfigure. |
| O3 | **Throttling** — distinguish anonymous `general` (IP-based) vs authenticated (userId-based) per spec. |
| O4 | **Operational APIs** (read-only) so a future UI can list threads without inventing new patterns. |
| O5 | **E2E** (opt-in env) for auth → onboard → personal chat (mocked LLM). |
| O6 | **Error contract** for streaming documented in Swagger + README. |
| O7 | **Optional (phase B):** in-process **daily cap** per user for chat sends (configurable, no Redis in v1). |

---

## 2. Gap → deliverable (backend)

### 2.1 Legacy `POST /api/chat/reply`

- **Current:** public mock, `{ reply, author }` — out of line with the real stack.
- **Choose one and implement:**
  - **A (preferred):** Return **410 Gone** (or 301 to docs) with JSON `{ "message": "…", "migration": "POST /api/chat/general/messages" }` and log once per day at warn, **or**
  - **B:** Thin **proxy:** internally call the same service as `POST /api/chat/general/messages` with **no persistence** (or persist — document choice), map response to legacy `{ reply, author }` for old clients; mark **deprecated** in OpenAPI with sunset note.
- **Do not** leave two unrelated mock behaviors long-term.

### 2.2 RAG / embedding consistency

- **Document in README (required):**
  - `LLM_API_KEY=dummy` (or empty) → **hashed** pseudo-embeddings for both **ingest** and **query**; chunks ingested with **real** OpenAI embeddings are **not** similar to query vectors under dummy.
  - **Production check:** if `RAG_ENABLED=true`, recommend **real** keys for both ingest and runtime, or set `RAG_ENABLED=false` until re-ingest with a single strategy.
- **Code (optional but good):** shared module `src/chat/embedding-dummy.util.ts` used by **both** `RagService` and `scripts/ingest-guidelines.ts` (one implementation of `hashDummyEmbedding`).

### 2.3 Throttling: anonymous general vs authenticated

- **Current:** `Throttle` on routes with global defaults.
- **Implement:** custom **`ThrottlerStorage`** or a **`Guard`** before `ThrottlerGuard` on `POST /api/chat/general/messages` and `.../stream`:
  - If **no** `req.user`: key = **hashed** `X-Forwarded-For` or `req.ip` (stricter limit, e.g. 20/min per IP from env `CHAT_ANON_GENERAL_RPM`).
  - If `req.user`: use existing per-user throttling (`CHAT_GENERAL_RPM` or reuse global).
- **Personal** routes: keep per-user / JWT (no IP primary).
- **Document** env names and numbers in README.

### 2.4 Read API for conversations (for future “chat list” UI)

- **Add (all JWT):**
  - `GET /api/chat/conversations?kind=personal|all` — list `ChatConversation` for `sub`, paginated (`cursor` / `limit`), **no message bodies** in list (or last message preview optional with max length 200 chars).
  - `GET /api/chat/conversations/:conversationId/messages?limit=50&before=messageId` — paginated history for a conversation **owned** by the user.
- **General (anonymous) threads** — if `userId` is null, **do not** expose a list without a **secret** `clientSessionId` in query (or skip GET for general until product defines it). **Minimal v1:** `GET` conversations/messages **personal only**; document that general list is TBD.
- **Swagger** + DTOs for every field.

### 2.5 Streaming error contract

- **Document in Swagger and README:**  
  On provider failure, non-streaming returns **502/503** with JSON body.  
  For SSE, stream may send `data: {"error":"..."} ` (one event) then close — clients **must** parse.  
- **Optional:** send `data: [DONE]` after error for consistent parsers (document either way).

### 2.6 E2E tests (opt-in)

- **Env:** `RUN_CHAT_E2E=1` and `DATABASE_URL` (migrated DB with `pgvector` if testing RAG).
- **Scenarios:**
  1. Register + JWT → `POST /onboarding/complete` → `POST /api/chat/personal/messages` (mock `LlmService` in test module) → 200, `conversationId` present.
  2. Second `POST` with same `conversationId` — assert mock LLM received **more than one** `user` message in `messages` array (prove multi-turn).
  3. `POST /api/chat/general/messages` without auth — 200; assert last LLM `messages` block **does not** contain a known PII string seeded only in `UserProfile` of another test user.
- **CI:** if no DB, skip (same pattern as `me.e2e`).

### 2.7 Optional phase B: daily cap (in-process)

- **Module-level `Map<userId, { count, resetAt }>`** (or per-day key `userId+YYYY-MM-DD`) — cap `CHAT_PERSONAL_DAILY=100` / `CHAT_GENERAL_DAILY` for authed users; **return 429** with `Retry-After` if exceeded.
- **Log** only `userId` and count, not messages.
- **Document:** not durable across restarts / multi-instance — for **strict** global caps use Redis later.

### 2.8 Optional phase B: rolling summary

- If `ChatMessage` count in a conversation &gt; N, call a small model or truncate-only strategy to add a `system` note — **out of core finalization** unless time allows; if skipped, add **“Not implemented”** in README with link to this doc.

---

## 3. Non-goals (this task)

- No **MediAI/** Next.js edits.
- No **file upload** for RAG in this task.
- No **Redis** for throttling/caps unless explicitly added later.
- **Content moderation** — stub interface only (optional: `ContentModerationService` no-op) if you want a seam for a future provider.

---

## 4. Frontend reference (documentation only — integration later)

> **Do not change these paths in the backend task.** This table is the **handoff** for when the client team wires the app.

| MediAI (today) | Target Nest (after finalization) |
|----------------|------------------------------------|
| `src/lib/services/app-content.ts` `sendMockChatMessage` → `POST /chat/reply` | `POST {NEXT_PUBLIC_NEST}/api/chat/personal/messages` + `Authorization` and `POST .../general/messages` (see README). |
| `src/lib/axios.ts` `baseURL` | Set `NEXT_PUBLIC_API_URL` to **Nest** `.../api` (not only Next BFF) for chat. |
| `src/app/api/chat/reply/route.ts` (Next mock) | Replaced by Nest; can delete route after cutover. |
| Personal / general **routes** in `app/dashboard/ai-doctor/...` | Map **UI mode** to **correct** endpoint + store `conversationId` / `sessionId` in client state. |
| Optional: chat **history** screen | Use new `GET /api/chat/conversations` (personal) + messages if implemented in **§2.4**. |

**Auth header:** reuse the same **access token** as login; personal chat **must** send `Authorization: Bearer <accessToken>`.

---

## 5. Files likely touched (backend)

- `src/chat/chat.controller.ts` — legacy behavior, new GET routes, throttling imports.
- `src/chat/*service*.ts` — conversation listing, optional daily cap.
- `src/chat/guards/` (new) or `src/auth/guards/` — `AnonymousThrottlerGuard` / IP helper.
- `test/chat.e2e-spec.ts` (new, opt-in).
- `docs/CHAT_MODULE_FINALIZATION_BACKEND.md` (this file) — mark sections done when complete.
- `README.md` — RAG/embedding, throttling, GET APIs, E2E env, streaming errors.

---

## 6. Definition of done (acceptance)

- [ ] Legacy `POST /api/chat/reply` behavior is **A or B** (§2.1) and documented in Swagger.  
- [ ] README explains **RAG + dummy vs real** embeddings; optional shared `embedding-dummy.util.ts`.  
- [ ] **General** chat has **stricter** anonymous throttling (IP) where applicable (§2.3).  
- [ ] `GET` conversation(s) for **personal** users (§2.4) with ownership checks.  
- [ ] **SSE** error contract documented (§2.5).  
- [ ] `RUN_CHAT_E2E=1` E2E pass locally with instructions in README.  
- [ ] No changes under `MediAI/`.  
- [ ] `npm test` and `npm run build` pass.

---

## 7. One-line handoff

**Finalize the backend** by closing legacy contract ambiguity, **hardening throttles and RAG operations**, **adding read APIs for personal threads**, **E2E + docs**, and **leaving the MediAI app unchanged** until the team uses **§4** to point `axios` at Nest and replace `sendMockChatMessage`.
