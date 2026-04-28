CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "DocumentAudience" AS ENUM ('all', 'personal_guidance', 'general_only');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "audience" "DocumentAudience" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_audience_isActive_idx" ON "Document"("audience", "isActive");

CREATE INDEX "DocumentChunk_documentId_position_idx" ON "DocumentChunk"("documentId", "position");

-- Cosine / inner product search (OpenAI embeddings are length-normalized; L2 and cosine behave similarly; use HNSW for ANN)
CREATE INDEX "DocumentChunk_embedding_hnsw" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
