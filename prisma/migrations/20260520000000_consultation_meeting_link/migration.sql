-- Phase 4 — expand ConsultationType (in_person, hybrid) and add meeting-link
-- columns to consultation_booking.
--
-- Notes:
--  * `ALTER TYPE ... ADD VALUE` is non-transactional in PostgreSQL, so each
--    new enum value is added in its own statement *before* any DDL that
--    might reference it.
--  * `meeting_link` is a nullable VARCHAR(1000) so a single column comfortably
--    fits a Google Meet / Zoom / WhereBy URL plus optional access codes
--    (`?pwd=...`). Larger free-text instructions belong in `patient_notes`
--    or a future `notes` field, not here.

ALTER TYPE "ConsultationType" ADD VALUE IF NOT EXISTS 'in_person';
ALTER TYPE "ConsultationType" ADD VALUE IF NOT EXISTS 'hybrid';

ALTER TABLE "consultation_booking"
  ADD COLUMN IF NOT EXISTS "meeting_link" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "meeting_link_set_at" TIMESTAMP(3);
