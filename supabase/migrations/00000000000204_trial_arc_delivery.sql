-- The trial arc's delivery receipt.
--
-- WHAT THIS RECORDS, AND WHAT IT DOES NOT. One row per member per trial
-- arc message key. It says "this message genuinely reached her screen on
-- this day, pointing at this step, and here is whether she acted on it".
-- It is not a schedule, not a queue and not a send log: nothing reads this
-- table to decide that a message is DUE, and nothing writes it in advance
-- of a display. The arc decides what to say fresh on every visit from rows
-- that already exist (lib/trial-arc/engine.ts), and this table is only the
-- record of what was said.
--
-- MODELLED ON member_weekly_reflection_deliveries (migration 191), which
-- settled this exact shape: a receipt is its own table rather than a column
-- on the thing it is about, because a delivered_at column on a row that
-- only exists once she FINISHES something would force a row into existence
-- on a render, which is the standing rule against render-time writes.
--
-- WHY THE RECEIPT IS NOT WHAT ENFORCES ONCE PER DAY. The pop-up chain
-- already has a once-per-day mechanism and the arc uses it unchanged: the
-- message key carries the day number (trial_arc_day:3), and
-- member_root_popup_dismissals is marked the instant the pop-up mounts,
-- exactly as the Priority Card and the Weekly Root Review already do with
-- their own date-scoped and week-scoped keys. This table exists for a
-- different question, the one the arc's CLOSER asks: of the messages that
-- genuinely reached her, how many did she neither act on nor answer with
-- the step they pointed at. Three of those and the pacing stops for good.
--
-- INSERT IF ABSENT, NEVER AN UPSERT. unique (member_id, message_key) IS
-- the once-per-message rule. A reload, a second surface, or a stale tab all
-- resolve to the one row that already exists with the FIRST delivered_at,
-- never a second row and never a newer timestamp, so "delivered" keeps
-- meaning the first time it reached her.
--
-- delivered_local_date is HER OWN calendar day, resolved on the server from
-- her stored profile timezone (lib/time/memberToday.ts), never the server's
-- date. The closer's rule is "did she complete the pointed-to step THAT SAME
-- DAY", and that comparison is only meaningful against the day she was
-- actually living in.
--
-- WHO WRITES IT. Only she does, from her own session, through the analytics
-- beacon fired by a mounted effect on the pop-up that genuinely displayed
-- (app/api/analytics/track/route.ts -> app/actions/trialArc.ts). There is no
-- coach write, no service write and no cron: the insert policy below only
-- ever accepts the signed in member's own id.
--
-- THE ONE THING THAT MAY EVER CHANGE ON A WRITTEN ROW is cta_tapped_at, and
-- the database is what limits it: the column grant at the bottom of this
-- file revokes UPDATE on the table and grants it back on that one column.
-- A receipt records a moment that already happened, and nothing in the app
-- has a reason to move the rest of it.
--
-- TEST ACCOUNTS. A receipt for a seeded account is written normally, because
-- the whole point of the fixture is to walk the real experience. Nothing in
-- lib/analytics-service/ reads this table, so no figure counts it.

create table member_trial_arc_deliveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- 'trial_arc_day:1' .. 'trial_arc_day:7'. Named with its own prefix so it
  -- can never collide with the day-3/day-7 experiment follow-ups already in
  -- the pop-up chain (cvs_day3, lsc_day7 and the rest), which are about a
  -- seven day experiment and have nothing to do with the trial week.
  message_key text not null,

  -- Which day of her trial this was, counted from
  -- member_subscriptions.trial_started_at in her own timezone, signup day
  -- being day 1. Stored beside the key rather than parsed back out of it,
  -- because a number is what every read of this table actually wants.
  day_number int not null check (day_number between 1 and 7),

  -- What the arc made of her that day. Not a label anything reads to decide
  -- behaviour: the state is recomputed from real rows on every visit and is
  -- never trusted from storage. It is here so the closer can tell that the
  -- one warm re-entry message has already been sent, and so a person
  -- reading these rows later can see what the arc thought at the time.
  pace_state text not null check (
    pace_state in ('ON_PACE', 'AHEAD', 'BEHIND', 'STALLED', 'DECLINED_EXPERIMENT')
  ),

  -- The step this message pointed at, so the closer's "did she complete the
  -- pointed-to step that same day" question can be answered without
  -- re-deriving what the arc said that day out of copy that may since have
  -- changed. 'none' is a real value: the day 5 connection message states an
  -- observation and asks nothing to be completed.
  pointed_step text not null check (
    pointed_step in ('core_values_snapshot', 'life_signal_check', 'experiment', 'none')
  ),

  -- The member's own calendar day, YYYY-MM-DD.
  delivered_local_date date not null,

  -- The first moment it genuinely reached her screen. Never updated.
  delivered_at timestamptz not null default now(),

  -- When she pressed the message's primary button, or null. The only
  -- column on a written row that may ever change.
  cta_tapped_at timestamptz,

  created_at timestamptz not null default now(),

  unique (member_id, message_key)
);

create index member_trial_arc_deliveries_member_day_idx
  on member_trial_arc_deliveries (member_id, day_number);

alter table member_trial_arc_deliveries enable row level security;

create policy member_read_own_trial_arc_deliveries on member_trial_arc_deliveries
  for select using (member_id = auth.uid());

create policy member_insert_own_trial_arc_deliveries on member_trial_arc_deliveries
  for insert with check (member_id = auth.uid());

-- The CTA stamp. Scoped to her own rows in both directions so an update can
-- never move a row onto another member, and narrowed to the one column by
-- the grant at the bottom of this file.
create policy member_stamp_own_trial_arc_cta on member_trial_arc_deliveries
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- The same narrow test-account escape hatch migrations 151, 189 and 191
-- give their own tables, and for the same reason: a verification pass has
-- to be able to see delivery happen more than once for one day number.
-- Restricted to seeded test accounts in the database itself, not only at
-- the call site.
create policy test_member_delete_own_trial_arc_deliveries on member_trial_arc_deliveries
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy platform_admin_all_trial_arc_deliveries on member_trial_arc_deliveries
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ONLY THE CTA STAMP MAY MOVE, and the database is what says so rather than
-- a convention in the data layer. Supabase's default privileges grant every
-- table privilege on a new public table to the authenticated role; this
-- takes UPDATE back and returns it on one column. A hand built request from
-- a member's own session can therefore stamp cta_tapped_at on her own row
-- and can change nothing else about a receipt, including the day it was
-- delivered on, which is the value the closer's rule is measured against.
revoke update on member_trial_arc_deliveries from authenticated;
grant update (cta_tapped_at) on member_trial_arc_deliveries to authenticated;
