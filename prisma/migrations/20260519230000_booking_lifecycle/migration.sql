-- Phase 3 — Booking lifecycle
--
-- Adds the new statuses, the refund-status enum, scheduling + audit
-- columns on `consultation_booking`, and the two indexes the new approval
-- / slot-overlap queries need.
--
-- Note on enum-in-transaction: PostgreSQL 12+ allows
-- `ALTER TYPE … ADD VALUE` inside a transaction *iff* the new label isn't
-- read or written in the same transaction. This migration only declares
-- the labels and alters table shape — no row actually receives one of the
-- new statuses here — so the whole file runs as a single tx without issue.

ALTER TYPE "ConsultationBookingStatus" ADD VALUE IF NOT EXISTS 'pending_doctor_approval';
ALTER TYPE "ConsultationBookingStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "ConsultationBookingStatus" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "ConsultationBookingStatus" ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE "ConsultationBookingStatus" ADD VALUE IF NOT EXISTS 'missed';

CREATE TYPE "ConsultationRefundStatus" AS ENUM ('none', 'pending', 'refunded', 'failed');

ALTER TABLE "consultation_booking"
    ADD COLUMN "scheduled_for"           TIMESTAMP(3),
    ADD COLUMN "duration_minutes"        INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "approved_at"             TIMESTAMP(3),
    ADD COLUMN "rejected_at"             TIMESTAMP(3),
    ADD COLUMN "completed_at"            TIMESTAMP(3),
    ADD COLUMN "missed_at"               TIMESTAMP(3),
    ADD COLUMN "cancelled_at"            TIMESTAMP(3),
    ADD COLUMN "doctor_decision_reason"  VARCHAR(500),
    ADD COLUMN "cancelled_by_user_id"    TEXT,
    ADD COLUMN "cancel_reason"           VARCHAR(500),
    ADD COLUMN "refund_status"           "ConsultationRefundStatus" NOT NULL DEFAULT 'none';

CREATE INDEX "consultation_booking_top_doctor_id_scheduled_for_idx"
    ON "consultation_booking" ("top_doctor_id", "scheduled_for");

CREATE INDEX "consultation_booking_top_doctor_id_status_idx"
    ON "consultation_booking" ("top_doctor_id", "status");
