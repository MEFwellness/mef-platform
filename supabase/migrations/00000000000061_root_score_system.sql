-- Root Score System — the platform's proprietary wellness scoring engine.
--
-- root_score_snapshots holds one row per member per local_date: a single
-- calculation event carrying the Root Score (slow-changing, 30-day
-- rolling composite), Momentum Score (fast-changing, 7-vs-prior-7-day
-- direction), and Resilience Score (recovery-after-setback pattern,
-- null/"building_baseline" until enough longitudinal history exists —
-- never fabricated). unique(member_id, local_date) means a same-day
-- recalculation (e.g. triggered again after an evening check-in) upserts
-- the existing row instead of inserting a duplicate — the history table
-- IS the chart data, one real point per day, never interpolated.
--
-- Deliberately additive and isolated from every other system in this
-- migration set: no existing table, column, or constraint is altered.
-- Domain weights and thresholds live in code
-- (apps/consumer-web-app/lib/scoring/config.ts), not this schema — same
-- "config in code, not in the database" choice already made for
-- lib/wellness/wellness-index.ts's WELLNESS_WEIGHTS, so scoring formulas
-- can be adjusted without a migration.
--
-- RLS follows the exact established pattern (migration 15 helpers;
-- migrations 31, 37, 58 precedent): member_read_own / member_insert_own /
-- member_update_own (calculation runs on whichever session triggered it —
-- the member's own page load, or their own check-in submission — so the
-- member's session itself performs the insert/update, same trust
-- boundary wellness_insights already established for its own
-- engine-driven rows), coach_read_assigned via is_active_coach_for (a
-- coach's client view may read Root Score later without requiring a
-- second migration), platform_admin_all.

create table root_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  local_date date not null,
  timezone text not null,
  calculated_at timestamptz not null default now(),
  score_version int not null default 1,

  root_score int check (root_score is null or (root_score >= 0 and root_score <= 100)),
  root_confidence numeric not null default 0 check (root_confidence >= 0 and root_confidence <= 1),
  root_confidence_level text not null default 'building' check (
    root_confidence_level in ('building', 'low', 'moderate', 'high')
  ),
  root_previous_score int check (root_previous_score is null or (root_previous_score >= 0 and root_previous_score <= 100)),
  root_score_change int,

  momentum_score int check (momentum_score is null or (momentum_score >= 0 and momentum_score <= 100)),
  momentum_state text not null default 'insufficient_data' check (
    momentum_state in ('improving', 'declining', 'stable', 'insufficient_data')
  ),
  momentum_confidence_level text not null default 'building' check (
    momentum_confidence_level in ('building', 'low', 'moderate', 'high')
  ),

  resilience_score int check (resilience_score is null or (resilience_score >= 0 and resilience_score <= 100)),
  resilience_state text not null default 'building_baseline' check (
    resilience_state in ('building_baseline', 'stable', 'recovering', 'strained')
  ),
  resilience_confidence_level text not null default 'building' check (
    resilience_confidence_level in ('building', 'low', 'moderate', 'high')
  ),

  -- Array<DomainScore> — see packages/shared-types-contracts/src/scoring.types.ts.
  -- Every entry traces back to a real query result; a domain with zero
  -- qualifying inputs is included with score: null, never omitted (so the
  -- UI can always explain *why* a domain is absent).
  domain_scores jsonb not null default '[]'::jsonb,
  -- Array<ScoreFactor> — deterministic, template-based, grounded only in
  -- domains that actually have data this calculation.
  positive_factors jsonb not null default '[]'::jsonb,
  limiting_factors jsonb not null default '[]'::jsonb,
  -- Array<InputCoverageEntry> — which domains had legitimate data this
  -- calculation and how much, independent of the scores themselves.
  input_coverage jsonb not null default '[]'::jsonb,

  strongest_domain text check (strongest_domain is null or strongest_domain in (
    'recovery', 'stress', 'nutrition', 'movement', 'consistency'
  )),
  primary_opportunity_domain text check (primary_opportunity_domain is null or primary_opportunity_domain in (
    'recovery', 'stress', 'nutrition', 'movement', 'consistency'
  )),
  explanation_summary text not null default '',
  next_action text,

  -- Debug/audit only: weights applied, raw pre-smoothing composite,
  -- window boundaries used. Never rendered directly — a future formula
  -- upgrade can add fields here without a schema change.
  calculation_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, local_date)
);

create index root_score_snapshots_member_date_idx
  on root_score_snapshots (member_id, local_date desc);

alter table root_score_snapshots enable row level security;

create policy member_read_own_root_scores on root_score_snapshots
  for select
  using (member_id = auth.uid());

create policy member_insert_own_root_scores on root_score_snapshots
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_root_scores on root_score_snapshots
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_root_scores on root_score_snapshots
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_root_scores on root_score_snapshots
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
