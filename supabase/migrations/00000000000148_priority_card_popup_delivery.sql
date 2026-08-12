-- Priority Card delivery fix — the card now arrives as a pop-up on open,
-- through the EXISTING Root pop-up chain, and every member always has a
-- priority.
--
-- Two changes, both to migration 147's own table. No new table, no second
-- pop-up system: the "has this already popped" state reuses
-- member_root_popup_dismissals (migration 137) with a date-scoped message
-- key, so "once per day" needs no schema of its own.

-- ---------------------------------------------------------------------
-- 1) Two final fallback rules, so a brand-new member is never shown
--    nothing at all.
-- ---------------------------------------------------------------------
-- Rules 0 through 4 can all legitimately come up empty: a member with no
-- Reset Plan, no implicated driver, nothing abandoned, and (as found on
-- production) no daily_feed_items row has no priority under the original
-- hierarchy, so the pop-up would simply never appear for exactly the
-- member who most needs a first step.
--
-- Both new rules sit LAST and are structurally unable to outrank rules 0
-- through 4 — that ordering lives in lib/priority/types.ts's
-- PRIORITY_LADDER and is asserted by tests/priority-hierarchy.test.ts,
-- which walks the ladder as data rather than restating it.
--
-- Exactly one of the two can ever apply, since they are the two halves of
-- a single question:
--   'daily_reset'  she has not completed today's Daily Reset. The
--                  priority is the Daily Reset itself, which is the
--                  product's real core loop, not an invented task.
--   'gentle_focus' she already completed it. The priority is drawn from
--                  her own stated onboarding goal (member_goal_selections),
--                  quoted back rather than interpreted. Never an insight,
--                  because a member at this point has produced nothing to
--                  have an insight about.
alter table member_daily_priorities drop constraint member_daily_priorities_rule_check;

alter table member_daily_priorities add constraint member_daily_priorities_rule_check
  check (rule in (
    're_entry',
    'reset_plan_commitment',
    'implicated_driver',
    'incomplete_action',
    'todays_focus',
    'daily_reset',
    'gentle_focus'
  ));

-- ---------------------------------------------------------------------
-- 2) Which presentation actually showed the priority first, recorded once.
-- ---------------------------------------------------------------------
-- The analytics requirement is that one day's card must never double-count
-- as multiple priorities. The card can render in three places on the same
-- day (the pop-up, Home, and Today), and Home renders the pop-up and the
-- inline card in the same pass, so a client-side dedupe window cannot
-- decide this correctly or deterministically.
--
-- These two columns make it a single atomic claim instead: the tracking
-- action issues `update ... where member_id = ? and local_date = ? and
-- shown_at is null`, and only the caller whose update actually touches a
-- row writes the `priority_shown` event. Exactly one event per member per
-- local day, and the presentation recorded is the one that genuinely
-- reached her first, never a guess.
alter table member_daily_priorities add column shown_at timestamptz;

alter table member_daily_priorities add column shown_presentation text
  check (shown_presentation in ('popup', 'inline'));

-- Same reason migrations 124, 146 and 147 end this way: PostgREST caches
-- the schema and a `--db-url` apply does not reliably make it reload, so
-- without this the new columns exist in Postgres but every REST read that
-- names them fails until the instance happens to restart.
notify pgrst, 'reload schema';
