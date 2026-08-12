-- Adaptive Coaching Direction, Part 1 — the decision layer's memory.
--
-- This build adds NO new intelligence. Every signal the decision engine
-- reads was already computed and published by a system that shipped
-- before it:
--
--   safety            safety_classifications + safety_acknowledgments (migration 28)
--   re-engagement     member_return_greetings / session_started (migration 143, 146)
--   commitment        member_reset_plan_daily_logs (migration 142)
--   qualified finding member_driver_states (migration 106) + member_pattern_states (migration 93/105)
--   friction          the analytics service layer's own RPCs (migration 149)
--   fallback          member_goal_selections + daily_checkins, unchanged
--
-- What genuinely has nowhere to live today is the DECISION itself, and
-- what happened to it. Migration 147's member_daily_priorities already
-- records what Root put on screen; it does not record why that rule won
-- over the others, which approach the engine was on, whether the member
-- ever responded, or which window a later grading pass should compare.
-- That is what the two tables below hold, and nothing else.
--
-- HARD PRIVACY RULE, identical to migration 146's: nothing in either
-- table may carry health content. No check-in answer, no questionnaire
-- response, no nutrition detail, no concern category, no free text at
-- all. signal_evidence holds signal KEYS and numeric METRICS only, and
-- lib/coaching-direction/evidence.ts's sanitizer plus
-- tests/coaching-direction-privacy.test.ts are what keep that true at the
-- call sites.

-- ---------------------------------------------------------------------
-- 1) Three additive rule slugs on member_daily_priorities.
-- ---------------------------------------------------------------------
-- The card keeps ONE hierarchy. These are new rungs on migration 147's
-- own ladder, not a second ladder:
--
--   'safety'              an unresolved check-in safety flag. An override,
--                         like 're_entry': it suspends the ladder rather
--                         than sitting at the top of it, and it outranks
--                         're_entry' itself.
--   'qualified_pattern'   a tier 3 correlation finding, the second half of
--                         "a tier 3 qualified pattern OR a Case View
--                         implicated driver". 'implicated_driver' is the
--                         first half and is unchanged, so a stored row
--                         still says exactly which kind of finding won.
--   'behavioral_friction' a repeated stuck behavior read from the friction
--                         signals service.
--
-- Every pre-existing rule keeps its exact position relative to every
-- other pre-existing rule. Nothing that used to win stops winning.
alter table member_daily_priorities drop constraint member_daily_priorities_rule_check;

alter table member_daily_priorities add constraint member_daily_priorities_rule_check
  check (rule in (
    'safety',
    're_entry',
    'reset_plan_commitment',
    'implicated_driver',
    'qualified_pattern',
    'incomplete_action',
    'behavioral_friction',
    'todays_focus',
    'daily_reset',
    'gentle_focus'
  ));

-- ---------------------------------------------------------------------
-- 2) member_coaching_threads — the adaptation state, one row per thread.
-- ---------------------------------------------------------------------
-- A "thread" is one continuing coaching conversation about one thing:
-- the rule that produced it plus the specific item within that rule (a
-- driver id, a reset plan id, a friction kind). Migration 147 already
-- stores that pair per DAY; what it cannot answer is the question the
-- adaptation guardrails are about, which is what has happened to this
-- same thing ACROSS days.
--
-- Three counters, and each one exists because a specific guardrail needs
-- it:
--
--   consecutive_ignored        "same priority ignored 3 consecutive days"
--   approach_changes           "two approach changes"
--   responses_since_last_change "...with no member response"
--
-- approach is the current framing, and it is deliberately a small
-- integer rather than a free string: 0 is the priority as written, 1 is
-- its own smaller step promoted to the priority, 2 is the reframe that
-- offers her a way out of it. lib/coaching-direction/adaptation.ts is the
-- only thing that moves it and the values are declared there.
--
-- coach_escalated_at is the queryable flag the brief asks for. A thread
-- with it set is never selected again, by anything. There is deliberately
-- no coach UI in this build; the coach-facing surfacing reuses the
-- existing intelligence_coach_alerts path (migration 34), which a member
-- session may already write and an assigned coach may already read.
create table member_coaching_threads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- '<rule>::<priority_key or ->'. Stable across days, which is the whole
  -- point: it is what makes "the same priority, again" a fact rather than
  -- a string comparison of two rendered titles.
  thread_key text not null,

  rule text not null,
  action_type text not null check (action_type in (
    'reset', 'nutrition', 'movement', 'reflection', 'reconnect'
  )),

  approach int not null default 0 check (approach between 0 and 2),
  approach_changes int not null default 0 check (approach_changes >= 0),
  consecutive_ignored int not null default 0 check (consecutive_ignored >= 0),
  responses_since_last_change int not null default 0 check (responses_since_last_change >= 0),

  first_selected_local_date date,
  last_selected_local_date date,

  coach_escalated_at timestamptz,
  -- A short slug, never prose and never a reason about her health. The
  -- only value this build writes is 'no_response_after_two_changes'.
  coach_escalation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, thread_key)
);

create index member_coaching_threads_member_idx
  on member_coaching_threads (member_id, updated_at desc);

-- The queryable escalation flag, as an index rather than only a column,
-- so "which threads are waiting on a coach" is a cheap question.
create index member_coaching_threads_escalated_idx
  on member_coaching_threads (member_id)
  where coach_escalated_at is not null;

alter table member_coaching_threads enable row level security;

create policy member_read_own_coaching_threads on member_coaching_threads
  for select using (member_id = auth.uid());

create policy member_insert_own_coaching_threads on member_coaching_threads
  for insert with check (member_id = auth.uid());

create policy member_update_own_coaching_threads on member_coaching_threads
  for update using (member_id = auth.uid());

create policy coach_read_assigned_coaching_threads on member_coaching_threads
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_coaching_threads on member_coaching_threads
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3) member_coaching_decisions — the outcome ledger.
-- ---------------------------------------------------------------------
-- One row per DELIVERED decision. This is the memory the Part 3 grading
-- loop reads, so every field here exists to answer a question that pass
-- will ask:
--
--   which rule fired, and what kind of action was it   rule, action_type
--   what evidence drove it                             signal_evidence
--   which framing was she on                           approach
--   was it built on yesterday's success                is_follow_on
--   what did she do about it                           member_response
--   did anything change afterwards                     the comparison window
--
-- THE COMPARISON WINDOW IS STORED AS PARAMETERS, NOT AS A RESULT. The
-- before/after primitive (lib/analytics-service/comparison.ts) is a live
-- query; freezing its output here would mean grading a decision against
-- numbers computed before its after-window had finished elapsing, which
-- is exactly the mistake that primitive's own header warns about. So this
-- table stores the reference date, the window length, and the date the
-- after window is complete. A grader reads those three, calls the
-- existing primitive, and gets an honest comparison or an explicit "not
-- yet".
--
-- member_response is nullable ONLY between delivery and resolution. The
-- engine finalizes every unresolved past day on its next run: a card that
-- was shown and not acted on becomes 'ignored', a card that was never
-- shown becomes 'not_seen'. Those two are genuinely different facts and
-- collapsing them would make the adaptation guardrails punish a member
-- for a day she never opened the app.
create table member_coaching_decisions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,

  rule text not null,
  action_type text not null check (action_type in (
    'reset', 'nutrition', 'movement', 'reflection', 'reconnect'
  )),
  thread_key text not null,

  approach int not null default 0 check (approach between 0 and 2),
  is_follow_on boolean not null default false,

  -- Signal KEYS and numeric METRICS only. Never an answer, never a
  -- sentence, never a concern category. See the hard privacy rule at the
  -- top of this file.
  signal_evidence jsonb not null default '{}'::jsonb,

  member_response text check (member_response in (
    'done', 'help', 'later', 'ignored', 'not_seen'
  )),
  responded_at timestamptz,

  -- The before/after window, as parameters. The reference day belongs to
  -- neither window: it is the pivot, the day the decision was delivered.
  comparison_reference_date date not null,
  comparison_window_days int not null default 14 check (comparison_window_days > 0),
  -- reference_date + window_days. Before this date the after window has
  -- not finished elapsing and any comparison would read as a decline
  -- whether or not anything declined.
  comparison_after_complete_on date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One delivered decision per member per local day, matching
  -- member_daily_priorities' own uniqueness. The card shows one priority
  -- a day, so the ledger records one decision a day.
  unique (member_id, local_date)
);

create index member_coaching_decisions_member_date_idx
  on member_coaching_decisions (member_id, local_date desc);

-- "Which decisions are still waiting on an outcome" — the query the
-- engine runs on every first render of a new day, and the query the Part
-- 3 grading loop will run to find gradeable rows.
create index member_coaching_decisions_unresolved_idx
  on member_coaching_decisions (member_id, local_date)
  where member_response is null;

create index member_coaching_decisions_gradeable_idx
  on member_coaching_decisions (comparison_after_complete_on)
  where member_response is not null;

alter table member_coaching_decisions enable row level security;

create policy member_read_own_coaching_decisions on member_coaching_decisions
  for select using (member_id = auth.uid());

create policy member_insert_own_coaching_decisions on member_coaching_decisions
  for insert with check (member_id = auth.uid());

create policy member_update_own_coaching_decisions on member_coaching_decisions
  for update using (member_id = auth.uid());

create policy coach_read_assigned_coaching_decisions on member_coaching_decisions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_coaching_decisions on member_coaching_decisions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 4) Three additive analytics event types.
-- ---------------------------------------------------------------------
-- Same rule migrations 63, 146 and 147 all followed: a new event source
-- WIDENS this constraint, it never adds a second events table. All three
-- are behavioral only. The payload carries which rule won and which kind
-- of action it was, both fixed slugs from lib/analytics/surfaces.ts, plus
-- which button was tapped. Never the priority's own wording, never the
-- reason line, never the evidence behind it.
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

    -- Adaptive Coaching Direction (this migration), behavioral only.
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed'
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
    'coaching_action_dismissed'
  );
$$;

comment on table member_coaching_threads is
  'Adaptive Coaching Direction: per-thread adaptation state. Counters only,
   never health content. coach_escalated_at is the queryable escalation
   flag; a thread carrying it is never selected again.';

comment on table member_coaching_decisions is
  'Adaptive Coaching Direction: the outcome ledger. One delivered decision
   per member per local day, its evidence keys and metrics, the member
   response, and the parameters of its before/after comparison window.
   Never health content.';

-- Same reason migrations 124, 146, 147 and 148 end this way: these are
-- new tables reached through PostgREST, and a `db push --db-url` run does
-- not reliably make PostgREST reload its cached schema. Without this the
-- tables exist in Postgres but every REST read of them fails with
-- PGRST205 until the instance happens to restart.
notify pgrst, 'reload schema';
