# Trust & compliance — production implementation prompt (MediAI_backend)

**Role:** Senior/staff backend engineer + full-stack awareness (MediAI Next.js consumes these APIs; do **not** implement UI in this task unless noted as contract-only).

**Scope:** Small, real **user rights** + **traceability** for data already stored: `User`, `UserProfile` (incl. `medicalHistory` JSON), `ChatConversation` / `ChatMessage`, `SupportReport`, `PasswordResetToken`.

**Non-negotiables:** Implement **only in `MediAI_backend`**. No PHI in `log.info` / application logs. Pass `npm test` and `npm run build`. Document env vars and migration steps in `README.md`.

**Reference — current state (pre-work):**
- `GET|PATCH /api/me/profile`, `PUT /api/me/medical-history`, `PATCH /api/me/ai-doctor/setup` — **no** audit trail, **no** export, **no** account delete.
- `SupportReport` — `userId` optional, `onDelete: SetNull` (reports remain if user deleted at DB level).
- `ChatConversation` / `ChatMessage` — `userId` on conversations, cascade delete with `User`.
- **No** `AuditLog` (or equivalent) model today.

Use the sections below as acceptance criteria and backlog.

---

## 1. Data subject export (“download my data”)

### 1.1 API

- `GET /api/me/export` (or `POST` if you prefer not to cache) — **JWT required** (identity = `sub` only).
- Response: **JSON** (preferred for v1) with stable schema and `Content-Disposition: attachment; filename="mediai-export-<userId>-<iso-date>.json"` (or `application/json` without attachment if you document client handling).

### 1.2 Payload content (machine-readable, complete)

Include at minimum:
- `exportVersion` (e.g. `1`), `exportedAt` (ISO-8601 UTC), `user`: `{ id, email, createdAt }` (no `passwordHash`, no tokens).
- `profile`: full `UserProfile` row **as returned to the client** (reuse `userProfileToDashboardProfile` + `parseMedicalHistory` for consistency) **or** raw DB fields with a documented mapping — **one** approach, not both.
- `chat`: all **personal** `ChatConversation` for this `userId` with nested `ChatMessage` (chronological), including `metadata` if present. **Exclude** or clearly separate **general** threads that are not tied to this user if any exist with `userId` set; document the rule.
- `supportReports`: all `SupportReport` rows where `userId` = `sub` (message text is user-generated; include for completeness or redact with a flag — **document**).

### 1.3 Performance and safety

- **Size cap:** if export would exceed a configurable max (e.g. 5–10 MB JSON), return **413** with `{ error, message, hint: 'contact_support' }` or implement **async export** (out of scope for v1 unless required — then queue + email link; document as phase 2).
- **Throttling:** strict `@Throttle` on this route (e.g. 3/hour per user).
- **Logging:** log `event=data_export` with `userId`, `httpStatus`, `byteLength` (not contents).

### 1.4 OpenAPI

- Document response shape and 401/404/413/429.

---

## 2. Account deletion (right to erasure — “close my account”)

### 2.1 API

- `DELETE /api/me/account` — **JWT required**.
- **Strongly recommended:** require **password confirmation** in body for email/password users: `{ "password": "..." }`. For **Google-only** users (no `passwordHash`), require a **typed confirmation** string (e.g. `{ "confirm": "DELETE" }`) or a **one-time token** flow — pick one, document, and return **400** with clear errors.

### 2.2 Deletion semantics (transactional)

In a **single DB transaction** (or ordered steps with clear rollback story):

1. Delete or nullify user-owned data:
   - **Cascade** already handles `UserProfile`, `PasswordResetToken`, `ChatConversation` (and messages) per schema — verify no orphan `ChatMessage`.
   - `SupportReport`: current schema **SetNull** on `userId` — **decide product policy:**
     - **A)** Retain report text for abuse/legal (userId nulled) — document as “anonymized retention”, or
     - **B)** Delete reports where `userId` = sub — implement explicit delete in transaction.
2. Delete `User` row (or soft-delete if you add `deletedAt` — v1 can be **hard delete** if product agrees).
3. **Invalidate sessions:** if using refresh tokens or a session store later, document “JWT until expiry” gap; for v1, document that access tokens remain valid until `JWT_EXPIRES` unless you add a token blocklist (optional phase 2).

### 2.3 Response

- **204 No Content** on success, or **200** with `{ "deleted": true }` — one convention, documented.

### 2.4 Logging

- `event=account_deleted` with `userId` (id only, once), `method` (password vs google), **no** email in info logs if policy says avoid it (or hash email for ops).

### 2.5 OpenAPI

- Document 401, 400 (wrong password), 409 if you disallow delete when **admin** (optional rule).

---

## 3. Minimal audit log (sensitive changes)

### 3.1 Model (Prisma migration)

Add `AccountAuditLog` (names may vary) with e.g.:

- `id` (uuid), `userId` (FK → `User`, **onDelete Cascade** or **SetNull** if you want to keep “orphan” audit for deleted users — prefer **retain row with userId** only if legal needs; else cascade and accept loss on delete).
- `action` — enum: e.g. `profile_patch`, `medical_history_put`, `ai_doctor_setup_patch`, `data_export`, `account_delete_request`, `account_delete_completed`.
- `ip` — optional `String?` (max length), from `req.ip` / first `X-Forwarded-For` **only** if behind trusted proxy (document).
- `userAgent` — optional trimmed string (max 512).
- `metadata` — **Json?** for non-PHI: e.g. `{ "fieldsTouched": ["age", "medicalHistory"] }` — **never** full before/after of medical data at info level; **never** log full message bodies.

### 3.2 Where to write

- In `MeService` after successful `patchProfile`, `putMedicalHistory`, `patchAiDoctorSetup` — one row per request with **field-level summary** (which sections changed), not content.
- On successful export: `data_export` with `{ byteLength }` in metadata.
- On successful account delete: log **before** user row removal (`account_delete_completed`) or only `account_delete_request` at start — **one** event minimum for traceability.

### 3.3 Read API (optional v1)

- `GET /api/me/audit-log?limit=&cursor=` — **JWT**, paginated, returns **own** events only. Throttled. If time-boxed, **skip** read API and only persist for **admin** future use — document.

### 3.4 Admin (optional)

- Defer `GET /api/admin/users/:id/audit` to Admin v2 — not required for v1 if audit is user-only read or write-only.

---

## 4. Security and headers

- **Auth:** all routes `AuthGuard('jwt')`; **no** `userId` in path/body for “me” operations.
- **Rate limits:** export and delete stricter than normal `me` routes.
- **IP / Forwarded-For:** same trust model as `CHAT_ANON_GENERAL_RPM` — document in README: “set `TRUST_PROXY=true` or only enable IP capture when `X-Forwarded-For` is set by a trusted load balancer.”

---

## 5. Testing

- **Unit:** service methods build correct export object; delete transaction order; audit writer does not throw on missing optional fields.
- **E2E (opt-in `RUN_TRUST_E2E=1` + `DATABASE_URL`):** register → onboard → patch profile → `GET /api/me/export` contains expected keys → `DELETE /api/me/account` → `GET /api/me/profile` returns 401 and subsequent login fails (or 404 for user).

---

## 6. Documentation (`README.md`)

- New env vars (export max bytes, throttles, trust proxy).
- **Legal disclaimer:** not legal advice; operators may need DPA / HIPAA / GDPR analysis for their jurisdiction.
- **Frontend (MediAI):** one paragraph: “Settings → Download data / Delete account” should call these endpoints; handle 401 after delete by clearing local storage and redirecting to sign-in.

---

## 7. Suggested implementation order (small PRs)

1. Prisma `AccountAuditLog` + migration; audit writer helper; wire `MeService` mutating paths.
2. `GET /api/me/export` + tests + README.
3. `DELETE /api/me/account` + policy on `SupportReport` + tests + README.
4. Optional `GET /api/me/audit-log` for self-service.

---

## 8. Success criteria

- User can **download** a complete JSON export of their stored MediAI data (profile + personal chat + support reports per policy).
- User can **delete** account with a **clear** second factor (password or confirm flow).
- Sensitive **writes** leave a **non-PHI** audit trail for compliance and future admin.
- No new PHI in application logs; Swagger documents new routes; CI green.

---

*End of prompt.*
