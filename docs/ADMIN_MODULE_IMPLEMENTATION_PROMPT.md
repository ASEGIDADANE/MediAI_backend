# Admin module v2 — production implementation prompt (MediAI_backend)

**Role:** Senior/staff backend engineer (NestJS, Prisma, PostgreSQL, JWT). Implement **operational admin APIs** that align with existing auth (`appRole=admin`) and data already in the database.

**Non-negotiables:** Work **only in `MediAI_backend`**. Reuse `AuthGuard('jwt')` + `RolesGuard` + `@Roles(UserAppRole.admin)` for every new admin route. **Do not** log full emails, message bodies, or `medicalHistory` at `info`. Pass `npm test` and `npm run build`. Update `README.md` and OpenAPI.

---

## A. Current implementation (baseline)

| Item | Today |
|------|--------|
| **Route** | `GET /api/admin/config` only. |
| **Auth** | JWT + `appRole === admin` (`AdminConfigController`: `AuthGuard` + `RolesGuard` + `@Roles(admin)`). |
| **Data** | **100% static** from `src/config/admin.snapshot.ts` via `getAdminConfigSnapshot()`: `statCards`, `users`, `subscriptionPlans`, `transactions`, `recentActivity`, `monthlyGrowth`, `revenueSummary` — mirrors MediAI `src/lib/admin-content.ts` for **UI dev**, not real DB. |
| **Prisma** | `User` has `appRole` (`user` \| `admin`). `SupportReport` exists. `AccountAuditLog` exists. No `Subscription` or `Transaction` tables — **do not invent** them in v1 unless you add migrations and product sign-off. |
| **Gap** | Admins cannot list **real** users or **support reports** or **aggregate counts** from PostgreSQL. |

**Goal of v2:** Add **read-only, DB-backed** admin endpoints (pagination, safe fields) while **keeping** `GET /admin/config` for static chart/dashboard **shell** data **or** clearly documenting which fields become “live” vs “placeholder”.

---

## B. Objectives (what to ship)

1. **List users** — paginated, sortable (at least by `createdAt` desc), **safe fields only:** `id`, `email`, `appRole`, `createdAt`, `updatedAt`, and **derived booleans** such as `hasProfile` (exists `UserProfile` row), `profileRole` (optional, from `UserProfile.role` if present). **Never** return `passwordHash`, `googleId`, or raw `medicalHistory` / `professionalProfile` JSON in list views.
2. **List support reports** — paginated, fields: `id`, `userId` (nullable), `message` (or truncated with `messagePreview` max 500 chars if you want to avoid huge payloads in list), `createdAt`. Optional filter: `userId` query param (UUID). **Index:** use existing `SupportReport(createdAt)`; add `userId` index in migration if missing and justified by queries.
3. **Summary / stats (minimal, real numbers)** — single endpoint, e.g. `GET /api/admin/summary` or nested under `GET /api/admin/metrics`, returning **only** what you can compute without new tables, e.g.:
   - `userCount` (total `User`)
   - `profileCount` (count `UserProfile`) or `onboardedUserCount`
   - `supportReportCount` (total `SupportReport`)
   - `adminCount` (where `appRole = admin`)
   - Optional: `last24hRegistrations` (users with `createdAt` in last 24h) — if cheap and indexed.
4. **OpenAPI** — document all DTOs, query params, 401/403, pagination response shape.
5. **Throttling** — stricter than default global (e.g. 60/min per admin user for list routes, or 30/min) via `@Throttle` on the admin controller or per-route.
6. **Tests** — unit tests for mappers; e2e opt-in `RUN_ADMIN_E2E=1` + `DATABASE_URL`: create admin user (SQL or seed step in test), call `GET /api/admin/users` → 200 and shape; non-admin → 403.

---

## C. API design (suggested paths)

All under global prefix `api`, all require **admin** JWT.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | Query: `page`, `pageSize` (max 100), optional `q` (email **prefix** or `contains` with documented SQL `ILIKE` + length cap to prevent abuse). |
| `GET` | `/api/admin/support-reports` | Query: `page`, `pageSize`, optional `userId` (filter). |
| `GET` | `/api/admin/summary` | Real aggregate counts (see B.3). |

**Do not** remove `GET /api/admin/config` without a migration note for the frontend; either:
- **Option A (recommended v1):** keep `getAdminConfigSnapshot()` for **static** `statCards` / `subscriptionPlans` / `transactions` / `monthlyGrowth` / `recentActivity` until billing exists, and add **separate** `GET /api/admin/summary` for real counts; the frontend can merge client-side in a later pass, or  
- **Option B:** extend `getAdminConfigSnapshot()` response to include a `live: { ... }` object from DB — more coupling, single response.

State the chosen option in `README.md`.

---

## D. Security and privacy

1. **403** for non-admin (`RolesGuard` already enforces; verify **JWT payload** includes `appRole` from DB on each request — `jwt.strategy` loads user; confirm refresh after role change is documented: admin promotion requires **re-login** or new token).
2. **List endpoints:** no PII beyond what’s necessary; **search `q`**: max length 120, trim, rate-limit; avoid full-table scan: use `email` `ILIKE` with `LIMIT` on inner subquery or add trigram index **only** if product needs it (optional phase 2).
3. **Logging:** one line per request at `info` with `route`, `adminUserId`, `httpStatus`, `ms` — **not** end-user email content in search logs.
4. **CORS / CSRF:** same as rest of API (Bearer token); no cookies required for v1.

---

## E. Implementation details (NestJS)

1. **New files (suggested layout):**  
   - `src/admin/admin.controller.ts` (or extend `admin-config` module with a second controller `AdminDataController` under `admin` path — avoid route conflicts: use `@Controller('admin')` with distinct route names: `users`, `support-reports`, `summary`).  
   - `src/admin/admin.service.ts` — Prisma queries, mapping to DTOs.  
   - `src/admin/dto/*` — `AdminUserListItemDto`, `AdminPaginatedUsersDto`, `AdminSupportReportItemDto`, `AdminSummaryDto`, query DTOs with `class-validator` + `class-transformer` (`@Type(() => Number)` for page).  
2. **Module:** import `PrismaModule` (global) and `AuthModule` in `AdminConfigModule` **or** new `AdminModule` that re-exports nothing and imports `AuthModule` only for guards. Prefer **one** `AdminModule` that contains both static `config` controller/service and new data controller to keep `app.module` clean.  
3. **Pagination:** return `{ items, page, pageSize, total }` (or `hasNext` pattern — pick one, document in Swagger).  
4. **Errors:** 400 for invalid query; 403 for forbidden (non-admin).

---

## F. Out of scope (unless product explicitly approves a second PR)

- Block/ban user, change `appRole` via API, impersonation, or password reset as admin.  
- Real **subscriptions** / **Stripe** / **revenue** in DB.  
- Doctor verification workflow, licenses, or new tables.  
- Export all users CSV (can be phase 2).  
- Webhooks or admin audit log **viewer** (AccountAuditLog is per-user; admin-wide audit stream is separate).

---

## G. Documentation

1. `README.md` — table row for new routes; how to set `appRole=admin` (SQL); note that `GET /admin/config` static payload vs live summary.  
2. Swagger — tag `admin` (reuse existing), describe 403.  
3. This doc — optional checkbox list in follow-up PRs.

---

## H. Definition of done

- [x] `GET /api/admin/users` and `GET /api/admin/support-reports` return **real** DB data with **pagination** and **safe** fields.  
- [x] `GET /api/admin/summary` returns **at least** `userCount`, `supportReportCount`, and `adminCount` (or equivalent) from Prisma `count` queries.  
- [x] All routes protected by **admin** role; OpenAPI + README updated; **no PHI** in logs.  
- [x] `npm test` + `npm run build` pass; e2e optional with `RUN_ADMIN_E2E=1`.  

---

## I. One-sentence success criterion

**MediAI_backend** exposes **trustworthy, read-only admin list and summary APIs** that match the **data you already store**, without pretending billing/revenue is real until those domains exist, while **preserving** the static `admin/config` contract for the MediAI UI until the frontend **merges** live + static or switches layouts.

---

*End of prompt.*
