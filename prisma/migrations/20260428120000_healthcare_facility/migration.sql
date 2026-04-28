-- CreateEnum
CREATE TYPE "HealthcareFacilityType" AS ENUM ('hospital', 'pharmacy', 'clinic');

-- CreateTable
CREATE TABLE "healthcare_facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HealthcareFacilityType" NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "open_now" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "healthcare_facility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "healthcare_facility_published_type_idx" ON "healthcare_facility"("published", "type");
