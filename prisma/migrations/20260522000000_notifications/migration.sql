-- Phase 6 — Notifications + audit log extension
--
-- Two independent changes shipped together because they form the audit/UX
-- pair for the booking lifecycle:
--   1. New `Notification` table + `NotificationType` enum power the in-app
--      bell dropdown (and best-effort Resend emails on top).
--   2. `AccountAuditAction` gains the booking-lifecycle actions so every
--      doctor approval / rejection / cancellation / etc. is recorded.
--
-- Both pieces are append-only; no existing rows are touched.

-- --- AccountAuditAction extension --------------------------------------------
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'appointment_approved';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'appointment_rejected';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'appointment_cancelled';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'appointment_completed';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'availability_updated';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'meeting_link_set';
ALTER TYPE "AccountAuditAction" ADD VALUE IF NOT EXISTS 'consultation_booking_created';

-- --- NotificationType enum ---------------------------------------------------
CREATE TYPE "NotificationType" AS ENUM (
  'booking_submitted',
  'booking_paid',
  'booking_approved',
  'booking_rejected',
  'booking_cancelled',
  'booking_completed',
  'booking_reminder_24h',
  'booking_reminder_1h',
  'meeting_link_set',
  'message_received',
  'system'
);

-- --- Notification table ------------------------------------------------------
CREATE TABLE "notification" (
  "id"          TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "type"        "NotificationType" NOT NULL,
  "title"       VARCHAR(160) NOT NULL,
  "body"        VARCHAR(1000) NOT NULL,
  "action_url"  VARCHAR(500),
  "metadata"    JSONB,
  "read_at"     TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Hot path: bell dropdown — most recent first per user.
CREATE INDEX "notification_user_id_created_at_idx"
  ON "notification" ("user_id", "created_at" DESC);

-- Hot path: unread-count badge.
CREATE INDEX "notification_user_id_read_at_idx"
  ON "notification" ("user_id", "read_at");
