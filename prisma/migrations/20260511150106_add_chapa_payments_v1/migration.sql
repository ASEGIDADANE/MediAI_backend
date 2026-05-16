-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('chapa');

-- CreateEnum
CREATE TYPE "AssistantAccessStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "ConsultationType" AS ENUM ('video', 'written');

-- CreateEnum
CREATE TYPE "ConsultationBookingStatus" AS ENUM ('pending_payment', 'paid', 'confirmed', 'cancelled', 'failed');

-- CreateTable
CREATE TABLE "assistant_access_plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" VARCHAR(500),
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ETB',
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_access_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assistant_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "AssistantAccessStatus" NOT NULL DEFAULT 'pending',
    "tx_ref" TEXT NOT NULL,
    "chapa_checkout_url" TEXT,
    "chapa_reference" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ETB',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_assistant_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_booking" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "top_doctor_id" TEXT NOT NULL,
    "consultation_type" "ConsultationType" NOT NULL DEFAULT 'video',
    "status" "ConsultationBookingStatus" NOT NULL DEFAULT 'pending_payment',
    "consultation_fee_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ETB',
    "patient_notes" VARCHAR(2000),
    "chapa_tx_ref" TEXT,
    "chapa_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_event" (
    "id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'chapa',
    "event_type" TEXT NOT NULL,
    "tx_ref" TEXT NOT NULL,
    "chapa_reference" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_access_plan_name_key" ON "assistant_access_plan"("name");

-- CreateIndex
CREATE INDEX "assistant_access_plan_active_sort_order_idx" ON "assistant_access_plan"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_assistant_access_tx_ref_key" ON "user_assistant_access"("tx_ref");

-- CreateIndex
CREATE INDEX "user_assistant_access_user_id_status_ends_at_idx" ON "user_assistant_access"("user_id", "status", "ends_at");

-- CreateIndex
CREATE INDEX "user_assistant_access_plan_id_created_at_idx" ON "user_assistant_access"("plan_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_booking_chapa_tx_ref_key" ON "consultation_booking"("chapa_tx_ref");

-- CreateIndex
CREATE INDEX "consultation_booking_patient_user_id_created_at_idx" ON "consultation_booking"("patient_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consultation_booking_top_doctor_id_created_at_idx" ON "consultation_booking"("top_doctor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consultation_booking_status_created_at_idx" ON "consultation_booking"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_event_dedupe_key_key" ON "payment_event"("dedupe_key");

-- CreateIndex
CREATE INDEX "payment_event_tx_ref_created_at_idx" ON "payment_event"("tx_ref", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_event_gateway_event_type_idx" ON "payment_event"("gateway", "event_type");

-- AddForeignKey
ALTER TABLE "user_assistant_access" ADD CONSTRAINT "user_assistant_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assistant_access" ADD CONSTRAINT "user_assistant_access_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "assistant_access_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_booking" ADD CONSTRAINT "consultation_booking_top_doctor_id_fkey" FOREIGN KEY ("top_doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
