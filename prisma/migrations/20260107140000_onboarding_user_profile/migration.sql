-- CreateEnum
CREATE TYPE "OnboardingUserRole" AS ENUM ('personal', 'professional');

-- CreateEnum
CREATE TYPE "OnboardingMeasurementSystem" AS ENUM ('imperial', 'metric');

-- CreateEnum
CREATE TYPE "OnboardingSexAtBirth" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "OnboardingPreferredFeature" AS ENUM ('ai_doctor', 'lab_interpretation', 'top_doctors');

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "role" "OnboardingUserRole" NOT NULL,
    "preferredName" TEXT NOT NULL,
    "confirmedAdult" BOOLEAN NOT NULL,
    "region" TEXT NOT NULL,
    "ageYears" INTEGER NOT NULL,
    "measurementSystem" "OnboardingMeasurementSystem" NOT NULL,
    "weight" TEXT NOT NULL,
    "heightFeet" TEXT,
    "heightInches" TEXT,
    "heightCm" TEXT,
    "sexAtBirth" "OnboardingSexAtBirth" NOT NULL,
    "preferredFeature" "OnboardingPreferredFeature" NOT NULL,
    "onboardingCompletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
