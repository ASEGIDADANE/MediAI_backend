-- CreateTable
CREATE TABLE "education_resource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bullets" JSONB NOT NULL,
    "icon_key" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_resource_slug_key" ON "education_resource"("slug");

-- CreateIndex
CREATE INDEX "education_resource_published_sort_order_idx" ON "education_resource"("published", "sort_order");
