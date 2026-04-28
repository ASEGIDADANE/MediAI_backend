import { ConfigService } from '@nestjs/config';
import { DUMMY_EMBEDDING_DIM } from './embedding-dummy.util';

export const GEMINI_BASE_DEFAULT = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * `LLM_API_KEY` (or `OPENAI_API_KEY`). For Google AI Studio / Gemini, keys usually start with `AIza`.
 */
export function getLlmApiKey(config: ConfigService): string {
  return (config.get('LLM_API_KEY') || config.get('OPENAI_API_KEY') || '')
    .toString()
    .trim();
}

export function getLlmApiKeyFromEnv(env: NodeJS.ProcessEnv): string {
  return (env.LLM_API_KEY || env.OPENAI_API_KEY || '').toString().trim();
}

/**
 * When true, chat + RAG embeddings use the Google Generative Language API (`generativelanguage.googleapis.com`) with the same key.
 * Set `LLM_PROVIDER=openai` to force OpenAI for `sk-…` keys; use `LLM_PROVIDER=gemini` to force Gemini.
 */
export function useGoogleGeminiLlm(config: ConfigService): boolean {
  const p = (config.get('LLM_PROVIDER') || '').toString().trim().toLowerCase();
  if (p === 'openai') {
    return false;
  }
  if (p === 'gemini' || p === 'google') {
    return true;
  }
  return getLlmApiKey(config).startsWith('AIza');
}

export function useGoogleGeminiLlmFromEnv(env: NodeJS.ProcessEnv): boolean {
  const p = (env.LLM_PROVIDER || '').toString().trim().toLowerCase();
  if (p === 'openai') {
    return false;
  }
  if (p === 'gemini' || p === 'google') {
    return true;
  }
  return getLlmApiKeyFromEnv(env).startsWith('AIza');
}

export function geminiGenerativeBase(config: ConfigService): string {
  return (
    config.get('GEMINI_API_BASE', GEMINI_BASE_DEFAULT) || GEMINI_BASE_DEFAULT
  )
    .toString()
    .replace(/\/$/, '');
}

export function geminiGenerativeBaseFromEnv(env: NodeJS.ProcessEnv): string {
  return (env.GEMINI_API_BASE || GEMINI_BASE_DEFAULT)
    .toString()
    .replace(/\/$/, '');
}

/** Model id for `.../models/{id}:generateContent` (e.g. gemini-1.5-flash). */
export function geminiChatModelId(config: ConfigService): string {
  const explicit = (config.get('GEMINI_MODEL') || '').toString().trim();
  if (explicit) {
    return explicit;
  }
  const fallback = (config.get('CHAT_LLM_MODEL') || '').toString().trim();
  if (fallback && !fallback.toLowerCase().includes('gpt')) {
    return fallback;
  }
  return 'gemini-1.5-flash';
}

/** Model id for `.../models/{id}:embedContent` (e.g. gemini-embedding-001). */
export function geminiEmbeddingModelId(config: ConfigService): string {
  const m = (config.get('GEMINI_EMBEDDING_MODEL') || '')
    .toString()
    .trim();
  return m || 'gemini-embedding-001';
}

function embeddingTimeoutMs(config: ConfigService): number {
  return Number(
    config.get('EMBEDDING_REQUEST_TIMEOUT_MS', '30000') || 30_000,
  );
}

function embeddingTimeoutMsFromEnv(env: NodeJS.ProcessEnv): number {
  return Number(env.EMBEDDING_REQUEST_TIMEOUT_MS || 30_000) || 30_000;
}

/**
 * Google `embedContent` — uses `outputDimensionality` 1536 to match `vector(1536)` / dummy embeddings.
 * @see https://ai.google.dev/api/embeddings
 */
export async function geminiEmbedContent(
  config: ConfigService,
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const key = getLlmApiKey(config);
  const base = geminiGenerativeBase(config);
  const model = geminiEmbeddingModelId(config);
  return geminiEmbedTextRaw({
    base,
    apiKey: key,
    model,
    text,
    taskType,
    outputDimensionality: DUMMY_EMBEDDING_DIM,
    timeoutMs: embeddingTimeoutMs(config),
  });
}

export async function geminiEmbedContentFromEnv(
  env: NodeJS.ProcessEnv,
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const key = getLlmApiKeyFromEnv(env);
  const base = geminiGenerativeBaseFromEnv(env);
  const model =
    (env.GEMINI_EMBEDDING_MODEL || '').toString().trim() ||
    'gemini-embedding-001';
  return geminiEmbedTextRaw({
    base,
    apiKey: key,
    model,
    text,
    taskType,
    outputDimensionality: DUMMY_EMBEDDING_DIM,
    timeoutMs: embeddingTimeoutMsFromEnv(env),
  });
}

type GeminiEmbedTextRawParams = {
  base: string;
  apiKey: string;
  model: string;
  text: string;
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';
  outputDimensionality: number;
  timeoutMs: number;
};

export async function geminiEmbedTextRaw(
  p: GeminiEmbedTextRawParams,
): Promise<number[]> {
  const u = new URL(
    `${p.base}/models/${encodeURIComponent(p.model)}:embedContent`,
  );
  u.searchParams.set('key', p.apiKey);
  const res = await fetch(u.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(p.timeoutMs),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${p.model}`,
      content: { parts: [{ text: p.text }] },
      outputDimensionality: p.outputDimensionality,
      taskType: p.taskType,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini embed HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    embedding?: { values?: number[] };
  };
  const v = json.embedding?.values;
  if (!v || v.length < 2) {
    throw new Error('Invalid Gemini embedding response');
  }
  if (v.length !== p.outputDimensionality) {
    throw new Error(
      `Gemini embedding dim ${v.length} !== expected ${p.outputDimensionality}`,
    );
  }
  return v;
}
