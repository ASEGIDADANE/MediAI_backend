-- Phase 7 — UserSubscription + interval/status enums
--
-- Turns `SubscriptionPlan` from a passive catalog (admin-only, no checkout)
-- into the canonical subscription system: patients pick a tier on /pricing,
-- get a `UserSubscription` row, pay via Chapa (or auto-grant for Free), and
-- the personal-chat gate honours `status='active' AND ends_at > now()`.
--
-- Append-only; no existing rows are touched. The legacy
-- `UserAssistantAccess` table remains in place as a transitional fallback
-- (so any 30/90-day passes already paid for keep working).

-- --- SubscriptionStatus enum ------------------------------------------------
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'pending',
  'active',
  'expired',
  'cancelled',
  'failed'
);

-- --- SubscriptionInterval enum ----------------------------------------------
CREATE TYPE "SubscriptionInterval" AS ENUM (
  'monthly',
  'yearly'
);

-- --- user_subscription table ------------------------------------------------
CREATE TABLE "user_subscription" (
  "id"                   TEXT NOT NULL,
  "user_id"              TEXT NOT NULL,
  "plan_id"              TEXT NOT NULL,
  "interval"             "SubscriptionInterval" NOT NULL DEFAULT 'monthly',
  "status"               "SubscriptionStatus" NOT NULL DEFAULT 'pending',
  "tx_ref"               TEXT NOT NULL,
  "chapa_checkout_url"   TEXT,
  "chapa_reference"      TEXT,
  "amount_cents"         INTEGER NOT NULL,
  "currency"             VARCHAR(3) NOT NULL DEFAULT 'ETB',
  "starts_at"            TIMESTAMP(3),
  "ends_at"              TIMESTAMP(3),
  "paid_at"              TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_subscription_pkey" PRIMARY KEY ("id")
);

-- One tx_ref per row globally (the Chapa lookup-by-txRef relies on this).
CREATE UNIQUE INDEX "user_subscription_tx_ref_key"
  ON "user_subscription" ("tx_ref");

ALTER TABLE "user_subscription"
  ADD CONSTRAINT "user_subscription_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_subscription"
  ADD CONSTRAINT "user_subscription_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "subscription_plan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hot path: personal-chat gate filters by (user_id, status='active', ends_at).
CREATE INDEX "user_subscription_user_id_status_ends_at_idx"
  ON "user_subscription" ("user_id", "status", "ends_at");

-- Admin reporting: subscriber-count per plan.
CREATE INDEX "user_subscription_plan_id_created_at_idx"
  ON "user_subscription" ("plan_id", "created_at");

-- --- One-time data fix on subscription_plan ---------------------------------
-- The seeded `SubscriptionPlan` rows defaulted to `currency = 'USD'`, but
-- Chapa charges in ETB and the new checkout flow uses the plan's recorded
-- currency verbatim. Re-stamp anything still on USD so existing dev/test
-- databases don't fail with "currency mismatch" the moment a user tries
-- to subscribe. Production deployments that explicitly want USD (and are
-- not on Chapa) can simply roll this back manually.
UPDATE "subscription_plan" SET "currency" = 'ETB' WHERE "currency" = 'USD';
