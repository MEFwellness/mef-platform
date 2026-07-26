-- Real cross-variable correlation engine (replaces
-- lib/intelligence-engine/crossAssessmentCorrelations.ts, which despite
-- its name performed no statistical calculation — it checked whether both
-- halves of five hand-written pairings were present and printed a canned
-- sentence). This migration adds the two tables the new engine
-- (lib/correlation-engine/) needs and widens member_pattern_states to
-- accept its output as a fifth signal_kind, per the standing instruction
-- to feed the existing three-tier system rather than build a parallel one.
--
-- 1. correlation_candidate_pairs — "candidate pairs come from the driver
--    library and the member's goals ... stored as data, not code, so it
--    can be edited without a deploy." Reference/config data, same RLS
--    posture as onboarding_questions (migration 16): any authenticated
--    user can read it, only a platform administrator (or a migration) can
--    change it.
-- 2. member_correlation_findings — one row per (member, pair): the pair,
--    lag, direction, strength, observation count, span, split-window
--    agreement, resulting tier, and computed timestamp. Written only by
--    the scheduled recompute job (service-role client, bypasses RLS) —
--    same read-only-from-RLS's-perspective posture as reassessment_schedules
--    (migration 72), which is also system/cron-written.
--
-- Neither table duplicates member_pattern_states: member_correlation_findings
-- is this engine's own evidence record (what did we compute this run),
-- member_pattern_states (existing table, migration 93) is the promoted
-- three-tier signal the rest of the coaching layer already reads —
-- exactly the same split registry findings and check-in metrics already
-- use between their own source data and their shared state ledger.
create table correlation_candidate_pairs (
  pair_key text primary key,

  -- Traceability back to MEF-driver-library-v1.md's driver ID (e.g.
  -- 'SLP-2') — not used by the computation itself, just keeps the seeded
  -- data auditable against the source document.
  driver_id text not null,

  -- lib/correlation-engine/variables.ts variable-catalog keys, e.g.
  -- 'checkin.pain' / 'checkin.stress'. The outcome is the variable a
  -- member cares about (what a goal points at); the driver is the
  -- candidate root-cause variable being tested against it.
  outcome_variable text not null,
  driver_variable text not null,

  label text not null,
  weight text not null check (weight in ('high', 'medium')),

  -- Welcome-flow goal keys (lib/welcome/goals.ts's WELCOME_GOALS
  -- vocabulary) this pair is relevant to — how "the member's goals"
  -- narrows which pairs get tested for her (lib/correlation-engine/service.ts).
  -- A member with no recorded goals gets every active pair tested rather
  -- than none, so nobody is silently excluded.
  goal_keys jsonb not null default '[]'::jsonb,

  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table correlation_candidate_pairs enable row level security;

create policy authenticated_read_correlation_candidate_pairs on correlation_candidate_pairs
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_correlation_candidate_pairs on correlation_candidate_pairs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table member_correlation_findings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  pair_key text not null references correlation_candidate_pairs(pair_key) on delete cascade,

  -- Which of the two tested lags (same-day, next-day) was reported —
  -- "test at a lag ... compute same-day and next-day, and report which
  -- lag is stronger. Do not test more than these two." Null only when
  -- neither lag ever reached the base evidence gate (state = 'insufficient_data').
  lag text check (lag in ('same_day', 'next_day')),
  direction text check (direction in ('positive', 'negative')),
  rho numeric,

  observation_count int not null default 0,
  span_days int,

  -- Whether the same relationship (direction + effect-size floor) held
  -- independently in both halves of the member's history — "only promote
  -- a finding if it holds in both."
  split_window_agreement boolean not null default false,

  -- Reuses member_pattern_states' own eleven-value state vocabulary
  -- (migration 93) restricted to the subset a freshly-recomputed
  -- correlation can actually land in — never 'conflicting' (that's a
  -- cross-signal check the classifier itself doesn't do) and never the
  -- direction-only states ('improving'/'worsening'/'stable'), which
  -- describe a single trend's trajectory, not a two-variable relationship.
  state text not null check (state in (
    'insufficient_data', 'one_time_observation', 'repeated_signal',
    'emerging_pattern', 'established_pattern', 'stale'
  )),
  tier smallint check (tier is null or tier between 1 and 3),
  confidence numeric not null default 0,

  computed_at timestamptz not null default now(),

  unique (member_id, pair_key)
);

create index member_correlation_findings_member_idx on member_correlation_findings (member_id);

alter table member_correlation_findings enable row level security;

create policy member_read_own_member_correlation_findings on member_correlation_findings
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_correlation_findings on member_correlation_findings
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_member_correlation_findings on member_correlation_findings
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table member_correlation_findings is
  'This engine''s own evidence record — recomputed on a schedule
   (app/api/cron/correlation-engine), never on page load. Written only by
   the service-role cron client; the RLS policies above are read-only from
   every other caller''s perspective. See lib/correlation-engine/.';

-- Widen member_pattern_states (migration 93) to accept this engine's
-- output as a fifth signal_kind. The write path itself (data.ts's
-- upsertMemberPatternState) is already fully generic over signal_kind —
-- see that file's own comment — so this constraint change is the only
-- schema work needed to let a 'correlation_finding' signal flow through
-- the exact same table, RLS, and copy layer every other signal_kind uses.
alter table member_pattern_states drop constraint member_pattern_states_signal_kind_check;
alter table member_pattern_states add constraint member_pattern_states_signal_kind_check
  check (signal_kind in (
    'registry_finding', 'checkin_metric', 'experiment_outcome', 'recommendation_outcome',
    'correlation_finding'
  ));

-- Seed candidate pairs — the driver-library-derived subset that maps onto
-- variables actually captured today (daily_checkins + wearable_daily_metrics).
-- Many of MEF-driver-library-v1.md's drivers (workstation load, footwear,
-- caffeine/alcohol timing, meal regularity, training volume, posture-
-- assessment findings, etc.) have no daily-loggable column anywhere in the
-- schema yet — those are left out rather than faked; more can be added
-- here (a plain insert, no deploy) once real columns exist for them.
-- Two of these seeds are the direct successors of two of the old file's
-- five hand-written rules (poor_sleep_high_stress -> sleep_quality_stress,
-- digestive_complaints_stress -> digestion_stress) — the other three
-- (neck_pain_forward_head, hip_instability_knee_pain,
-- shoulder_mobility_breathing) paired a daily variable against a posture-
-- assessment registry finding, which isn't a daily-paired time series and
-- so has no equivalent under this methodology; they are retired, not
-- migrated.
insert into correlation_candidate_pairs (pair_key, driver_id, outcome_variable, driver_variable, label, weight, goal_keys) values
  ('pain_stress',               'STR-1', 'checkin.pain',          'checkin.stress',              'Pain and perceived stress load',        'high',   '["reduce_pain"]'),
  ('pain_night_wakings',        'SLP-2', 'checkin.pain',          'checkin.night_wakings',        'Pain and sleep continuity',              'high',   '["reduce_pain"]'),
  ('pain_hydration',            'FUE-3', 'checkin.pain',          'checkin.hydration',            'Pain and hydration',                     'medium', '["reduce_pain"]'),

  ('energy_sleep_duration',     'SLP-1', 'checkin.energy',        'checkin.sleep_duration_score',  'Energy and sleep duration',              'high',   '["increase_energy"]'),
  ('energy_night_wakings',      'SLP-2', 'checkin.energy',        'checkin.night_wakings',        'Energy and sleep continuity',            'high',   '["increase_energy"]'),
  ('energy_stress',             'STR-1', 'checkin.energy',        'checkin.stress',               'Energy and perceived stress load',       'high',   '["increase_energy"]'),
  ('energy_hydration',          'FUE-3', 'checkin.energy',        'checkin.hydration',            'Energy and hydration',                   'medium', '["increase_energy"]'),
  ('energy_bowel',              'DIG-1', 'checkin.energy',        'checkin.bowel_irregularity',   'Energy and bowel regularity',            'medium', '["increase_energy"]'),

  ('sleep_quality_bedtime',     'SLP-4', 'checkin.sleep_quality', 'checkin.bedtime_lateness',      'Sleep quality and how late you go to bed', 'high',  '["sleep_better"]'),
  ('sleep_quality_stress',      'STR-1', 'checkin.sleep_quality', 'checkin.stress',                'Sleep quality and perceived stress load', 'high',  '["sleep_better"]'),
  ('sleep_quality_night_sweats','SLP-6', 'checkin.sleep_quality', 'checkin.night_sweats',          'Sleep quality and night sweats',          'medium', '["sleep_better"]'),
  ('sleep_quality_steps',       'MOV-6', 'checkin.sleep_quality', 'wearable.steps',                'Sleep quality and daily step volume',     'medium', '["sleep_better"]'),

  ('stress_night_wakings',      'SLP-2', 'checkin.stress',        'checkin.night_wakings',         'Stress and sleep continuity',             'high',  '["reduce_stress"]'),
  ('stress_steps',              'MOV-6', 'checkin.stress',        'wearable.steps',                'Stress and daily step volume',            'medium', '["reduce_stress"]'),

  ('digestion_bowel',           'DIG-1', 'checkin.digestion',     'checkin.bowel_irregularity',    'Digestion and bowel regularity',          'high',  '["improve_digestion"]'),
  ('digestion_hydration',       'FUE-3', 'checkin.digestion',     'checkin.hydration',             'Digestion and hydration',                 'high',  '["improve_digestion"]'),
  ('digestion_stress',          'STR-1', 'checkin.digestion',     'checkin.stress',                'Digestion and perceived stress load',     'high',  '["improve_digestion"]'),
  ('digestion_steps',           'MOV-6', 'checkin.digestion',     'wearable.steps',                'Digestion and daily step volume',         'medium', '["improve_digestion"]');
