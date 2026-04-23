# MediAI — Chat (Personalized + General) — Implementation Specification

**Audience:** Senior backend + RAG implementers. Frontend teams use **§11** for integration mapping.  
**Scope:** Implement **backend only** (NestJS, Prisma, optional pgvector). **Do not** change the Next.js app in the same task. Expose stable HTTP APIs and OpenAPI for later client wiring.

---

## 1. Product behavior

### 1.1 Personalized chat

**Route (target):** `POST /api/chat/personal/messages`  
**Actor:** Authenticated user (`Authorization: Bearer <accessToken>`).

- Server loads only the current user from DB: `UserProfile` + optional `medicalHistory` JSON. **Never** accept a full profile from the client for authorization; **JWT `sub` is the only user identity.**
- Build a **compact** “user context” string server-side; inject into the LLM system prompt, plus **optional** RAG chunks (global knowledge base). User-specific document uploads are **out of scope** unless added later.
- **Output:** `reply: string`, optional `citations[]` if RAG is on.

### 1.2 General chat

**Route (target):** `POST /api/chat/general/messages`  
**Actor:** Unauthenticated or authenticated.

- **Must not** inject user profile, `userId`, or `medicalHistory` into the model context.
- If `Authorization` is present, use it **only** for throttling / abuse; **not** for loading profile.
- System line must state that the model **has no access to this user’s medical record or saved profile.**
- **Output:** same JSON shape; **no** user fields in the prompt.

---

## 2. Non-functional requirements

- **Throttling:** Stricter on unauthenticated `general`; per-user on `personal`.
- **Logging (info):** `requestId`, route, `userId` if present, mode, token usage — **not** full user messages, full profile, full medical history, or full RAG chunks in production.
- **PII/PHI:** profile + `medicalHistory` only in the **personal** code path; never in **general** LLM builder.
- **Streaming:** optional in v1; v1 can be JSON-only; document SSE in v1.1.

---

## 3. Data model (Prisma) — minimum

### 3.1 Conversation + messages (recommended for v1)

- **`ChatConversation`:** `id`, `userId` (required for `personal`); for `general` you may use `userId: null` + `clientSessionId` or require auth for both — **pick one strategy, document in README.**
- **`ChatMessage`:** `id`, `conversationId`, `role` (`user` | `assistant` | `system`), `content`, `createdAt`, `metadata?` (JSON: citations, `usage`).

*Alternative (smaller v1):* stateless `POST` only, no DB — not recommended if product needs history.

### 3.2 RAG (optional)

- `Document`, `DocumentChunk` with `embedding` (e.g. pgvector).  
- v1.1: ingestion pipeline; v1 can **skip** tables and use **static** short guidelines in code + `LlmService` only.

---

## 4. RAG design (when enabled)

- **Query:** last user message (and optionally last N turns if persisted).
- **Embedding:** e.g. OpenAI `text-embedding-3-small` (or configured provider).
- **Retrieval:** top-K (e.g. 5) chunks; optional filter `audience` (e.g. `general` | `all`).
- **Personal prompt assembly:**  
  `system: safety + "User context (from our records only):" + userContext + "Relevant guidelines:" + chunk texts`
- **General prompt assembly:**  
  `system: safety + "You have no user record." + "Relevant guidelines:" + chunk texts`

---

## 5. API design (`/api` prefix on Nest app)

### 5.1 `POST /api/chat/personal/messages`

| Item | Value |
|------|--------|
| **Auth** | `Authorization: Bearer` **required** (401 otherwise) |
| **Body** | `message: string` (max ~8000), `conversationId?: string` |
| **200** | `{ reply, conversationId, messageId, citations? }` |

### 5.2 `POST /api/chat/general/messages`

| Item | Value |
|------|--------|
| **Auth** | Optional (rate limit if present) |
| **Body** | `message: string` (max ~8000), `sessionId?: string` (client correlation, not PHI) |
| **200** | `{ reply, citations? }` — no user fields |

### 5.3 Legacy (optional)

- `POST /api/chat/reply` (body `{ mode, message }`): either forward **general** only, keep mock behind flag, or deprecate in Swagger. Current Nest implementation is mock — align when implementing.

### 5.4 OpenAPI

All DTOs: `class-validator` + `@ApiProperty`; document 400/401/429.

---

## 6. Backend module layout (NestJS)

- **`ChatModule`**
  - `ChatController` — `AuthGuard('jwt')` **only** on `personal` route
  - `ChatService` — load profile (personal only) → `UserContextService` → `RagService`? → `LlmService` → persist
  - `UserContextService` — `UserProfile` + `medicalHistory` → bounded string (`USER_CONTEXT_MAX_CHARS`); **truncate** with `[truncated]`
  - `RagService` — `retrieve()` or stub `[]` if RAG off
  - `LlmService` — one integration point: `completeChat({ system, userMessages })` → `{ text, usage? }`
- Reuse `PrismaService`, existing `User` / `UserProfile` models

### 6.1 Environment (illustrative)

- `LLM_API_KEY` / `OPENAI_API_KEY`
- `CHAT_PERSONAL_RPM` / `CHAT_GENERAL_RPM` (or Nest Throttler on routes)
- `RAG_TOP_K`, `RAG_MIN_SCORE`
- `USER_CONTEXT_MAX_CHARS=4000`
- `RAG_ENABLED=false` to run without embeddings/tables in dev

---

## 7. Security checklist

- [ ] Personal: no `userId` in request body; identity from JWT only
- [ ] General: assert user context is **never** passed to the LLM builder
- [ ] No full message or profile in `info` logs
- [ ] Throttles on both endpoints; validate max lengths
- [ ] Reject empty `message` after trim

---

## 8. Testing (backend)

- **Unit:** `UserContextService` — bounded output; no leak of raw 100KB JSON
- **Integration / E2E:** with mocked `LlmService` — `POST /personal` with JWT returns `reply` + ids; `POST /general` without token — assert prompt to mock does **not** include a seeded value from a user’s profile in DB

---

## 9. Deliverables (this repo) — **implemented (v1 + v2)**

- [x] Prisma: `ChatConversation`, `ChatMessage` (`20260422120000_chat_conversations`)
- [x] Prisma RAG: `Document`, `DocumentChunk` + pgvector (`20260423100000_rag_documents_pgvector`)
- [x] `POST /api/chat/personal/messages` + `POST /api/chat/general/messages` (multi-turn via DB history + token budget)
- [x] `POST .../personal/messages/stream` + `.../general/messages/stream` (SSE)
- [x] `UserContextService`, `LlmService` (dummy, JSON + **stream** OpenAI), `RagService` (embeddings + top-K when `RAG_ENABLED=true`)
- [x] `OptionalJwtAuthGuard` for general route
- [x] `scripts/ingest-guidelines.ts` + `npm run ingest:guidelines` + sample `docs/guidelines/*.md`
- [x] Unit tests: message history util, `sendGeneral` does **not** call `UserContextService`
- [x] Legacy `POST /api/chat/reply` — deterministic mock, **deprecated** in Swagger

**Env (LLM / RAG):** `LLM_API_KEY=dummy` for dev. For real RAG similarity aligned with OpenAI, ingest with a **real** key; query embedding uses the same model family (`EMBEDDING_MODEL`).

**Out of scope (unchanged):** any change under `MediAI/` (Next app).

---

## 11. Frontend cross-reference (MediAI Next.js — for integration *later*)

> **Do not modify these files in the backend task.** This section documents **today’s** app so a future cutover is explicit.

### 11.1 Routes (UI)

| App route | Component | `ChatMode` |
|-----------|-----------|------------|
| `src/app/dashboard/ai-doctor/personal/page.tsx` | `ChatConversationPage` with `mode="personal"` | `personal` |
| `src/app/dashboard/ai-doctor/general/page.tsx` | `ChatConversationPage` with `mode="general"` | `general` |
| Professional user | `src/components/dashboard/professional-chat-pages.tsx` (clinical chat) | still calls chat service with `personal` for the assistant | 

### 11.2 Client → API (today)

- **File:** `MediAI/src/lib/services/app-content.ts`  
- **Function:** `sendMockChatMessage(mode, message)`  
- **HTTP:** `api.post("/chat/reply", { mode, message })`  
- **Response type (today):** `{ reply: string; author: string }` — backend spec uses **`reply` + `conversationId` + `messageId` + `citations?` for new endpoints;** the client will need a small type update when integrated.

### 11.3 Axios base URL (today)

- **File:** `MediAI/src/lib/axios.ts`  
- **Default:** `baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api"`  
  - If `NEXT_PUBLIC_API_URL` is **unset**, requests hit the **Next.js** app under `/api/...` (BFF), not Nest on :4000.  
  - For **direct Nest** usage, set e.g. `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

### 11.4 Next.js mock API (today)

- **File:** `MediAI/src/app/api/chat/reply/route.ts`  
- **Behavior:** calls `getReplyForMode` from `src/lib/chat-content.ts` — **no profile**, template strings only.  
- **Cutover note:** new Nest routes (`/chat/personal/messages`, `/chat/general/messages`) replace this pattern; personal flow must add **`Authorization`** from your auth store.

### 11.5 Local types & copy (today)

- **`ChatMode`:** `src/lib/chat-content.ts` (`"personal" | "general"`)  
- **UI copy** (“uses your profile”, “no memory”) is **not** backed by data sent to the server today — the new backend is what will make that true for **personal** only.

### 11.6 Optional future client mapping

| New backend endpoint | Intended frontend use |
|----------------------|------------------------|
| `POST /api/chat/personal/messages` + `Authorization` | Personal route + any flow that needs user context (send `message`, optional `conversationId`) |
| `POST /api/chat/general/messages` | General route, **no** `Authorization` (unless you want per-account rate limit only) — send `message`, optional `sessionId` |
| `POST /api/chat/reply` | Deprecate or keep as thin proxy to `general` for backward compatibility |

---

## 12. One-line success criterion

**Personal** chat: JWT + DB user context in the model prompt, optional RAG. **General** chat: same RAG/ guidelines path with **no** user record in the prompt. **Stable OpenAPI** for the MediAI client to call after `NEXT_PUBLIC_API_URL` points at Nest and auth headers are added for personal.
