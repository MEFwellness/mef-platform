-- Adaptive Coaching Direction, Part 3 — the grading loop, per-member
-- adaptation, and the coach escalation surface.
--
-- This build adds NO new intelligence and NO new engine. It closes the
-- circle Parts 1 and 2 opened:
--
--   Part 1  recorded every decision and what the member did about it
--           (member_coaching_decisions, member_coaching_threads,
--           migration 150)
--   Part 2  reported the week and set one focus for the next one
--           (member_weekly_reviews, member_week_focus, migration 151)
--   Part 3  grades what the ledger shows, feeds the grade back into the
--           daily engine as a PREFERENCE INSIDE a rung, and gives the
--           escalation flag Part 1 already sets a place a coach can see it
--
-- Everything here is counting and comparing. It computes no correlation,
-- no driver state, no tier, no score, and no content. The one judgement it
-- makes is arithmetic: did she act on this kind of thing, and did the
-- before/after comparison primitive (lib/analytics-service/comparison.ts,
-- migration 149) report movement afterwards.
--
-- HARD PRIVACY RULE, identical to migrations 146, 150 and 151: nothing in
-- this migration may carry health content. No check-in answer, no
-- questionnaire response, no nutrition detail, no concern category, no
-- free text at all. A grade row holds action type slugs, thread keys,
-- counts, and comparison outcomes. lib/coaching-direction/grading.ts's
-- closed vocabulary and tests/coaching-grades-privacy.test.ts are what
-- keep that true at the call sites.

-- ---------------------------------------------------------------------
-- 1) The per-decision comparison outcome, cached on the ledger row.
-- ---------------------------------------------------------------------
-- Migration 150 stores the before/after window as PARAMETERS rather than
-- as a result, and its own header explains why: freezing the numbers at
-- delivery would mean grading a decision against an after window that had
-- not finished elapsing.
--
-- These two columns are the other half of that same discipline, and they
-- are safe for exactly the opposite reason. They are written ONLY once
-- comparison_after_complete_on has passed, at which point the window has
-- finished elapsing and its numbers can no longer change. Computing the
-- same completed comparison again on every grading run would be pure cost
-- for an answer that is now fixed.
--
--   'moved'         at least one behavioral metric in the after window
--                   differs from the before window by more than the
--                   threshold in lib/coaching-direction/grading.ts.
--   'flat'          the comparison ran and nothing moved past it.
--   'out_of_scope'  the primitive reported inScope false (an unknown id,
--                   a coach account, a test account while the toggle is
--                   off). Recorded so it is never retried forever.
--
-- Deliberately direction-agnostic. The comparison primitive's own header
-- states it never says whether a change was good, and a grader that
-- decided that for itself would be interpreting rather than counting.
alter table member_coaching_decisions
  add column comparison_outcome text
    check (comparison_outcome in ('moved', 'flat', 'out_of_scope'));

alter table member_coaching_decisions
  add column comparison_computed_at timestamptz;

-- "Which acted-on decisions have a completed window and no cached
-- outcome" — the only query the grading pass runs that costs anything.
create index member_coaching_decisions_ungraded_idx
  on member_coaching_decisions (member_id, comparison_after_complete_on)
  where comparison_outcome is null;

-- ---------------------------------------------------------------------
-- 2) The escalation lifecycle, on the thread row Part 1 already flags.
-- ---------------------------------------------------------------------
-- Part 1 set coach_escalated_at and stopped. A thread carrying it is
-- never selected again by anything, which was the correct conservative
-- default and is also a dead end: nothing could ever clear it.
--
-- These four columns are that dead end's exit, and nothing more.
--
--   escalation_resolved_at    when a coach cleared the flag.
--   escalation_resolved_by    which coach. An id, never a note.
--   escalation_cooldown_until the local date before which the engine will
--                             still not select this thread. Resolving is
--                             permission to try again LATER, not an
--                             instruction to raise the same thing on the
--                             member's very next render.
--   escalation_count          how many times this thread has been
--                             escalated. A thread on its second escalation
--                             is a different situation from one on its
--                             first, and a coach should be able to see
--                             which they are looking at.
--
-- coach_escalated_at itself is CLEARED on resolve, because it is the
-- queryable flag the engine and the coach surface both read, and a
-- resolved thread is not a flagged thread. The history survives in
-- escalation_resolved_at and escalation_count.
alter table member_coaching_threads
  add column escalation_resolved_at timestamptz;

alter table member_coaching_threads
  add column escalation_resolved_by uuid references auth.users(id) on delete set null;

alter table member_coaching_threads
  add column escalation_cooldown_until date;

alter table member_coaching_threads
  add column escalation_count int not null default 0 check (escalation_count >= 0);

-- ---------------------------------------------------------------------
-- 3) The resolve action, as a function rather than as a wider policy.
-- ---------------------------------------------------------------------
-- A coach needs to write exactly four columns on a row belonging to
-- someone else. Row level security can say WHO may update a row; it
-- cannot say WHICH COLUMNS, so a coach UPDATE policy on this table would
-- also hand a coach every adaptation counter on it.
--
-- A SECURITY DEFINER function is the precise tool: the database is still
-- the boundary (the coach relationship is checked here, by the same two
-- functions every RLS policy in this codebase uses, not in application
-- code), and the set of columns that can possibly change is fixed by the
-- function body.
--
-- The counters are reset alongside the flag on purpose. A thread that
-- resumes carrying three ignored days and two approach changes would
-- re-escalate on the render after its cooldown ends, which is not a
-- retry, it is a loop. Resolving means Root starts this conversation
-- again from the beginning, later.
create or replace function public.resolve_coaching_escalation(
  p_member uuid,
  p_thread_key text,
  p_cooldown_days int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'resolve_coaching_escalation requires an authenticated session';
  end if;

  -- The same two functions migration 150's own coach read policy uses.
  -- An administrator may also resolve, matching every other
  -- platform_admin_all_* policy in this codebase.
  if not (
    (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to resolve escalations for this member';
  end if;

  if p_cooldown_days is null or p_cooldown_days < 0 or p_cooldown_days > 365 then
    raise exception 'cooldown days out of range';
  end if;

  update member_coaching_threads
     set coach_escalated_at = null,
         coach_escalation_reason = null,
         escalation_resolved_at = now(),
         escalation_resolved_by = auth.uid(),
         escalation_cooldown_until = (current_date + p_cooldown_days)::date,
         -- A fresh start, not a resumption. See the note above.
         approach = 0,
         approach_changes = 0,
         consecutive_ignored = 0,
         responses_since_last_change = 0,
         updated_at = now()
   where member_id = p_member
     and thread_key = p_thread_key
     -- Only a genuinely flagged thread can be resolved, so a double tap
     -- resolves once and a second call reports false rather than pushing
     -- the cooldown forward.
     and coach_escalated_at is not null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.resolve_coaching_escalation(uuid, text, int) from public;
grant execute on function public.resolve_coaching_escalation(uuid, text, int) to authenticated;

comment on function public.resolve_coaching_escalation(uuid, text, int) is
  'Adaptive Coaching Direction Part 3: a coach clears one escalated thread.
   Checks the coach relationship with the same functions the RLS policies
   use, and can only ever touch the escalation columns and the adaptation
   counters it resets. Never reads or writes health content.';

-- The escalation counter is incremented where the flag is set, which is
-- lib/coaching-direction/data.ts's escalateCoachingThread. Existing rows
-- that were already escalated before this migration are backfilled to 1
-- so the coach surface never shows "escalated 0 times" for a thread that
-- is visibly flagged.
update member_coaching_threads
   set escalation_count = 1
 where coach_escalated_at is not null
   and escalation_count = 0;

-- ---------------------------------------------------------------------
-- 4) member_coaching_grades — what the ledger shows about each approach.
-- ---------------------------------------------------------------------
-- One row per member per graded scope. Two scopes, and both are asked for
-- by the brief because they answer different questions:
--
--   'action_type'  does this KIND of ask land for her. This is the scope
--                  the daily engine's preference layer reads, because the
--                  thing it chooses between inside a rung is a kind of
--                  action.
--   'thread'       did this ONE continuing conversation land. This is the
--                  scope a coach and the weekly review can use to talk
--                  about a specific thing rather than a category.
--
-- WHAT A GRADE IS ALLOWED TO CONTAIN. Counts, the two slugs identifying
-- the scope, the comparison tallies, and an evidence level. There is
-- deliberately no free-string column at all, which is the same rule
-- migration 151 set for the review plan and for the same reason: there is
-- no field a sentence could arrive in.
--
-- delivered_count / acted_count / ignored_count / not_seen_count.
--
-- The brief defines its "ignored count" as later + ignored + not_seen, and
-- ignored_count below holds exactly that. not_seen_count is stored
-- ALONGSIDE it rather than only inside it, because migration 150's whole
-- reason for keeping 'ignored' and 'not_seen' apart is that a day she
-- never opened the app is not evidence about the suggestion. The 'dead'
-- verdict is therefore computed from the responses she could actually
-- have given, and the aggregate the brief asked for is still stored and
-- still readable. Both facts exist; neither is inferred from the other.
create table member_coaching_grades (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  grade_scope text not null check (grade_scope in ('action_type', 'thread')),
  -- The action type slug, or the thread key. Both are identifiers this
  -- codebase declares; neither is prose.
  grade_key text not null,

  -- The action type behind this grade. Equal to grade_key on an
  -- action_type row, and the thread's own action type on a thread row, so
  -- the preference layer can read one column on either scope.
  action_type text not null check (action_type in (
    'reset', 'nutrition', 'movement', 'reflection', 'reconnect'
  )),

  delivered_count int not null default 0 check (delivered_count >= 0),
  acted_count int not null default 0 check (acted_count >= 0),
  ignored_count int not null default 0 check (ignored_count >= 0),
  not_seen_count int not null default 0 check (not_seen_count >= 0),

  -- Decisions whose after window had finished elapsing and was comparable,
  -- and how many of those reported movement. moved_count <= compared_count
  -- always; the check is stated rather than trusted.
  compared_count int not null default 0 check (compared_count >= 0),
  moved_count int not null default 0 check (moved_count >= 0),
  check (moved_count <= compared_count),

  -- 'landing'            acted on, and a completed comparison moved.
  -- 'landed_no_change'   acted on, comparisons ran, nothing moved yet.
  -- 'dead'               repeatedly reached her and repeatedly not acted on.
  -- 'neutral'            not enough either way. The ordinary state.
  verdict text not null check (verdict in (
    'landing', 'landed_no_change', 'dead', 'neutral'
  )),

  -- How much behavior stood behind the grade, in the same spirit as the
  -- friction signals service's own evidence sufficiency, and computed by
  -- calling that service's own function rather than restating its
  -- thresholds. 'thin' is this build's name for its 'low': a thin grade is
  -- labelled thin and is never dressed up as a finding. The weekly review
  -- says nothing at all about a thin grade.
  evidence_level text not null check (evidence_level in ('thin', 'moderate', 'strong')),

  -- The span the counts were drawn from, and the last day this scope was
  -- actually delivered. The second one is what the 21 day decay reads: a
  -- dead grade whose type has not been delivered for that long returns to
  -- neutral so Root can carefully try it again rather than writing an
  -- approach off forever.
  span_days int not null default 0 check (span_days >= 0),
  last_delivered_local_date date,

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, grade_scope, grade_key)
);

create index member_coaching_grades_member_idx
  on member_coaching_grades (member_id, grade_scope);

alter table member_coaching_grades enable row level security;

-- The grading pass runs on the member's own render (after a completed
-- check-in, and on the weekly review composition path), so her own session
-- is what writes these rows. Same shape as migration 150's policies.
create policy member_read_own_coaching_grades on member_coaching_grades
  for select using (member_id = auth.uid());

create policy member_insert_own_coaching_grades on member_coaching_grades
  for insert with check (member_id = auth.uid());

create policy member_update_own_coaching_grades on member_coaching_grades
  for update using (member_id = auth.uid());

create policy coach_read_assigned_coaching_grades on member_coaching_grades
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_coaching_grades on member_coaching_grades
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table member_coaching_grades is
  'Adaptive Coaching Direction Part 3: what the outcome ledger shows about
   each approach, per action type and per thread. Counts, slugs and
   comparison outcomes only, never health content. Read by the daily
   engine as a preference INSIDE a hierarchy rung and by the weekly review
   at non-thin evidence only.';

-- ---------------------------------------------------------------------
-- 5) Three additive analytics event types.
-- ---------------------------------------------------------------------
-- Same rule migrations 63, 146, 147, 150 and 151 all followed: a new event
-- source WIDENS this constraint, it never adds a second events table. All
-- three are behavioral only.
--
--   coaching_thread_escalated     a thread Root could not make land was
--                                 handed to a coach. Carries the action
--                                 type slug and nothing else.
--   coaching_escalation_resolved  a coach cleared one. Written with
--                                 source 'coach'.
--   coaching_grades_computed      a grading pass ran. Carries COUNTS ONLY,
--                                 as digit strings, because the analytics
--                                 payload is a map of short slugs and a
--                                 count is the shortest slug there is.
alter table member_wellness_events drop constraint member_wellness_events_event_type_check;

alter table member_wellness_events add constraint member_wellness_events_event_type_check
  check (event_type in (
    -- Wellness types (migration 63) — real health content, NOT analytics.
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded',

    -- Product analytics types (migration 146), behavioral only.
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',

    -- Priority Card (migration 147), behavioral only.
    'priority_shown',
    'priority_action',
    're_entry_shown',

    -- Adaptive Coaching Direction Part 1 (migration 150), behavioral only.
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',

    -- The Weekly Root Review, Part 2 (migration 151), behavioral only.
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',

    -- Adaptive Coaching Direction Part 3 (this migration), behavioral only.
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed'
  ));

-- The one place "which types are analytics" is defined in the database.
-- Recreated with the three new types so the product_analytics_events view
-- (which calls this function in its WHERE clause) picks them up without
-- the view itself having to change.
create or replace function public.is_product_analytics_event_type(p_event_type text)
returns boolean
language sql
immutable
as $$
  select p_event_type in (
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',
    'priority_shown',
    'priority_action',
    're_entry_shown',
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed'
  );
$$;

-- Same reason migrations 124, 146, 147, 148, 150 and 151 end this way:
-- this is a new table reached through PostgREST, and a `db push --db-url`
-- run does not reliably make PostgREST reload its cached schema. Without
-- this the table exists in Postgres but every REST read of it fails with
-- PGRST205 until the instance happens to restart.
notify pgrst, 'reload schema';
