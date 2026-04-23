import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hashDummyEmbedding } from './embedding-dummy.util';

export type Citation = { source: string; excerpt: string };

const inMemEmbeddingCache = new Map<string, { v: number[]; at: number }>();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE = 200;

@Injectable()
export class RagService {
  private readonly log = new Logger(RagService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('RAG_ENABLED', 'false') === 'true';
  }

  async embedQuery(text: string): Promise<number[]> {
    const key = this.cacheKey(text);
    const now = Date.now();
    const hit = inMemEmbeddingCache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      return hit.v;
    }
    if (this.isDummyApiKey()) {
      return hashDummyEmbedding(text);
    }
    const model =
      this.config.get('EMBEDDING_MODEL', 'text-embedding-3-small') ||
      'text-embedding-3-small';
    const apiKey = this.apiKey();
    const base = (
      this.config.get('LLM_BASE_URL', 'https://api.openai.com/v1') || 'https://api.openai.com/v1'
    ).replace(/\/$/, '');

    const timeoutMs = Number(
      this.config.get('EMBEDDING_REQUEST_TIMEOUT_MS', '30000') || 30_000,
    );
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      this.log.error(`Embeddings HTTP ${res.status}: ${t.slice(0, 200)}`);
      throw new Error(`Embeddings request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const v = json.data?.[0]?.embedding;
    if (!v || v.length < 2) {
      throw new Error('Invalid embedding response');
    }
    this.pushCache(key, v);
    return v;
  }

  async retrieve(
    query: string,
    mode: 'personal' | 'general',
  ): Promise<Citation[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const topK = Number(this.config.get('RAG_TOP_K', '5') || 5);
    const maxExcerpt = Number(
      this.config.get('RAG_MAX_CHUNK_CHARS', '2000') || 2000,
    );
    const minScore = Number(this.config.get('RAG_MIN_SCORE', '0') || 0);

    let emb: number[];
    try {
      emb = await this.embedQuery(query);
    } catch (e) {
      this.log.warn(`RAG embed failed, returning []. ${String(e)}`);
      return [];
    }

    const vectorLiteral = `[${emb.map((n) => n.toFixed(8)).join(',')}]`;
    const audienceFilter =
      mode === 'personal'
        ? `d.audience IN ('all', 'personal_guidance')`
        : `d.audience IN ('all', 'general_only')`;

    try {
      const q = `
        SELECT dc.id, dc."content" as content, d.title as source,
          (dc.embedding <=> $1::vector)::float8 as dist
        FROM "DocumentChunk" dc
        INNER JOIN "Document" d ON d.id = dc."documentId"
        WHERE d."isActive" = true
          AND (${audienceFilter})
        ORDER BY dc.embedding <=> $1::vector
        LIMIT $2
      `;
      const rows = await this.prisma.$queryRawUnsafe<
        { id: string; content: string; source: string; dist: number }[]
      >(q, vectorLiteral, topK);
      return rows
        .filter((r) => (minScore > 0 ? 1 - r.dist >= minScore : true))
        .map((r) => ({
          source: r.source,
          excerpt: r.content.slice(0, maxExcerpt),
        }));
    } catch (e) {
      const msg = String(e);
      this.log.warn(
        `RAG query failed (pgvector / tables missing?). ${msg.slice(0, 200)}`,
      );
      return [];
    }
  }

  private isDummyApiKey(): boolean {
    const k = (this.config.get('LLM_API_KEY') || this.config.get('OPENAI_API_KEY') || '')
      .toString()
      .trim();
    if (!k) {
      return true;
    }
    if (['dummy', 'dev', 'test', 'off', 'false'].includes(k.toLowerCase())) {
      return true;
    }
    return k.toLowerCase().startsWith('sk-dummy');
  }

  private apiKey(): string {
    return (
      (this.config.get('EMBEDDING_API_KEY') ||
        this.config.get('LLM_API_KEY') ||
        this.config.get('OPENAI_API_KEY') ||
        '') as string
    ).toString();
  }

  private cacheKey(text: string): string {
    return text.slice(0, 2_000);
  }

  private pushCache(key: string, v: number[]) {
    if (inMemEmbeddingCache.size > MAX_CACHE) {
      inMemEmbeddingCache.clear();
    }
    inMemEmbeddingCache.set(key, { v, at: Date.now() });
  }
}
