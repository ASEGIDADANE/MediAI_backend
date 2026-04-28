# Chat API — frontend handoff (MediAI Next.js)

Backend-only reference for wiring the MediAI app to **Nest** (`MediAI_backend`). **Do not** assume these routes exist in the Next.js `app/api` BFF unless you proxy there.

## Base URL

- Use the Nest base including the global prefix: **`https://<host>/api`** (local dev often `http://localhost:4000/api`).
- Set the client `baseURL` / env (e.g. `NEXT_PUBLIC_API_URL`) to that **`.../api`** origin so paths are `/chat/...`, not duplicated.

## Personal AI chat (uses server-side user profile)

- **Auth:** `Authorization: Bearer <accessToken>` (same JWT as login/register).
- **Send message (JSON):** `POST /api/chat/personal/messages`  
  Body: `{ "message": string, "conversationId"?: string }`  
  First turn: omit `conversationId` (server creates a thread). Next turns: send the returned `conversationId`.
- **Streaming (SSE):** `POST /api/chat/personal/messages/stream` — same body; parse `text/event-stream` (`data: {"token":...}`, then `done`, then `[DONE]`; errors may appear as `data: {"error":...}`).
- **List threads:** `GET /api/chat/conversations?page&pageSize` (JWT).
- **Messages in a thread:** `GET /api/chat/conversations/:conversationId/messages?limit&before` (JWT; `before` = message id cursor).

## General AI chat (no user profile in the model)

- **Auth:** optional. If the user is logged in, sending Bearer can affect **rate limits** / quota only, not the model context.
- **Send (JSON):** `POST /api/chat/general/messages`  
  Body: `{ "message": string, "sessionId"?: string }`  
  Reuse `sessionId` from the response metadata / your client state for multi-turn **general** threads.
- **Streaming:** `POST /api/chat/general/messages/stream` — same idea as personal SSE.

## Legacy endpoint

- **`POST /api/chat/reply`** — returns **410 Gone**. Migrate to personal/general routes above.

## Optional: RAG citations

- When the server has `RAG_ENABLED=true` and ingested guidelines, JSON responses may include **`citations`** (array). The UI may show them as footnotes or “sources” if product wants it.

## Support / report issue

- **`POST /api/chat/report-issue`** — body `{ "message": string }`.  
- **Optional:** `Authorization: Bearer` to store `userId` on the report; works anonymously without token.

## OpenAPI

- Interactive docs: **`GET /docs`** on the Nest port (e.g. `http://localhost:4000/docs`).
