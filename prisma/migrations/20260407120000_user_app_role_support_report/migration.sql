-- CreateEnum
CREATE TYPE "UserAppRole" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "appRole" "UserAppRole" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "SupportReport" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportReport_createdAt_idx" ON "SupportReport"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportReport" ADD CONSTRAINT "SupportReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
