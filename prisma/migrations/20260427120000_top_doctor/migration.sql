-- CreateTable
CREATE TABLE "top_doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "sub_specialty" TEXT NOT NULL,
    "years_of_experience" INTEGER NOT NULL,
    "video_fee" INTEGER NOT NULL,
    "written_fee" INTEGER NOT NULL,
    "hero_image_url" TEXT NOT NULL,
    "education_degree" TEXT NOT NULL,
    "education_year" TEXT NOT NULL,
    "publications_summary" TEXT NOT NULL,
    "diseases" JSONB NOT NULL,
    "biography" JSONB NOT NULL,
    "experience" JSONB NOT NULL,
    "affiliations" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "top_doctor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "top_doctor_published_specialty_idx" ON "top_doctor"("published", "specialty");

-- CreateIndex
CREATE INDEX "top_doctor_published_sort_order_idx" ON "top_doctor"("published", "sort_order");
