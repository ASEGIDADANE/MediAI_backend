-- CreateTable
CREATE TABLE "blog_article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "read_time" TEXT NOT NULL,
    "image_src" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3) NOT NULL,
    "date_display" TEXT,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_home_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "featured_article_id" TEXT,
    "popular_article_ids" JSONB NOT NULL,
    "ai_healthcare_article_ids" JSONB NOT NULL,
    "second_opinion_article_ids" JSONB NOT NULL,
    "company_news_article_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_home_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_article_published_published_at_idx" ON "blog_article"("published", "published_at" DESC);

-- CreateIndex
CREATE INDEX "blog_article_published_category_idx" ON "blog_article"("published", "category");
