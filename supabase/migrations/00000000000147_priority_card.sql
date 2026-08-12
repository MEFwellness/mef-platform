-- Priority Card, Part 1 — the priority engine's one piece of new storage,
-- plus three additive analytics event types.
--
-- This build is a DECISION LAYER over systems that already exist (Reset
-- Plan, the driver-state engine, the correlation engine, the assessment
-- registry, Today's Focus, the Root Presence System, and the
-- member_wellness_events pipeline). It computes no new intelligence and
-- stores no new intelligence: every input to the selection hierarchy is
-- read from a table one of those systems already writes. The only thing
-- that genuinely has nowhere to live today is the member's own
-- interaction with the card itself — which priority Root chose for her on
-- a given local day, and whether she marked it done or set it aside. That
-- is what member_daily_priorities below holds, and nothing else.
--
-- No new engine, no new scoring column, no second copy of a driver state
-- or a correlation finding.

-- ---------------------------------------------------------------------
-- 1) member_daily_priorities — one row per member per local day.
-- ---------------------------------------------------------------------
-- Shape follows member_reset_plan_daily_logs (migration 142) and
-- member_return_greetings (migration 143): member_id references
-- auth.users, one real database uniqueness constraint rather than
-- application-level check-then-insert, RLS scoping every policy to
-- member_id = auth.uid(), plus the coach/platform_administrator read
-- paths every other member table in this codebase already grants.
--
-- Why a stored row at all, when the hierarchy is recomputed on every
-- render: three of the card's required behaviors are not derivable from
-- the member's other data.
--   * "Save for later" must stop Root resurfacing the same priority as
--     dominant again THAT DAY. That is a decision about presentation, not
--     about health data, so no existing engine has any business recording
--     it.
--   * "Done" must survive a page reload and show the accomplished state.
--     For a Reset Plan priority the completion ALSO writes the real
--     member_reset_plan_daily_logs row (that is what genuinely feeds
--     tomorrow's selection, since rule 1 asks "not completed today"), but
--     the other three rules have no such log of their own.
--   * The re-entry override must clear "after she engages once". Engaging
--     with the card is precisely that engagement, and this row is where it
--     is recorded.
--
-- rule is the hierarchy rule that won, recorded verbatim so analytics and
-- a coach can both see WHY this was her priority, never re-derived after
-- the fact from data that has since changed.
--
-- priority_key identifies what specifically won within that rule (a
-- driver id, an assessment key, a feed item id, a reset plan id) — a
-- pointer into the system that already owns the content.
--
-- What IS stored, and why exactly this and no more:
--
--   priority_title / priority_help  the words Root actually put on screen
--     today. Stored because the winning rule legitimately changes DURING
--     the day: the moment she marks a Reset Plan commitment done, rule 1
--     stops applying and a fresh run of the hierarchy would pick rule 2 or
--     4 instead. Without the stored text the accomplished card would show
--     her a different priority than the one she just completed, which is
--     simply wrong. Both of these are stable content assembled from fixed
--     libraries (the Reset Plan's agreed action wording, the driver
--     library's own labels, the Coaching Brain's focus text), never
--     derived insight.
--
--   the reason line is deliberately NOT stored. That one IS derived
--     insight, and the platform rule is that no insight renders without a
--     live query behind it. It is regenerated from current data on every
--     render and omitted entirely when no honest reason exists, so a
--     stale row can never put a claim in Root's mouth that the member's
--     data no longer supports.
create table member_daily_priorities (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,

  -- The selection hierarchy, in its own order. 're_entry' is the
  -- override (rule 0), not a priority rank.
  rule text not null check (rule in (
    're_entry',
    'reset_plan_commitment',
    'implicated_driver',
    'incomplete_action',
    'todays_focus'
  )),

  -- Which specific item within that rule. Null is legitimate: a re-entry
  -- opening is not "about" any one item.
  priority_key text,

  priority_title text not null,
  priority_help text not null,
  priority_href text,

  status text not null default 'active' check (status in ('active', 'done', 'saved')),

  done_at timestamptz,
  saved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One priority per member per day. The whole point of the feature is
  -- "one winner, never two cards, never a list" — enforced here, in the
  -- database, not only in the selection code.
  unique (member_id, local_date)
);

create index member_daily_priorities_member_date_idx
  on member_daily_priorities (member_id, local_date desc);

alter table member_daily_priorities enable row level security;

create policy member_read_own_daily_priorities on member_daily_priorities
  for select using (member_id = auth.uid());

create policy member_insert_own_daily_priorities on member_daily_priorities
  for insert with check (member_id = auth.uid());

create policy member_update_own_daily_priorities on member_daily_priorities
  for update using (member_id = auth.uid());

create policy coach_read_assigned_daily_priorities on member_daily_priorities
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_daily_priorities on member_daily_priorities
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 2) Three additive analytics event types.
-- ---------------------------------------------------------------------
-- Same rule migration 146 followed and migration 63's own header set out:
-- a new event source WIDENS this constraint, it never adds a second
-- events table. All three are behavioral only — which rule won, which
-- button was tapped, that a re-entry opening was shown. Never a check-in
-- answer, a driver's evidence, a correlation finding, or any other health
-- content. The payload allowlist in lib/analytics/track.ts and the source
-- scan in tests/product-analytics-payload-safety.test.ts are what keep
-- that true at the call sites.
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

    -- Priority Card (this migration), behavioral only.
    'priority_shown',
    'priority_action',
    're_entry_shown'
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
    're_entry_shown'
  );
$$;

-- Same reason migrations 124 and 146 end this way: this migration adds a
-- new table that @supabase/supabase-js reaches through PostgREST, and a
-- `db push --db-url` run does not reliably make PostgREST reload its
-- cached schema. Without this the table exists in Postgres but every REST
-- read of it fails with PGRST205 until the instance happens to restart.
notify pgrst, 'reload schema';
