-- Member goals as a first-class, queryable record (Prompt: daily check-in
-- build). Before this, the welcome flow's "What brought you here today?"
-- screen wrote profiles.welcome_flow_goals / welcome_flow_goals_other
-- (migration 86) and nothing ever read them back — a one-way write with
-- no consumer (see BUILD_STATUS.md's "Two coexisting welcome/first-run
-- flows" entry). Separately, the onboarding questionnaire asks a
-- differently-shaped `primary_concern` question cold, at a later moment,
-- storing it in onboarding_answers. This table is what lets the second
-- question stop being asked cold: it's an insert-only history of what a
-- member said mattered, so the onboarding confirmation screen
-- (lib/member-goals/data.ts, app/onboarding/OnboardingForm.tsx) can read
-- it back instead of re-asking.
--
-- Deliberately history, not a mutable row: "a member can change her
-- primary goal later and both the old and new should be retained with
-- their dates, never overwritten" — every change (from the welcome flow,
-- or later from the onboarding "still true?" confirmation) is a new row.
-- The current value is simply the most recent row for that member.
--
-- `goals`/`primary_goal`/`goals_other` are all in lib/welcome/goals.ts's
-- WELCOME_GOALS vocabulary (13 keys) — NOT the narrower 12-value
-- onboarding_questions.primary_concern enum. The onboarding adaptive
-- engine (lib/onboarding/adaptivePlan.ts, untouched by this migration)
-- still only ever receives one of its own 12 concern values, translated
-- from a goal key via lib/welcome/goals.ts's WELCOME_GOAL_TO_PRIMARY_CONCERN
-- map at the moment the confirmation screen answers the real
-- `primary_concern` question. This table owns the member's own words, not
-- the engine's internal vocabulary.
create table member_goal_selections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The full multi-select set at the time of this row (welcome-goal keys,
  -- e.g. ["sleep_better", "reduce_stress"]).
  goals jsonb not null,

  -- One of the keys in `goals` — the one that matters most right now.
  -- Null when never chosen (the pre-follow-up welcome flow this table
  -- backfills from never asked; left unset rather than guessed, see the
  -- backfill below).
  primary_goal text,

  -- Free-text "something else" detail, carried verbatim — never
  -- normalized, rewritten, or discarded. Null unless 'something_else' is
  -- in `goals`.
  goals_other text,

  -- Which screen produced this row: the welcome flow's own goal screen,
  -- or a later change made from the onboarding "still true?" confirmation.
  source text not null default 'welcome_flow'
    check (source in ('welcome_flow', 'onboarding_confirmation')),

  created_at timestamptz not null default now()
);

create index member_goal_selections_member_idx
  on member_goal_selections (member_id, created_at desc);

alter table member_goal_selections enable row level security;

create policy member_read_own_member_goal_selections on member_goal_selections
  for select
  using (member_id = auth.uid());

create policy member_insert_own_member_goal_selections on member_goal_selections
  for insert
  with check (member_id = auth.uid());

-- No update/delete policy, by design — see the header comment. This table
-- is append-only history; a changed answer is always a new row.

comment on table member_goal_selections is
  'Insert-only history of what a member said brought them here / matters
   most, sourced from the welcome flow''s goal screen and, later, the
   onboarding "still true?" confirmation. The most recent row per
   member_id is the current value. See lib/member-goals/data.ts.';

-- Backfill: one row per profile that already completed the welcome flow's
-- goal screen (welcome_flow_goals not null), carrying the existing
-- columns over as-is. primary_goal stays null — the follow-up question
-- did not exist when these members went through the flow, and guessing
-- an answer they never gave would misrepresent them.
insert into member_goal_selections (member_id, goals, primary_goal, goals_other, source, created_at)
select
  id,
  welcome_flow_goals,
  null,
  welcome_flow_goals_other,
  'welcome_flow',
  coalesce(welcome_flow_completed_at, created_at, now())
from profiles
where welcome_flow_goals is not null;
