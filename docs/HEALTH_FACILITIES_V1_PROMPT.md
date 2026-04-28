# Health facilities public API — v1 production readiness (backend only)

**Purpose:** This document is an **implementation prompt** for senior backend work in `MediAI_backend`, plus an **integration contract** so a future frontend (or mobile) can wire to the API with a **letter-for-letter match** to the existing MediAI static types.

**Constraints:** **Do not modify the MediAI Next.js app** in this task. **Do** use the frontend below as the **authoritative reference** for JSON field names, types, and enum values the API must expose.

---

## A. Frontend as canonical contract (read-only reference)

When validating or hardening the API, treat these MediAI files as the **source of truth for the public JSON shape** (not the other way around):

| Reference | Path (repo root) | What to align |
|-----------|-------------------|---------------|
| **Type definition** | `MediAI/src/lib/dashboard-content.ts` | `FacilityType`, `HealthcareFacility` — every key and type the UI expects per facility row. |
| **UI usage** | `MediAI/src/components/dashboard/facility-locator.tsx` | Map embed uses `name`, `address`, `latitude`, `longitude`, etc.; list/search/filter use the same object. |
| **Route** | `MediAI/src/app/dashboard/facility-locator/page.tsx` | Confirms the feature is the “Healthcare Facility Locator” dashboard page. |

**Expected `HealthcareFacility` shape (MediAI — must match API list/detail item JSON):**

| JSON field | Type / notes |
|------------|----------------|
| `id` | `string` (stable, e.g. `fac-001` — not a generated UUID in current product data) |
| `name` | `string` |
| `type` | `"hospital" \| "pharmacy" \| "clinic"` (same strings as Prisma `HealthcareFacilityType`) |
| `address` | `string` |
| `phone` | `string` |
| `rating` | `number` (JS float; Prisma `Float`) |
| `verified` | `boolean` |
| `latitude` | `number` |
| `longitude` | `number` |
| `openNow` | `boolean` (camelCase in JSON — matches Prisma `@map` to DB `open_now`) |

**List endpoint wrapper:** The app today loads a **flat array** from static data. The API returns **`{ items, page, pageSize, total }`**. When integrating, the client will use `response.items` as `HealthcareFacility[]` — each element must still match the table above **field-for-field** (no extra required fields; avoid renaming keys).

**Naming note:** MediAI uses the type name `FacilityType` for the union; the backend enum is `HealthcareFacilityType` — **JSON values** must still be exactly `hospital`, `pharmacy`, `clinic`.

**Seed alignment:** `MediAI_backend/prisma/data/health-facilities-seed.json` is intended to mirror the static `healthcareFacilities` array in `dashboard-content.ts`. If you change API semantics, keep seed and README examples consistent with this section.

---

## B. Current backend implementation (summary)

- **Stack:** NestJS, Prisma, global prefix `/api`, `ValidationPipe`, throttling, Swagger in `main.ts` (tag `health-facilities`).
- **Data:** `HealthcareFacility` in `prisma/schema.prisma` — table `healthcare_facility`, enum `HealthcareFacilityType` (`hospital` | `pharmacy` | `clinic`), `open_now` mapped from `openNow`, `published` for soft visibility, string `id` (e.g. `fac-001`).
- **Migrations:** `prisma/migrations/.../healthcare_facility/`.
- **Seed:** `prisma/seed.ts` loads `prisma/data/health-facilities-seed.json` when the table is empty.
- **Module:** `HealthFacilitiesModule` in `app.module.ts`.
- **Public API:**
  - `GET /api/health-facilities` — `page`, `pageSize` (max 50), optional `type`, optional `q` (trim, max 120) on `name` and `address` (case-insensitive contains); response `{ items, page, pageSize, total }`, `name` asc, only `published: true`.
  - `GET /api/health-facilities/:id` — single row if `published: true`, else 404.
- **Throttling:** 60 requests / 60_000 ms on the controller (aligned with `top-doctors`).
- **DTOs / mapper:** `HealthFacilitiesQueryDto`, `HealthcareFacilityDto`, `HealthFacilitiesListResponseDto`, `toHealthcareFacilityDto()`.
- **Docs:** `README.md` has a short public-API table.

**Gaps (typical for v1 “production-ready”):** tests, integrator-focused doc, optional param hardening, operational runbook. No admin CRUD for facilities in v1 unless product asks.

---

## C. Role and task (senior backend)

**Role:** Senior backend engineer on the MediAI NestJS + Prisma codebase (`MediAI_backend`).

**Non-goals for this task:** **No** changes to the MediAI Next.js app. **No** new public write endpoints. **No** large refactors outside `health-facilities`, tests, and docs.

**0. Grounding (mandatory first step)**  
Read and understand:

- `prisma/schema.prisma` — `HealthcareFacility` / `HealthcareFacilityType`
- **Section A** of this file (MediAI `HealthcareFacility` vs API item JSON)
- `src/health-facilities/*` (controller, service, DTOs, mapper, module)
- `prisma/seed.ts` and `prisma/data/health-facilities-seed.json`
- `prisma/migrations/*healthcare_facility*`
- `README.md` public routes

Compare list/detail behavior to **`top-doctors`** (pagination, throttling, Swagger) for **consistency**, not feature parity.

**1. V1 “ready” definition**

- Public read-only API surface: `GET /api/health-facilities` and `GET /api/health-facilities/:id` only.
- **Each object in `items` and the detail body must remain JSON-compatible with MediAI `HealthcareFacility`** (Section A). Do not rename or remove fields without a versioned API plan.
- `published: false` rows are never returned on public routes.
- Throttling and CORS follow existing app patterns (`FRONTEND_URL` / `ConfigModule`).

**2. Hardening**

- **`:id`:** Non-empty string; max length (e.g. 64); allowed pattern (e.g. `fac-` + alphanumerics) to limit abuse. **400** with clear message when invalid; **404** when valid but missing/unpublished.
- **List:** Empty/whitespace `q` = no text filter. `page` / `pageSize` match DTO bounds and response echo.
- **Errors:** `NotFoundException` and class-validator output consistent with other modules.
- **Performance (light):** Document that clients should use `page` / `pageSize` and `q` / `type` for server-side filtering at scale; optional future index on `name`/`address` if search load grows.
- **Idempotency:** N/A for GET; state in integration doc.

**3. Tests**

- **Unit tests** for `HealthFacilitiesService` (mock `PrismaService` or repo’s test DB policy):
  - List: `published: true` only; `type` and `q`; pagination and `total`.
  - getById: 404 when missing or unpublished.
- **E2E** (if the repo has them): `GET /api/health-facilities` → 200 + `items`; `GET /api/health-facilities/fac-001` → 200 or 404 per seed.
- **No** frontend tests.

**4. Documentation (integrators + future MediAI wire-up)**

**Done:** `docs/HEALTH_FACILITIES_API_V1.md` (integration contract; linked from `README.md`). If extending, keep in sync with Section A. Alternatively, a **“Health facilities — integration contract”** subsection in `README.md` could duplicate the essentials. The checklist originally required:

- **Reference:** Link to **Section A** of this file (or duplicate the `HealthcareFacility` field table) so implementers know the API matches `dashboard-content.ts`.
- **Base URL:** `{API_ORIGIN}/api`.
- **Endpoints:** Full paths, query params, **example** JSON for list and detail (match Swagger DTOs; list item = same shape as static `HealthcareFacility`).
- **Errors:** 404, 400, 429 (throttler) — link to global Nest behavior if documented.
- **Operations:** `prisma migrate deploy` + `prisma db seed`; document seed idempotency (facilities only when table empty).
- **Out of scope v1:** Admin CRUD, auth on read, geospatial “nearest” search.

**5. Optional env**  
Only if strictly necessary; if added, update `.env.example` and `README.md`.

**6. Definition of done**

- `npm run build` and `npm test` (if present) pass.
- Swagger matches implemented behavior; list item JSON **letter-matches** Section A.
- A new integrator (or future MediAI PR) can replace the static `healthcareFacilities` import with `GET /api/health-facilities` and use **`items` as `HealthcareFacility[]`** with minimal or no field mapping.
- PR description states behavioral guarantees and any breaking change (ideally **none** for v1 hardening).

---

## D. Optional follow-up (not part of this backend task)

A separate task in **MediAI** can: fetch `GET /api/health-facilities`, use `data.items` as `HealthcareFacility[]`, keep existing filter/search (client- or server-side), and pass through to `facility-locator.tsx` without changing prop shapes.
