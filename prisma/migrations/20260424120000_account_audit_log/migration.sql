-- CreateEnum
CREATE TYPE "AccountAuditAction" AS ENUM ('profile_patch', 'medical_history_put', 'ai_doctor_setup_patch', 'data_export', 'account_delete_initiated');

-- CreateTable
CREATE TABLE "AccountAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AccountAuditAction" NOT NULL,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountAuditLog_userId_createdAt_idx" ON "AccountAuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountAuditLog" ADD CONSTRAINT "AccountAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
