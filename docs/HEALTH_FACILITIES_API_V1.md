# Health facilities API — v1 integration contract

This document describes the **public read-only** HTTP API for the MediAI dashboard **Healthcare Facility Locator**. It is aligned with the MediAI type `HealthcareFacilityDto` in `MediAI/src/lib/health-facilities-api.ts` (same JSON field names and semantics; optional fields may be omitted in JSON).

**Related:** Implementation prompt and frontend reference — `docs/HEALTH_FACILITIES_V1_PROMPT.md` (Section A).

---

## Base URL

All routes use the global Nest prefix:

- **`{API_ORIGIN}/api/...`**

Example local: `http://localhost:4000/api/health-facilities`

**CORS:** The API allows the origin from `FRONTEND_URL` (see `main.ts` / `ConfigModule`).

**Auth:** None for these routes (public read).

**Throttling:** The `health-facilities` controller uses the same pattern as `top-doctors` (e.g. 60 requests per 60 seconds per default throttler config). Excess traffic may return **429 Too Many Requests** (Nest throttler).

---

## List published facilities

**`GET /health-facilities`**

### Query parameters

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | integer | `1` | Min 1 |
| `pageSize` | integer | `20` | Min 1, max 50 |
| `type` | enum | — | Optional: `hospital`, `pharmacy`, or `clinic` |
| `q` | string | — | Optional: case-insensitive search in `name` and `address` (max 120 characters). Empty or whitespace-only is treated as no search. |
| `lat` | number | — | Optional: user latitude (decimal degrees). When both `lat` and `lng` are set, results are sorted by distance and each item may include `distanceKm`. |
| `lng` | number | — | Optional: user longitude (paired with `lat`). |
| `radiusKm` | number | `10` | Optional search radius in km when `lat`/`lng` are set (min **0.5**, max **100**). |

### Response `200`

```json
{
  "items": [
    {
      "id": "fac-001",
      "name": "Tikur Anbessa Specialized Hospital",
      "type": "hospital",
      "address": "Churchill Ave, Addis Ababa",
      "phone": "+251 11 551 1211",
      "rating": 4.2,
      "verified": true,
      "latitude": 9.0192,
      "longitude": 38.7525,
      "openNow": true
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

- Only rows with **`published: true`** are returned when **no** `lat`/`lng` are sent (directory list from the database, ordered by **`name`** ascending).
- When **`lat` and `lng`** are both sent, the implementation uses geo-aware sourcing (e.g. live nearby POIs), sorted by distance, with optional `distanceKm` per item.
- Each object in `items` matches the **single-facility** JSON shape below.

### Client integration note

The MediAI app calls **`GET /health-facilities`** and uses **`response.items`** as `HealthcareFacilityDto[]` (see `MediAI/src/lib/health-facilities-api.ts`). Optional detail: **`GET /health-facilities/:id`** from `app/dashboard/facility-locator/[facilityId]/page.tsx`.

---

## Get one facility

**`GET /health-facilities/:id`**

### Path parameter `id`

- **Stable string id** (e.g. `fac-001`), not a UUID.
- **Validation (400):** non-empty, max length **64**, must match `fac-` followed by only ASCII letters, digits, or hyphens (e.g. `fac-001`, `fac-010`).
- **404:** id is well-formed but no **published** row exists with that id.

### Response `200`

Same object shape as one `items` entry:

```json
{
  "id": "fac-001",
  "name": "Tikur Anbessa Specialized Hospital",
  "type": "hospital",
  "address": "Churchill Ave, Addis Ababa",
  "phone": "+251 11 551 1211",
  "rating": 4.2,
  "verified": true,
  "latitude": 9.0192,
  "longitude": 38.7525,
  "openNow": true
}
```

| Field | JSON type | Notes |
| --- | --- | --- |
| `id` | string | Stable id |
| `name` | string | |
| `type` | string | `hospital` \| `pharmacy` \| `clinic` |
| `address` | string | |
| `phone` | string | Optional in JSON |
| `rating` | number | Optional; floating-point when present |
| `verified` | boolean | |
| `latitude` | number | WGS84 |
| `longitude` | number | WGS84 |
| `openNow` | boolean | Optional; camelCase in JSON when present |
| `distanceKm` | number | Optional; present on geo-aware list responses when `lat`/`lng` are sent |

---

## Errors

| Status | When |
| --- | --- |
| **400** | Invalid query (class-validator) or **invalid `id`** path (format / length) for detail |
| **404** | Valid `id` but no published facility |
| **429** | Throttle limit exceeded |

Error bodies follow Nest’s default **JSON** exception format (`message`, `statusCode`, etc.).

**Idempotency:** GET requests are idempotent; safe to retry.

---

## Operations (database)

1. **Migrate:** `npx prisma migrate deploy` (or `migrate dev` in development) so the `healthcare_facility` table exists.
2. **Seed:** `npx prisma db seed`  
   - Healthcare facilities are inserted from `prisma/data/health-facilities-seed.json` **only if the table is empty** (idempotent for that table’s initial load).
3. Re-running seed when the table already has rows will **not** re-insert facilities (see `prisma/seed.ts`).

---

## Out of scope for v1

- Admin create/update/delete for facilities (no public write API).
- Authentication for read.

---

## OpenAPI (Swagger)

Interactive docs: **`GET {API_ORIGIN}/docs`** — tag **health-facilities**.

## Automated tests

- **Unit / pipe:** `npm run test` includes `src/health-facilities/*.spec.ts`.
- **E2E:** `test/health-facilities.e2e-spec.ts` — the **invalid `id` → 400** case runs with the default e2e suite. List and detail e2e require a working `DATABASE_URL`, applied migrations (including `healthcare_facility`), and `RUN_HEALTH_FACILITIES_E2E=1` (see `README.md` “Run tests”).
