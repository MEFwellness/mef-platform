-- Two coach-view bugs found on a real member's page, 2026-08-30.
--
-- BUG 1. "Where is it, mainly?" sat in a coach's check-in history against a
-- day the member had answered "No pain (0 of 5)", with the two characters
-- `[]` as her answer. Two separate faults, one of them here.
--
--   The check-in screen has gated the whole discomfort block behind "Any
--   discomfort today?" since 2026-07-29, and answering no writes an EMPTY
--   location deliberately, so flipping the gate from yes to no clears a
--   location she had already picked that day. That write is correct and is
--   kept. What was missing is that the two pain follow-ups never said, as
--   data, what they depend on: their `requires` was empty, so nothing
--   outside the check-in component knew the question only exists on a day
--   with pain above zero. The coach's history therefore listed a question
--   that was never put to her.
--
--   The rules below are the same shape every other follow-up in this table
--   already uses (checkin_probe.digestive_symptom_type requires
--   digestion_rating <= 2, checkin_probe.skipped_meal_which requires
--   meals_skipped_today >= 1), read by the same evaluator, so this is a
--   data change and not a new mechanism.
--
--   checkin_probe.pain_discomfort_level is the fixed core's own pain
--   question. It has no row in this bank because the body outline asks it
--   as part of the check-in itself rather than as a rotating probe, and a
--   rule may name any answered question key, not only a bank row.
--
-- BUG 2. "What needs attention" on one member's page showed five "No recent
-- check-in" alerts, one saying 12 days and four saying 7, for a member who
-- checked in yesterday. Not a cross-member leak: every one of those rows
-- was really hers. Two faults, both fixed here and in
-- lib/intelligence-engine/data.ts.
--
--   a) The engine recalculates on every coach page view, and several panels
--      on one page call it at once. upsertCoachAlert reads "is there
--      already an open alert with this key", finds none, and inserts. Four
--      concurrent runs all read "none" before any of them wrote, so one
--      member ended up with four identical open rows created 180ms apart.
--      Nothing in the schema forbade it: the (member_id, alert_key) index
--      on open rows existed but was not unique.
--
--   b) Nothing ever closed an alert whose condition had stopped being true.
--      The alert is only ever written when the rule fires, so a member who
--      resumed checking in kept an open row with the number of days frozen
--      at whatever it was the day she stopped.

-- ---------------------------------------------------------------------
-- 1. The pain follow-ups declare what they depend on
-- ---------------------------------------------------------------------

update driver_probe_questions
set requires = '[{"question_key": "checkin_probe.pain_discomfort_level", "op": "gt", "value": 0}]'::jsonb
where question_key in (
  'checkin_probe.pain_location',
  'checkin_probe.pain_aggravating_factor'
)
and requires = '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 2. One open alert per member per key, enforced by Postgres
-- ---------------------------------------------------------------------

-- The duplicates already on file. The newest row per (member, key) is kept
-- because it is the one the touch path has been updating, so it carries the
-- current wording; the older twins are marked dismissed rather than deleted,
-- since a coach may already have read one and this table is a record of what
-- was raised. Dismissed is also the one status the engine never reopens or
-- rewrites, so a swept row stays swept.
update intelligence_coach_alerts a
set status = 'dismissed',
    updated_at = now()
where a.status in ('open', 'acknowledged')
and exists (
  select 1
  from intelligence_coach_alerts newer
  where newer.member_id = a.member_id
    and newer.alert_key = a.alert_key
    and newer.status in ('open', 'acknowledged')
    and (newer.updated_at, newer.created_at, newer.id) > (a.updated_at, a.created_at, a.id)
);

drop index if exists intelligence_coach_alerts_open_idx;

create unique index intelligence_coach_alerts_open_idx
  on intelligence_coach_alerts (member_id, alert_key)
  where status in ('open', 'acknowledged');

-- ---------------------------------------------------------------------
-- 3. Which writer owns a row
-- ---------------------------------------------------------------------

-- Closing an alert whose condition has cleared means the engine has to know
-- which rows are its own to close. Two other callers write into this table
-- (lib/coaching-direction/service.ts: a thread that stopped landing, and an
-- unacknowledged safety flag), and those are events rather than recomputed
-- conditions: nothing recomputes them each run, so a sweep that did not know
-- the difference would close them the first time it ran. The column says so
-- at write time instead of leaving it to a naming convention.
alter table intelligence_coach_alerts
  add column if not exists produced_by text not null default 'intelligence_engine'
  check (produced_by in ('intelligence_engine', 'coaching_direction'));

update intelligence_coach_alerts
set produced_by = 'coaching_direction'
where alert_key like 'coaching_direction_%';

create index if not exists intelligence_coach_alerts_reconcile_idx
  on intelligence_coach_alerts (member_id, produced_by)
  where status in ('open', 'acknowledged');

-- ---------------------------------------------------------------------
-- 4. The stale "No recent check-in" rows already on file
-- ---------------------------------------------------------------------

-- Every open no_checkin alert for a member whose latest check-in is inside
-- the threshold the rule uses (NO_CHECKIN_ALERT_DAYS, 5). The engine's own
-- sweep will do this from now on; this clears what is already there, so a
-- coach is not waiting on a page view for the correction. Resolved, not
-- dismissed: it stopped being true, and the same alert must be free to open
-- again if she stops checking in later.
update intelligence_coach_alerts a
set status = 'resolved',
    resolved_at = now(),
    resolution_note = 'Closed automatically: this member has checked in since.',
    updated_at = now()
where a.alert_key = 'no_checkin'
and a.status in ('open', 'acknowledged')
and exists (
  select 1
  from daily_checkins c
  where c.user_id = a.member_id
    and c.local_date > (current_date - 5)
);
