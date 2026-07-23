-- Longitudinal signal state ledger (Prompt 12) — the persisted memory the
-- Root Map / Recommendation Engine / Root Router have never needed before
-- now. Every prior "is this a pattern" read (PatternInsight,
-- LongitudinalTrend, FindingTimelineEntry) is computed fresh from source
-- data on every request — fine when the only question is "what does the
-- data say right now," but Prompt 12 also needs "has this held up over
-- time," "is this info going stale," and "do two signals disagree with
-- each other" — all of which require comparing today's computed read
-- against what was true last time, which a pure recompute-on-read model
-- has nowhere to keep. This table is that memory, and only that: every
-- column here is the *output* of an already-existing classifier
-- (lib/intelligence/trendEngine.ts, lib/registry/trendStatus.ts,
-- lib/registry/timeline.ts's buildFindingTimeline) — nothing here
-- computes a new confidence number or a new pattern-detection formula.
--
-- One row per (member, signal_key), upserted every time
-- lib/longitudinal-intelligence/service.ts recomputes — same "recompute
-- cheap, persist the resulting state" discipline member_recommendations
-- (migration 91) already established, applied one layer up.
create table member_pattern_states (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Stable per signal, e.g. "registry::stress::elevated_stress" (a
  -- registry_entries domain+code chain) or "checkin_metric::sleep" (a
  -- classifyMetricTrend() area) — never a random id, so recomputation
  -- touches the same row instead of accumulating duplicates.
  signal_key text not null,
  signal_kind text not null check (signal_kind in (
    'registry_finding', 'checkin_metric', 'experiment_outcome', 'recommendation_outcome'
  )),
  signal_label text not null,

  state text not null check (state in (
    'one_time_observation', 'repeated_signal', 'emerging_pattern', 'established_pattern',
    'improving', 'worsening', 'stable', 'resolved',
    'stale', 'conflicting', 'insufficient_data'
  )),
  -- 1/2/3 three-tier coaching language (Part 2); null for states
  -- ('stale', 'conflicting', 'insufficient_data') that always get fixed,
  -- hedged phrasing regardless of tier math.
  tier smallint check (tier is null or tier between 1 and 3),

  occurrence_count int not null default 0,
  confidence numeric not null default 0,

  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  last_computed_at timestamptz not null default now(),

  -- Small, structured "why" (e.g. which registry codes / metric area / the
  -- opposing trend in a 'conflicting' state) — coach-facing only, never
  -- rendered to a member verbatim (same posture member_recommendations.
  -- supporting_findings already takes).
  evidence_summary jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, signal_key)
);

create index member_pattern_states_member_idx on member_pattern_states (member_id, last_observed_at desc);

alter table member_pattern_states enable row level security;

create policy member_read_own_member_pattern_states on member_pattern_states
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_pattern_states on member_pattern_states
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Recompute can run from either the member's own page load or a coach's
-- client-panel view — same dual-writer trust boundary
-- member_recommendations already uses for exactly the same reason.
create policy member_insert_own_member_pattern_states on member_pattern_states
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_member_pattern_states on member_pattern_states
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_member_pattern_states on member_pattern_states
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_update_assigned_member_pattern_states on member_pattern_states
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_member_pattern_states on member_pattern_states
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
