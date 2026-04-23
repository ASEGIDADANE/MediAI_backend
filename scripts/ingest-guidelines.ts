/**
 * Ingests Markdown guidelines into `Document` / `DocumentChunk` with pgvector embeddings.
 * Usage: `npx ts-node scripts/ingest-guidelines.ts [path/to/folder]`
 * Requires: `DATABASE_URL`, migration with pgvector, `LLM_API_KEY` (or dummy hash embeddings).
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DocumentAudience, PrismaClient } from '../src/generated/prisma/client';
import { hashDummyEmbedding } from '../src/chat/embedding-dummy.util';

const CHUNK = 1_200;
const OVERLAP = 150;

function isDummyKey(): boolean {
  const k = (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!k) {
    return true;
  }
  if (['dummy', 'dev', 'test', 'off', 'false'].includes(k.toLowerCase())) {
    return true;
  }
  return k.toLowerCase().startsWith('sk-dummy');
}

async function embed(text: string): Promise<number[]> {
  if (isDummyKey()) {
    return hashDummyEmbedding(text);
  }
  const key = (process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY)!.trim();
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    throw new Error(`embed ${res.status}: ${await res.text()}`);
  }
  const j = (await res.json()) as { data?: { embedding?: number[] }[] };
  const v = j.data?.[0]?.embedding;
  if (!v) {
    throw new Error('bad embed response');
  }
  return v;
}

function chunkText(s: string): string[] {
  const t = s.trim();
  if (!t) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < t.length; i += CHUNK - OVERLAP) {
    out.push(t.slice(i, i + CHUNK));
  }
  return out;
}

function audienceForFile(name: string): DocumentAudience {
  if (name.includes('personal') || name.includes('03-')) {
    return DocumentAudience.personal_guidance;
  }
  if (name.includes('01-') || name.includes('general-safety')) {
    return DocumentAudience.all;
  }
  return DocumentAudience.all;
}

async function main() {
  const root = process.argv[2] || path.join(__dirname, '../docs/guidelines');
  const prisma = new PrismaClient();
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) {
        walk(p);
      } else if (n.endsWith('.md') || n.endsWith('.txt')) {
        files.push(p);
      }
    }
  };
  if (!fs.existsSync(root)) {
    console.error(`Path not found: ${root}`);
    process.exit(1);
  }
  walk(root);
  if (files.length === 0) {
    console.error('No .md / .txt files found.');
    process.exit(1);
  }
  for (const filePath of files) {
    const rel = path.relative(root, filePath) || filePath;
    const title = path.basename(filePath);
    const body = fs.readFileSync(filePath, 'utf-8');
    const audience = audienceForFile(title);
    const source = `ingest:${rel}`.replace(/\\/g, '/');
    const hash = createHash('sha256').update(source + body).digest('hex').slice(0, 12);

    const existing = await prisma.document.findFirst({ where: { source } });
    if (existing) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "DocumentChunk" WHERE "documentId" = $1`,
        existing.id,
      );
      await prisma.document.delete({ where: { id: existing.id } });
    }
    const doc = await prisma.document.create({
      data: {
        title: `${title}#${hash}`,
        source,
        audience,
        isActive: true,
      },
    });
    const parts = chunkText(body);
    let pos = 0;
    for (const part of parts) {
      const v = await embed(part);
      const vectorLiteral = `[${v.map((n) => n.toFixed(8)).join(',')}]`;
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DocumentChunk" (id, "documentId", content, position, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        id,
        doc.id,
        part,
        pos,
        vectorLiteral,
      );
      pos += 1;
    }
    console.log(`Ingested ${parts.length} chunk(s) for ${source} (${audience})`);
  }
  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
