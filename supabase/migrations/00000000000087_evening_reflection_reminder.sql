-- Prompt 2.5, Issue 5: a one-time "come back for Evening Reflection"
-- reminder shown right after a member's Morning Readiness check-in.
-- "Save that it has been shown" (from the prompt) means durably, across
-- devices/sessions, not a per-browser localStorage flag (the closest
-- existing precedent for that lighter-weight approach is
-- WearableWelcomeModal, but that one is a low-stakes cosmetic nudge; this
-- reminder is explicitly asked to never reappear once seen). A single
-- nullable timestamptz on profiles, following the exact same pattern as
-- welcome_flow_completed_at (migration 85): presence of a value is the
-- sole "already shown" signal, no separate boolean to drift out of sync.
alter table profiles
  add column evening_reflection_reminder_shown_at timestamptz;

comment on column profiles.evening_reflection_reminder_shown_at is
  'Null until the member has been shown the one-time "come back for your
   Evening Reflection" message after a Morning Readiness check-in. Set once,
   never cleared, so the reminder never interrupts a later check-in.';

-- No RLS change: member_read_own_profile / member_update_own_profile
-- (migration 16) already cover this column the same as every other
-- profiles column.
