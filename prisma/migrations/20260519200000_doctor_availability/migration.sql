-- Phase 2 — Doctor availability scheduling
--
-- Three tables that together describe when a doctor takes appointments:
--   * weekly_availability_rule    — recurring weekly windows (with slot
--                                    duration + timezone)
--   * doctor_unavailable_date     — one-off blackout days (vacations etc.)
--   * doctor_capacity             — soft caps + accepted consultation types
--
-- All three are owned by `User.id` (the doctor) and cascade on user delete.

CREATE TABLE "weekly_availability_rule" (
    "id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time_minutes" INTEGER NOT NULL,
    "end_time_minutes" INTEGER NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_availability_rule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weekly_availability_rule_doctor_user_id_day_of_week_idx"
    ON "weekly_availability_rule" ("doctor_user_id", "day_of_week");

ALTER TABLE "weekly_availability_rule"
    ADD CONSTRAINT "weekly_availability_rule_doctor_user_id_fkey"
    FOREIGN KEY ("doctor_user_id") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------

CREATE TABLE "doctor_unavailable_date" (
    "id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_unavailable_date_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_unavailable_date_doctor_user_id_date_key"
    ON "doctor_unavailable_date" ("doctor_user_id", "date");

CREATE INDEX "doctor_unavailable_date_doctor_user_id_date_idx"
    ON "doctor_unavailable_date" ("doctor_user_id", "date");

ALTER TABLE "doctor_unavailable_date"
    ADD CONSTRAINT "doctor_unavailable_date_doctor_user_id_fkey"
    FOREIGN KEY ("doctor_user_id") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------

CREATE TABLE "doctor_capacity" (
    "doctor_user_id" TEXT NOT NULL,
    "max_appointments_per_day" INTEGER,
    "default_consultation_type" "ConsultationType" NOT NULL DEFAULT 'video',
    "accepted_consultation_types" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_capacity_pkey" PRIMARY KEY ("doctor_user_id")
);

ALTER TABLE "doctor_capacity"
    ADD CONSTRAINT "doctor_capacity_doctor_user_id_fkey"
    FOREIGN KEY ("doctor_user_id") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
