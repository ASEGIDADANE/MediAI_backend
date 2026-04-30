-- DropIndex
DROP INDEX "DocumentChunk_embedding_hnsw";

-- CreateTable
CREATE TABLE "doctor_patient_thread" (
    "id" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_patient_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_patient_message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_patient_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_patient_thread_doctorUserId_updated_at_idx" ON "doctor_patient_thread"("doctorUserId", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "doctor_patient_thread_patientUserId_updated_at_idx" ON "doctor_patient_thread"("patientUserId", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_patient_thread_doctorUserId_patientUserId_key" ON "doctor_patient_thread"("doctorUserId", "patientUserId");

-- CreateIndex
CREATE INDEX "doctor_patient_message_threadId_created_at_idx" ON "doctor_patient_message"("threadId", "created_at");

-- AddForeignKey
ALTER TABLE "doctor_patient_thread" ADD CONSTRAINT "doctor_patient_thread_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_thread" ADD CONSTRAINT "doctor_patient_thread_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_message" ADD CONSTRAINT "doctor_patient_message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "doctor_patient_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_message" ADD CONSTRAINT "doctor_patient_message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
