/** Must match `vector(1536)` in Prisma, OpenAI `text-embedding-3-small`, and Gemini `embedContent` `outputDimensionality`. */
export const DUMMY_EMBEDDING_DIM = 1536 as const;

/**
 * Deterministic pseudo-embedding for dev when no OpenAI key is set.
 * Used by `RagService` and `scripts/ingest-guidelines.ts` so dummy ingest + query stay aligned.
 * Do not mix with real `embeddings` API–stored vectors.
 */
export function hashDummyEmbedding(text: string): number[] {
  const v = new Array<number>(DUMMY_EMBEDDING_DIM).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % DUMMY_EMBEDDING_DIM] += (text.charCodeAt(i) % 97) / 1000;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
