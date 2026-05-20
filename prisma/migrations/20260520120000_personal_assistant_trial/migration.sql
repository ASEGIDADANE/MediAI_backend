-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "personal_trial_messages_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserProfile" ADD COLUMN "personal_trial_exhausted_at" TIMESTAMP(3);
