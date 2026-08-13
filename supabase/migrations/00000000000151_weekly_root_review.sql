-- Adaptive Coaching Direction, Part 2 — the Weekly Root Review.
--
-- Once a week, on her first app open on or after her own local Monday,
-- Root tells the member what changed, what worked, and what it is
-- adjusting, then sets a focus for the coming week that biases the Part 1
-- daily decision engine. Deterministic, no LLM, no new intelligence.
--
-- Every input the composer reads was already computed and published by a
-- system that shipped before it:
--
--   the outcome ledger   member_coaching_decisions (migration 150)
--   trend directions     member_pattern_states (migration 93/105), which
--                        already carries lib/intelligence/trendEngine.ts's
--                        classification and the three-tier language
--                        module's own tier
--   friction             the analytics service layer's RPCs (migration 149)
--   commitment           member_reset_plan_daily_logs (migration 142)
--   consistency          daily_checkins, unchanged
--
-- HARD PRIVACY RULE, stricter here than in migration 150 and stated once:
-- NEITHER TABLE STORES ANY MEMBER-FACING SENTENCE. Not a composed
-- observation, not a finding's wording, not an answer, not a food name, not
-- a concern category. A review row stores a PLAN: which observation kinds
-- were earned, at which language tier, with which signal keys and which
-- numeric metrics. lib/weekly-review/copy.ts renders the words from that
-- plan at read time, deterministically, so the member sees the same review
-- all week without a single sentence ever being persisted.
--
-- That is a deliberate departure from migration 147's member_daily_priorities,
-- which does store its rendered title. It is affordable here because every
-- sentence in this feature is templated from a closed vocabulary plus
-- numbers, so nothing has to be frozen to stay stable.

-- ---------------------------------------------------------------------
-- 1) member_weekly_reviews — one review per member per local week.
-- ---------------------------------------------------------------------
-- week_start is the member's OWN local Monday, computed from her stored
-- profile timezone by lib/weekly-review/week.ts (which reuses the
-- Monday-start helper lib/food-lens/weeklyReportData.ts already
-- established). The unique constraint on (member_id, week_start) is the
-- once-per-week rule: there is no second delivery table and no schedule.
--
-- The three timestamps are three genuinely different facts, and each one
-- is claimed atomically by a conditional UPDATE so its analytics event
-- fires exactly once per week:
--
--   delivered_at     Root produced the review and it entered the pop-up
--                    chain. Set on insert.
--   viewed_at        it actually reached her screen, as the pop-up or by
--                    her opening the persistent entry on Home.
--   acknowledged_at  she pressed the single acknowledge button.
--
-- A review that was composed and never seen (she did not open the app
-- again that week) is a real state and must stay distinguishable from one
-- she read and ignored, for the same reason migration 150 keeps 'ignored'
-- and 'not_seen' apart.
create table member_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The member's own local Monday, YYYY-MM-DD.
  week_start date not null,

  -- 'full' when the composer had enough behind it to observe something,
  -- 'thin' when it did not (fewer than 5 Daily Resets logged, or fewer
  -- than 14 days of history). A thin review is a real review with an
  -- honest, shorter shape, never a degraded full one and never an
  -- absence. See lib/weekly-review/compose.ts.
  shape text not null check (shape in ('full', 'thin')),

  -- THE PLAN, not the prose. An array of observation descriptors, each
  -- one { kind, tier, signalKey, metrics }, plus the same for what
  -- worked, plus the question keys. Signal KEYS and numeric METRICS only,
  -- enforced at every call site by lib/weekly-review/plan.ts's closed
  -- allowlist, which is the same drop-do-not-throw sanitizer discipline
  -- lib/coaching-direction/evidence.ts and lib/analytics/track.ts use.
  plan jsonb not null default '{}'::jsonb,

  -- Her answers, when the review asked anything at all. A map of
  -- question key to OPTION SLUG, both from closed sets declared in
  -- lib/weekly-review/questions.ts. Never free text, never a health
  -- answer: these are behavioral context about how coaching is landing,
  -- which is the only thing this feature is allowed to ask about.
  answers jsonb not null default '{}'::jsonb,

  delivered_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, week_start)
);

create index member_weekly_reviews_member_week_idx
  on member_weekly_reviews (member_id, week_start desc);

alter table member_weekly_reviews enable row level security;

create policy member_read_own_weekly_reviews on member_weekly_reviews
  for select using (member_id = auth.uid());

create policy member_insert_own_weekly_reviews on member_weekly_reviews
  for insert with check (member_id = auth.uid());

create policy member_update_own_weekly_reviews on member_weekly_reviews
  for update using (member_id = auth.uid());

-- The test-account-only force-redelivery path (app/api/test-only/) clears
-- the current week's row so a verification pass can see the review arrive
-- more than once. Every other table in this build set is append-only for
-- a member; this one is not, and the policy is deliberately narrowed to
-- test accounts in the database as well as in the route handler, so the
-- restriction survives someone forgetting it at a call site.
create policy test_member_delete_own_weekly_reviews on member_weekly_reviews
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_weekly_reviews on member_weekly_reviews
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_weekly_reviews on member_weekly_reviews
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 2) member_week_focus — the one thing Root is biasing toward this week.
-- ---------------------------------------------------------------------
-- Written by the review composer, read by lib/priority/select.ts as a
-- TIE-BREAKER and nothing more.
--
-- What "tie-breaker" means precisely, because it is easy to over-read:
-- the Part 1 ladder admits at most one candidate per RUNG, so two
-- candidates are only ever equal in the hierarchy when they sit on the
-- same rung. That happens when a rung's own source produced several
-- equally-ranked items (several drivers in Case View's likelyInvolved
-- bucket, several tier 3 findings tied on confidence and observation
-- count). Among those, and only among those, the focus-aligned one is
-- preferred. The order of the rungs themselves is untouched, and
-- 'safety', 're_entry' and 'reset_plan_commitment' are exempt from the
-- bias entirely, structurally, in lib/weekly-review/focus.ts.
--
-- Exactly one of focus_action_type / focus_thread_key may be the primary
-- alignment, but both may be present: an action type biases toward a KIND
-- of thing, a thread key biases toward one specific continuing
-- conversation, and a focus that names both is more specific, not
-- contradictory.
create table member_week_focus (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  week_start date not null,

  -- Same closed vocabulary as member_coaching_decisions.action_type, so
  -- the ledger and the focus can never disagree about what kind of thing
  -- an action is. 'movement' is accepted by the schema and is structurally
  -- unemittable, exactly as it is there.
  focus_action_type text check (focus_action_type in (
    'reset', 'nutrition', 'movement', 'reflection', 'reconnect'
  )),

  -- '<rule>::<item>', migration 150's own thread key shape, when the
  -- focus is about one specific continuing thread rather than a kind of
  -- action.
  focus_thread_key text,

  -- WHY this focus, as signal KEYS and numeric METRICS only. Same closed
  -- allowlist as the review plan. Never a sentence, never an answer.
  source_evidence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One focus per member per week. The review writes it once, alongside
  -- the review row itself.
  unique (member_id, week_start),

  -- A focus that names nothing would be a row the daily engine reads and
  -- can never act on, which is worse than no row: it would look like a
  -- decision was made. At least one of the two must be present.
  constraint member_week_focus_names_something
    check (focus_action_type is not null or focus_thread_key is not null)
);

create index member_week_focus_member_week_idx
  on member_week_focus (member_id, week_start desc);

alter table member_week_focus enable row level security;

create policy member_read_own_week_focus on member_week_focus
  for select using (member_id = auth.uid());

create policy member_insert_own_week_focus on member_week_focus
  for insert with check (member_id = auth.uid());

create policy member_update_own_week_focus on member_week_focus
  for update using (member_id = auth.uid());

-- Same narrowly-scoped test-account delete as the review table above, for
-- the same reason: force-redelivery has to be able to clear the pair.
create policy test_member_delete_own_week_focus on member_week_focus
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_week_focus on member_week_focus
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_week_focus on member_week_focus
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3) Four additive analytics event types.
-- ---------------------------------------------------------------------
-- Same rule migrations 63, 146, 147 and 150 all followed: a new event
-- source WIDENS this constraint, it never adds a second events table. All
-- four are behavioral only. weekly_review_question_answered carries the
-- QUESTION KEY and never the answer, which is the whole point of it being
-- a separate event from the answer being stored on the review row.
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

    -- Adaptive Coaching Direction Part 2, the Weekly Root Review (this
    -- migration), behavioral only.
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered'
  ));

-- The one place "which types are analytics" is defined in the database.
-- Recreated with the four new types so the product_analytics_events view
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
    'weekly_review_question_answered'
  );
$$;

comment on table member_weekly_reviews is
  'Weekly Root Review: one review per member per local week. Stores the
   composed PLAN (observation kinds, language tiers, signal keys, numeric
   metrics) and never any member-facing sentence, answer, or health
   content. lib/weekly-review/copy.ts renders the words from the plan.';

comment on table member_week_focus is
  'Weekly Root Review: the coming week''s focus, read by lib/priority/select.ts
   as a within-rung tie-breaker only. Signal keys and metrics only.
   Never affects the safety, re-entry or commitment rules.';

-- Same reason migrations 124, 146, 147, 148 and 150 end this way: these
-- are new tables reached through PostgREST, and a `db push --db-url` run
-- does not reliably make PostgREST reload its cached schema. Without this
-- the tables exist in Postgres but every REST read of them fails with
-- PGRST205 until the instance happens to restart.
notify pgrst, 'reload schema';
