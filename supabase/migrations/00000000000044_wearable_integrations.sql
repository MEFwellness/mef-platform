-- Wearable Integration Layer.
--
-- Two tables, same split as the AI Body Assessment Framework's own
-- provider-backed source (body_assessments + a provider abstraction under
-- lib/body-assessment/providers/): wearable_connections is the per-member,
-- per-provider connection/sync bookkeeping row; wearable_daily_metrics is
-- the unified daily health model landing table a real Oura/Apple
-- Health/Google Fit provider implementation (lib/wearables/providers/)
-- writes into once it's configured. Neither table is a second Universal
-- Registry — lib/registry/adapters/wearables.ts reshapes today's
-- wearable_daily_metrics rows into registry_entries (domain='wearable'),
-- the same "adapter writes registry_entries once, every existing engine
-- reads it once" pattern bodyAssessment.ts/coachIntelligence.ts already
-- established (migration 40's own docblock names 'wearable' as exactly
-- this future domain).
--
-- wearable_daily_metrics is deliberately the durable per-day history (one
-- row per member/provider/local_date/metric_code, upserted on re-sync) —
-- trend detection (lib/wearables/trends.ts) reads its history directly,
-- the same way lib/feed/streakIntelligence.ts reads daily_checkins history
-- directly rather than through a derived table. registry_entries only
-- ever holds the current normalized snapshot per code (superseded on each
-- new day), consistent with how every other adapter in this codebase uses
-- the registry.
--
-- Same conventions as every migration since 15: text CHECK-constraint
-- enums, RLS with member/coach/admin policies mirroring wearable_connections'
-- own posture, no member update policy on wearable_daily_metrics (a
-- member never hand-edits a synced metric, only a server-side sync path
-- using the member's own session writes here — same trust boundary as
-- health_timeline_events' insert-only posture).

create table wearable_connections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  provider text not null check (provider in ('oura', 'apple_health', 'google_fit')),

  status text not null default 'connected' check (status in (
    'connected', 'disconnected', 'error'
  )),
  -- Mirrors body_assessments.provider_status's exact vocabulary and
  -- meaning: 'not_configured' is the expected state for every provider
  -- this milestone (no real Oura/Apple/Google credentials exist yet) —
  -- callers treat it as "connected, but syncing does nothing real yet,"
  -- never as an error state.
  provider_status text not null default 'not_configured' check (provider_status in (
    'not_configured', 'pending', 'active'
  )),

  external_account_label text,
  last_synced_at timestamptz,
  last_sync_error text,

  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One connection row per member/provider — reconnecting after a
  -- disconnect updates this same row rather than accumulating duplicates.
  unique (member_id, provider)
);

create index wearable_connections_member_idx on wearable_connections (member_id);

alter table wearable_connections enable row level security;

create policy member_read_own_wearable_connections on wearable_connections
  for select
  using (member_id = auth.uid());

create policy member_insert_own_wearable_connections on wearable_connections
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_wearable_connections on wearable_connections
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_wearable_connections on wearable_connections
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_wearable_connections on wearable_connections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table wearable_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references wearable_connections(id) on delete cascade,
  provider text not null check (provider in ('oura', 'apple_health', 'google_fit')),

  local_date text not null,

  -- The Unified Daily Health Model's own four categories from Part 1
  -- (Sleep/Recovery/Movement/Stress) plus Heart, since resting HR/HRV are
  -- listed as their own group in the milestone rather than folded into
  -- Recovery.
  metric_domain text not null check (metric_domain in (
    'sleep', 'recovery', 'movement', 'stress', 'heart'
  )),
  -- Fixed vocabulary covering every metric Part 1 lists — additive only
  -- (new migration) if a future provider surfaces something new, same
  -- convention as registry_entries.domain/code.
  metric_code text not null check (metric_code in (
    'sleep_duration_minutes', 'sleep_score', 'sleep_stage_deep_minutes',
    'sleep_stage_rem_minutes', 'sleep_stage_light_minutes',
    'bedtime_consistency_score', 'resting_heart_rate', 'hrv_ms',
    'readiness_score', 'body_temperature_deviation', 'steps',
    'active_calories', 'exercise_sessions_count', 'sedentary_minutes',
    'stress_score', 'recovery_score'
  )),

  numeric_value numeric not null,
  unit text,

  recorded_at timestamptz not null default now(),
  -- Provider-specific extra fields a future real integration wants to
  -- keep without a schema change — never read by any engine, purely an
  -- audit/debug trail, same role body_assessment_findings' evidence
  -- column plays for its own source data.
  raw_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (member_id, provider, local_date, metric_code)
);

create index wearable_daily_metrics_member_date_idx
  on wearable_daily_metrics (member_id, local_date desc);
create index wearable_daily_metrics_member_code_idx
  on wearable_daily_metrics (member_id, metric_code, local_date desc);

alter table wearable_daily_metrics enable row level security;

create policy member_read_own_wearable_daily_metrics on wearable_daily_metrics
  for select
  using (member_id = auth.uid());

create policy member_insert_own_wearable_daily_metrics on wearable_daily_metrics
  for insert
  with check (member_id = auth.uid());

create policy coach_read_assigned_wearable_daily_metrics on wearable_daily_metrics
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_wearable_daily_metrics on wearable_daily_metrics
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Additive extensions, same convention as every prior migration that has
-- widened an existing CHECK constraint (e.g. migration 43's
-- registry_finding_alert_type): a new source of registry findings/metrics
-- and a new kind of timeline event, no other schema change.
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric'
  ));

alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced'
  ));
