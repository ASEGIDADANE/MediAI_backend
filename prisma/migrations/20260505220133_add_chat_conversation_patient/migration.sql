-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "patientUserId" TEXT;

-- CreateIndex
CREATE INDEX "ChatConversation_userId_patientUserId_kind_idx" ON "ChatConversation"("userId", "patientUserId", "kind");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
