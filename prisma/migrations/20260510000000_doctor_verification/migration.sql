-- CreateEnum
CREATE TYPE "ProfessionalVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- AlterTable
ALTER TABLE "UserProfile"
  ADD COLUMN "verification_status" "ProfessionalVerificationStatus",
  ADD COLUMN "verification_submitted_at" TIMESTAMP(3),
  ADD COLUMN "verification_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "verification_reviewed_by" TEXT,
  ADD COLUMN "verification_notes" VARCHAR(2000);

-- Backfill: any existing professional profiles are auto-verified so we don't
-- lock out doctors who registered before this feature shipped. Newly created
-- professional profiles will default to `pending` from the application layer.
UPDATE "UserProfile"
   SET "verification_status" = 'verified'::"ProfessionalVerificationStatus"
 WHERE "role" = 'professional'
   AND "verification_status" IS NULL;

-- CreateIndex
CREATE INDEX "UserProfile_verification_status_idx" ON "UserProfile"("verification_status");
