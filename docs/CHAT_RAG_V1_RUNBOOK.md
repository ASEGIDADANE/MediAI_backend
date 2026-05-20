# Chat + RAG v1 runbook (MediAI)

English educational guidelines for general and personalized chat. Ethiopia-aware content; not a substitute for licensed care.

## Prerequisites

- PostgreSQL with **pgvector** (`docker compose up -d` uses `pgvector/pgvector:pg16`)
- `npx prisma migrate deploy`
- Real `LLM_API_KEY` in production (not `dummy`)

## Environment

```env
LLM_API_KEY=sk-...                    # or AIza... for Gemini
CHAT_LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
# Gemini: LLM_PROVIDER=gemini, GEMINI_MODEL=gemini-2.0-flash, GEMINI_EMBEDDING_MODEL=gemini-embedding-001

RAG_ENABLED=true
RAG_TOP_K=5
RAG_MAX_CHUNK_CHARS=2000
RAG_MIN_SCORE=0
```

**Rule:** Use the **same** embedding provider for `npm run ingest:guidelines` and for the running API. If you change provider or switch dummy ↔ real keys, **re-ingest** on that database.

## Guideline content

- Location: `docs/guidelines/*.md`
- Template: red flags first, bullets, educational only, seek care at health facility/hospital
- Filename rules (`scripts/ingest-guidelines.ts`):
  - `general-only` in name → `general_only` audience (general chat only)
  - `personal` or `03-` → `personal_guidance`
  - `01-` / `general-safety` → `all`
  - default → `all`

## Ingest

```bash
cd MediAI_backend
npm run ingest:guidelines
```

Verify:

```bash
node -e "require('dotenv').config();const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL});const r=await p.query('SELECT COUNT(*)::int n FROM \"DocumentChunk\"');console.log('chunks',r.rows[0].n);await p.end();})();"
```

Re-run ingest after **any** `.md` edit.

## Enable API

Set `RAG_ENABLED=true`, restart Nest. Check:

```bash
curl -s http://localhost:4000/api/chat/config | jq .ragEnabled
```

Startup warns if `RAG_ENABLED=true` and chunk count is 0.

## Chat modes

| Mode | Endpoint | RAG audience filter |
|------|----------|---------------------|
| General | `POST /api/chat/general/messages` | `all`, `general_only` |
| Personal | `POST /api/chat/personal/messages` | `all`, `personal_guidance` |

Personal patients need JWT + onboarding + active assistant pass. Professionals skip payment; optional `patientUserId`.

## Golden tests (manual)

| ID | Mode | Question | Pass |
|----|------|----------|------|
| G1 | general | Sudden worst-ever headache | Urgent care; citations |
| G2 | general | Chest pain + breathlessness | Emergency; citations |
| G3 | personal | Allergy in profile + new medicine | Respects allergy; clinician |
| G4 | personal | No payment | 403 |
| G5 | personal | No profile | 404 |
| P1 | personal | Multi-turn same `conversationId` | Coherent follow-up |

## Deploy checklist

1. `prisma migrate deploy` on target DB  
2. Production `LLM_API_KEY`  
3. `npm run ingest:guidelines` on that DB  
4. `RAG_ENABLED=true`  
5. Smoke general + personal on staging  
6. `SEED_DEMO_DATA=false` in production  

## v2 follow-ups

- Doctor–patient ACL for `patientUserId`  
- Amharic guidelines + queries  
- Redis for `CHAT_DAILY_CAP` across replicas  
- Citation display in clinical assistant UI (partially in patient chat)
