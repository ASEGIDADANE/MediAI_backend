-- Phase 3: server-side `ProfessionalProfile`, `MedicalHistoryData`, and AI doctor setup flag (Option A: JSON on UserProfile).

ALTER TABLE "UserProfile" ADD COLUMN     "professionalProfile" JSONB,
ADD COLUMN     "medicalHistory" JSONB,
ADD COLUMN     "aiDoctorSetupCompleted" BOOLEAN NOT NULL DEFAULT false;
