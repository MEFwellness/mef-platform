-- Day 6 of the trial arc: "What This Week Showed", as stored.
--
-- WHY THIS IS ITS OWN TABLE AND NOT A ROW ON member_weekly_reviews.
--
-- The Weekly Root Review (migration 151) already stores a plan and renders
-- it at read time, and this feature copies that discipline exactly. It does
-- not copy its table, for three reasons, each of which would have needed a
-- rule bent to work around it:
--
--   1. A review row is keyed by (member_id, week_start) and its plan
--      REQUIRES a focus: an action type or a thread key that biases the
--      daily coaching engine for the coming week. The day 6 recap sets no
--      focus and must not. Storing one here would mean either inventing a
--      focus nobody chose, or loosening sanitizePlan so a focus is optional,
--      which weakens a rule the review depends on.
--   2. The two vocabularies do not overlap at all. A review's observations
--      are metric directions and friction signals; a recap's cards are a
--      value area, a signal with six loudness scores, an experiment state, a
--      readiness stage and one published signal. Sharing a jsonb column
--      would mean one sanitizer accepting both, and a sanitizer that accepts
--      two vocabularies is a sanitizer that accepts neither strictly.
--   3. Every surface that reads member_weekly_reviews would inherit the
--      recap. A trial arc recap appearing on Home and on the coach's panel
--      as this week's Weekly Root Review is a bug that would ship silently.
--
-- ONE ROW PER MEMBER PER TRIAL, AND IMMUTABLE ONCE WRITTEN. unique
-- (member_id) IS that rule. A trial happens once for an account, so the
-- member is the key. The plan column never changes after the insert: the
-- recap she reads on the continuation screen in the next prompt is
-- byte-for-byte the recap she read on day 6, with the same numbers,
-- whatever has happened to her rows since. That is enforced below by the
-- same column-grant technique migration 204 uses for the delivery receipt:
-- UPDATE is revoked on the table for the authenticated role and granted
-- back on opened_at alone.
--
-- WHAT THE PLAN HOLDS, AND WHAT IT MAY NEVER HOLD. Slugs from closed sets
-- declared in the codebase, and finite numbers. Never a sentence, never a
-- check-in answer, never an assessment answer, never free text of any kind.
-- lib/trial-arc/recapPlan.ts is the sanitizer, it runs in both directions,
-- and tests/trial-arc-recap-guard.test.ts fails the build if its vocabulary
-- grows a free-text field.
--
-- WHY THE TIER AND THE CALLBACK FLAG ARE ALSO COLUMNS. The next prompt asks
-- "which tier was she, and did she get the arrival callback" without wanting
-- to parse jsonb, and both answers are useful in a plain SQL read while a
-- verification run is happening. They are DERIVED FROM THE PLAN at write
-- time, in one place (lib/trial-arc/recapData.ts), and nothing renders from
-- them: the screen renders from the plan only. So the two can never
-- disagree about what was shown.
--
-- opened_at IS A FACT THE NEXT PROMPT NEEDS TO BE ABLE TO SAY HONESTLY. A
-- row with opened_at null means Root offered her the recap and she never
-- opened it. That is a different thing from never having been offered one,
-- which is the absence of a row, and the continuation screen has to be able
-- to tell those apart rather than assuming she read it.
--
-- WHO WRITES IT. Only she does, from her own session, through the analytics
-- beacon route. There is no coach write, no service write and no cron.

create table member_trial_arc_recaps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- 'A', 'B' or 'C'. Thin data first: A is a member who has not finished
  -- both of the week's conversations, which is the ordinary case on day 6
  -- of a free trial and not a failure state.
  tier text not null check (tier in ('A', 'B', 'C')),

  -- True when she arrived through Where Your Energy Goes with a real result
  -- bound to her account, which is the one condition that earns the arrival
  -- callback card. Derived from the plan at write time.
  fatigue_callback boolean not null default false,

  -- The stored plan: card kinds, slugs and numbers. Never prose.
  plan jsonb not null,

  -- Which day of her trial it was composed on, in her own timezone. 6 in
  -- ordinary use; the column allows 6 or 7 so a member who never opened the
  -- app on day 6 can still be given her recap on day 7 rather than losing it.
  day_number int not null check (day_number between 6 and 7),

  -- Her own calendar day, resolved on the server from her stored profile
  -- timezone (lib/time/memberToday.ts), never the server's date.
  composed_local_date date not null,

  composed_at timestamptz not null default now(),

  -- When the recap screen genuinely displayed, from a mounted effect on the
  -- screen itself. Null means offered and never opened. The only column on
  -- a written row that may ever change.
  opened_at timestamptz,

  created_at timestamptz not null default now(),

  unique (member_id)
);

alter table member_trial_arc_recaps enable row level security;

create policy member_read_own_trial_arc_recap on member_trial_arc_recaps
  for select using (member_id = auth.uid());

create policy member_insert_own_trial_arc_recap on member_trial_arc_recaps
  for insert with check (member_id = auth.uid());

-- The opened stamp. Scoped to her own row in both directions so an update
-- can never move a row onto another member, and narrowed to the one column
-- by the grant at the bottom of this file.
create policy member_stamp_own_trial_arc_recap_opened on member_trial_arc_recaps
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- The same narrow test-account escape hatch migrations 151, 189, 191 and
-- 204 give their own tables, and for the same reason: a verification pass
-- has to be able to watch day 6 compose more than once. Restricted to
-- seeded test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_trial_arc_recap on member_trial_arc_recaps
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy platform_admin_all_trial_arc_recaps on member_trial_arc_recaps
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- IMMUTABLE EXCEPT FOR THE OPEN STAMP, AND THE DATABASE IS WHAT SAYS SO
-- rather than a convention in the data layer. Supabase's default privileges
-- grant every table privilege on a new public table to the authenticated
-- role; this takes UPDATE back and returns it on one column. A hand built
-- request from a member's own session can therefore record that she opened
-- her recap and can change nothing about what it says, which is the whole
-- point of composing it once.
revoke update on member_trial_arc_recaps from authenticated;
grant update (opened_at) on member_trial_arc_recaps to authenticated;
