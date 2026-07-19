-- Adds a small, generic per-attempt context column to wellness_assessments
-- (migration 62) for questionnaires with a conditional/branching question.
-- Answers to a questionnaire's `contextQuestions` (see
-- apps/consumer-web-app/lib/assessments/engine/types.ts) are stored here,
-- keyed by their `key`, e.g. {"some_context_key": "some_value"} — scoped
-- to this one assessment attempt, not written to the member's profile,
-- and gone the moment a fresh attempt starts (a new row gets a fresh
-- default).
--
-- Additive and non-breaking: existing rows backfill instantly to '{}',
-- which is a no-op for every questionnaire without contextQuestions. No
-- RLS change needed — this is a column on an already-RLS-covered table,
-- read/written through the existing member_read_own / member_insert_own
-- / member_update_own policies from migration 62.

alter table wellness_assessments
  add column context jsonb not null default '{}'::jsonb;
