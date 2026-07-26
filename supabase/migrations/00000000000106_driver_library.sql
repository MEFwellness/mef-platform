-- Driver Library — seeds MEF-driver-library-v1.md as editable data (not
-- code), and gives every driver a per-member state the daily check-in's
-- adaptive picker and coaching layer can read. Extends the existing
-- correlation engine (migration 105) and adaptive-assessment-engine
-- (lib/adaptive-assessment-engine/) rather than replacing either — see
-- lib/driver-library/, lib/driver-state-engine/, lib/daily-checkin-adaptive/.
--
-- 1. driver_domains / drivers / driver_goal_weights — reference/config
--    data, same "authenticated read, platform_admin write" RLS posture as
--    correlation_candidate_pairs (migration 105) and onboarding_questions
--    (migration 16). Editable with a plain insert/update, no deploy.
-- 2. member_driver_states — one row per (member, driver): unknown /
--    watching / ruled_out / implicated. Written only by the scheduled
--    driver-state-engine job (service-role client), which reads
--    member_correlation_findings (migration 105) — it does not compute
--    its own correlations, only classifies what that engine already
--    found. Same read-only-from-RLS's-perspective posture as
--    member_correlation_findings.
-- 3. driver_probe_questions — the rotating-probe bank the daily check-in's
--    adaptive picker selects from (lib/adaptive-assessment-engine/select.ts,
--    unmodified, reused). Editable data, no deploy.
-- 4. daily_checkin_probe_answers — local follow-up answers (e.g. pain
--    location/aggravating factor) that have no existing daily_checkins
--    column. Member-written directly, unlike the two tables above.
-- 5. member_daily_probe_selections — an audit/recency log of exactly which
--    questions (fixed core + rotating probes) were included in a given
--    day's check-in, so "how long since a driver was last asked" is a
--    real read, not a guess, and so a day's plan is stable across repeat
--    visits rather than re-rolling on every page load.

create table driver_domains (
  key text primary key,
  label text not null,
  sort_order int not null
);

alter table driver_domains enable row level security;

create policy authenticated_read_driver_domains on driver_domains
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_driver_domains on driver_domains
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table drivers (
  id text primary key,
  domain_key text not null references driver_domains(key),
  label text not null,
  what_it_observes text not null,

  -- "Wearable-observable drivers ... should be filled from the device
  -- where connected and only asked where not" (driver library, Part 4).
  wearable_observable boolean not null default false,
  -- "Posture-derived drivers ... come from the camera assessment, not
  -- from daily questions" (driver library, Part 4) — never gets a
  -- driver_probe_questions row.
  posture_derived boolean not null default false,

  sort_order int not null,
  active boolean not null default true
);

alter table drivers enable row level security;

create policy authenticated_read_drivers on drivers
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_drivers on drivers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- "Only High and Medium are listed. Anything unlisted is Low" (driver
-- library, Part 2) — Low is therefore represented by the ABSENCE of a
-- row, not stored, so the seed below only inserts high/medium pairs.
create table driver_goal_weights (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null references drivers(id) on delete cascade,
  -- lib/welcome/goals.ts's WELCOME_GOALS keys — the same vocabulary
  -- correlation_candidate_pairs.goal_keys already uses (migration 105).
  goal_key text not null,
  weight text not null check (weight in ('high', 'medium')),
  unique (driver_id, goal_key)
);

alter table driver_goal_weights enable row level security;

create policy authenticated_read_driver_goal_weights on driver_goal_weights
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_driver_goal_weights on driver_goal_weights
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table member_driver_states (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  driver_id text not null references drivers(id) on delete cascade,
  state text not null default 'unknown' check (state in ('unknown', 'watching', 'ruled_out', 'implicated')),
  evidence_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (member_id, driver_id)
);

create index member_driver_states_member_idx on member_driver_states (member_id);

alter table member_driver_states enable row level security;

create policy member_read_own_member_driver_states on member_driver_states
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_driver_states on member_driver_states
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_member_driver_states on member_driver_states
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table member_driver_states is
  'Written only by the scheduled driver-state-engine job (app/api/cron/driver-state-engine),
   which classifies member_correlation_findings (migration 105) — it computes no
   correlations of its own. See lib/driver-state-engine/.';

create table driver_probe_questions (
  question_key text primary key,
  -- Nullable: a local follow-up (e.g. pain location) has no driver of its
  -- own and is never goal-weighted or picked by the adaptive engine's
  -- scoring — it is shown deterministically by the check-in UI once its
  -- parent question's answer triggers it ("keep this local to the
  -- question, no global branching tree" — driver library task scope).
  driver_id text references drivers(id) on delete cascade,

  prompt text not null,
  response_type text not null check (response_type in ('scale', 'single_select', 'time_pair', 'count', 'boolean')),
  options jsonb not null default '[]'::jsonb,

  -- Which existing daily_checkins column this question's answer already
  -- lands in ('probe_answer' means it has no dedicated column and is
  -- stored in daily_checkin_probe_answers instead).
  storage text not null default 'probe_answer' check (storage in ('daily_checkins_column', 'probe_answer')),
  daily_checkins_column text,

  -- If a connected wearable already supplies this value for the day
  -- (lib/wearables), the question is skipped entirely and its slot goes
  -- to another driver probe instead of shortening the check-in.
  wearable_metric_code text,

  -- lib/adaptive-assessment-engine/types.ts's Rule[] shape, stored as
  -- data so a follow-up's gating condition can be edited without a
  -- deploy. Empty = always eligible once its driver isn't ruled out.
  requires jsonb not null default '[]'::jsonb,
  excludes jsonb not null default '[]'::jsonb,
  -- Static tiebreak, same meaning as AdaptiveQuestion.priority. Local
  -- follow-ups use a high priority so they dominate selection once
  -- eligible; ordinary driver probes leave this at 0 and are scored
  -- entirely by lib/daily-checkin-adaptive's goal/recency/uncertainty formula.
  priority numeric not null default 0,

  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table driver_probe_questions enable row level security;

create policy authenticated_read_driver_probe_questions on driver_probe_questions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_driver_probe_questions on driver_probe_questions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table daily_checkin_probe_answers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  question_key text not null references driver_probe_questions(question_key) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  unique (member_id, local_date, question_key)
);

create index daily_checkin_probe_answers_member_idx on daily_checkin_probe_answers (member_id, local_date);

alter table daily_checkin_probe_answers enable row level security;

create policy member_manage_own_daily_checkin_probe_answers on daily_checkin_probe_answers
  for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_read_assigned_daily_checkin_probe_answers on daily_checkin_probe_answers
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_daily_checkin_probe_answers on daily_checkin_probe_answers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table member_daily_probe_selections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  question_key text not null,
  kind text not null check (kind in ('fixed_core', 'rotating_probe')),
  created_at timestamptz not null default now(),
  unique (member_id, local_date, question_key)
);

create index member_daily_probe_selections_member_date_idx on member_daily_probe_selections (member_id, local_date);
create index member_daily_probe_selections_question_idx on member_daily_probe_selections (member_id, question_key, local_date desc);

alter table member_daily_probe_selections enable row level security;

create policy member_manage_own_member_daily_probe_selections on member_daily_probe_selections
  for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_read_assigned_member_daily_probe_selections on member_daily_probe_selections
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_member_daily_probe_selections on member_daily_probe_selections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- Seed: driver_domains (Part 1's seven section headers)
-- ---------------------------------------------------------------------
insert into driver_domains (key, label, sort_order) values
  ('SLP', 'Sleep and recovery', 1),
  ('FUE', 'Fuel and nutrition', 2),
  ('DIG', 'Digestion', 3),
  ('MOV', 'Movement and load', 4),
  ('MEC', 'Mechanics and posture', 5),
  ('STR', 'Stress and nervous system', 6),
  ('CTX', 'Context', 7);

-- ---------------------------------------------------------------------
-- Seed: drivers (Part 1's full driver list, verbatim)
-- ---------------------------------------------------------------------
insert into drivers (id, domain_key, label, what_it_observes, wearable_observable, posture_derived, sort_order) values
  ('SLP-1', 'SLP', 'Sleep duration', 'Total hours, self-reported or from device', true, false, 1),
  ('SLP-2', 'SLP', 'Sleep continuity', 'Night wake-ups, fragmentation', true, false, 2),
  ('SLP-3', 'SLP', 'Bedtime consistency', 'How much bedtime varies night to night', false, false, 3),
  ('SLP-4', 'SLP', 'Late bedtime', 'Absolute lateness, independent of duration', true, false, 4),
  ('SLP-5', 'SLP', 'Sleep position', 'Side, back, stomach, propped', false, false, 5),
  ('SLP-6', 'SLP', 'Thermal disruption', 'Night sweats, overheating, waking hot', false, false, 6),

  ('FUE-1', 'FUE', 'Meal timing', 'How late the last meal lands', false, false, 1),
  ('FUE-2', 'FUE', 'Meal regularity', 'Skipped meals, long gaps', false, false, 2),
  ('FUE-3', 'FUE', 'Hydration', 'Water intake through the day', false, false, 3),
  ('FUE-4', 'FUE', 'Blood sugar swings', 'Energy crashes, shakiness, cravings', false, false, 4),
  ('FUE-5', 'FUE', 'Caffeine load and timing', 'Amount and how late', false, false, 5),
  ('FUE-6', 'FUE', 'Alcohol', 'Presence and quantity', false, false, 6),
  ('FUE-7', 'FUE', 'Protein adequacy', 'Whether meals carry protein', false, false, 7),

  ('DIG-1', 'DIG', 'Bowel regularity', 'Frequency and consistency', false, false, 1),
  ('DIG-2', 'DIG', 'Digestive discomfort', 'Bloating, cramping, reflux', false, false, 2),

  ('MOV-1', 'MOV', 'Sitting hours', 'Total sedentary time', false, false, 1),
  ('MOV-2', 'MOV', 'Training volume', 'Total load in a window', true, false, 2),
  ('MOV-3', 'MOV', 'Training absence', 'Extended gaps, deconditioning', false, false, 3),
  ('MOV-4', 'MOV', 'Movement variety', 'Same pattern repeated vs varied', false, false, 4),
  ('MOV-5', 'MOV', 'Recovery days', 'Whether rest is actually taken', false, false, 5),
  ('MOV-6', 'MOV', 'Daily step volume', 'Baseline non-exercise movement', true, false, 6),

  ('MEC-1', 'MEC', 'Workstation load', 'Desk setup, screen height, hours in it', false, false, 1),
  ('MEC-2', 'MEC', 'Upper-cross pattern', 'Forward head, rounded shoulders (from posture assessment)', false, true, 2),
  ('MEC-3', 'MEC', 'Lower-cross pattern', 'Pelvic position (from posture assessment)', false, true, 3),
  ('MEC-4', 'MEC', 'Footwear', 'Heel height, support, barefoot time', false, false, 4),
  ('MEC-5', 'MEC', 'One-sided loading', 'Carrying, sleeping, working asymmetrically', false, false, 5),

  ('STR-1', 'STR', 'Perceived stress load', 'Self-reported daily stress', false, false, 1),
  ('STR-2', 'STR', 'Breathing pattern', 'Chest vs diaphragmatic, breath-holding', false, false, 2),
  ('STR-3', 'STR', 'Evening wind-down', 'Screens, work, stimulation before bed', false, false, 3),
  ('STR-4', 'STR', 'Emotional load', 'Life events, conflict, grief, caregiving', false, false, 4),
  ('STR-5', 'STR', 'Downtime scarcity', 'Whether any unstructured time exists', false, false, 5),

  ('CTX-1', 'CTX', 'Cycle phase', 'Where applicable', false, false, 1),
  ('CTX-2', 'CTX', 'Daylight exposure', 'Morning light, time outdoors', false, false, 2),
  ('CTX-3', 'CTX', 'Schedule irregularity', 'Shift work, travel, inconsistent days', false, false, 3),
  ('CTX-4', 'CTX', 'Medication or supplement change', 'Recent starts, stops, dose changes', false, false, 4);

-- ---------------------------------------------------------------------
-- Seed: driver_goal_weights (Part 2's High/Medium table, verbatim).
-- goal_key values are lib/welcome/goals.ts's WELCOME_GOALS keys. The
-- library's three goals that "behave differently" (Part 3) — 'understand
-- my body' (broad sampling, no fixed driver set), 'work directly with a
-- coach' (routes to the coaching funnel, not weighted), 'something else'
-- (free text, needs mapping before it can weight anything) — correctly
-- get zero rows here; lib/driver-library/weighting.ts handles all three
-- goal keys explicitly rather than silently falling through to "low."
-- ---------------------------------------------------------------------
insert into driver_goal_weights (driver_id, goal_key, weight) values
  -- Reduce pain or discomfort
  ('MOV-1', 'reduce_pain', 'high'), ('STR-1', 'reduce_pain', 'high'), ('SLP-2', 'reduce_pain', 'high'), ('MEC-1', 'reduce_pain', 'high'),
  ('SLP-5', 'reduce_pain', 'medium'), ('MOV-2', 'reduce_pain', 'medium'), ('MEC-5', 'reduce_pain', 'medium'), ('MEC-2', 'reduce_pain', 'medium'), ('MEC-3', 'reduce_pain', 'medium'), ('FUE-3', 'reduce_pain', 'medium'), ('STR-2', 'reduce_pain', 'medium'),

  -- Improve posture and movement
  ('MEC-1', 'improve_posture_movement', 'high'), ('MOV-1', 'improve_posture_movement', 'high'), ('MEC-2', 'improve_posture_movement', 'high'), ('MEC-3', 'improve_posture_movement', 'high'),
  ('MOV-4', 'improve_posture_movement', 'medium'), ('MEC-4', 'improve_posture_movement', 'medium'), ('MEC-5', 'improve_posture_movement', 'medium'), ('STR-2', 'improve_posture_movement', 'medium'),

  -- Increase energy
  ('SLP-1', 'increase_energy', 'high'), ('SLP-2', 'increase_energy', 'high'), ('FUE-4', 'increase_energy', 'high'), ('STR-1', 'increase_energy', 'high'),
  ('FUE-1', 'increase_energy', 'medium'), ('FUE-2', 'increase_energy', 'medium'), ('FUE-3', 'increase_energy', 'medium'), ('FUE-5', 'increase_energy', 'medium'), ('CTX-2', 'increase_energy', 'medium'), ('DIG-1', 'increase_energy', 'medium'), ('SLP-3', 'increase_energy', 'medium'),

  -- Sleep better
  ('SLP-4', 'sleep_better', 'high'), ('SLP-3', 'sleep_better', 'high'), ('STR-3', 'sleep_better', 'high'), ('STR-1', 'sleep_better', 'high'),
  ('FUE-5', 'sleep_better', 'medium'), ('FUE-6', 'sleep_better', 'medium'), ('FUE-1', 'sleep_better', 'medium'), ('SLP-6', 'sleep_better', 'medium'), ('CTX-2', 'sleep_better', 'medium'), ('MOV-6', 'sleep_better', 'medium'),

  -- Reduce stress
  ('STR-1', 'reduce_stress', 'high'), ('STR-2', 'reduce_stress', 'high'), ('STR-5', 'reduce_stress', 'high'), ('SLP-2', 'reduce_stress', 'high'),
  ('STR-4', 'reduce_stress', 'medium'), ('STR-3', 'reduce_stress', 'medium'), ('MOV-6', 'reduce_stress', 'medium'), ('CTX-3', 'reduce_stress', 'medium'), ('FUE-5', 'reduce_stress', 'medium'),

  -- Improve digestion
  ('DIG-1', 'improve_digestion', 'high'), ('DIG-2', 'improve_digestion', 'high'), ('FUE-3', 'improve_digestion', 'high'), ('STR-1', 'improve_digestion', 'high'),
  ('FUE-1', 'improve_digestion', 'medium'), ('FUE-2', 'improve_digestion', 'medium'), ('STR-2', 'improve_digestion', 'medium'), ('MOV-6', 'improve_digestion', 'medium'), ('FUE-6', 'improve_digestion', 'medium'),

  -- Lose weight or improve body composition
  ('FUE-2', 'body_composition', 'high'), ('FUE-7', 'body_composition', 'high'), ('SLP-1', 'body_composition', 'high'), ('MOV-6', 'body_composition', 'high'),
  ('FUE-1', 'body_composition', 'medium'), ('FUE-4', 'body_composition', 'medium'), ('STR-1', 'body_composition', 'medium'), ('MOV-2', 'body_composition', 'medium'), ('FUE-6', 'body_composition', 'medium'),

  -- Build strength and fitness
  ('MOV-2', 'strength_fitness', 'high'), ('MOV-5', 'strength_fitness', 'high'), ('SLP-1', 'strength_fitness', 'high'), ('FUE-7', 'strength_fitness', 'high'),
  ('MOV-3', 'strength_fitness', 'medium'), ('SLP-2', 'strength_fitness', 'medium'), ('FUE-3', 'strength_fitness', 'medium'), ('STR-1', 'strength_fitness', 'medium'),

  -- Improve sports or golf performance
  ('MOV-2', 'sports_golf_performance', 'high'), ('MOV-5', 'sports_golf_performance', 'high'), ('MEC-5', 'sports_golf_performance', 'high'), ('SLP-1', 'sports_golf_performance', 'high'),
  ('MOV-4', 'sports_golf_performance', 'medium'), ('MEC-2', 'sports_golf_performance', 'medium'), ('MEC-3', 'sports_golf_performance', 'medium'), ('FUE-7', 'sports_golf_performance', 'medium'), ('STR-1', 'sports_golf_performance', 'medium'),

  -- Create healthier daily habits
  ('SLP-3', 'healthier_habits', 'high'), ('FUE-2', 'healthier_habits', 'high'), ('MOV-6', 'healthier_habits', 'high'), ('CTX-3', 'healthier_habits', 'high'),
  ('FUE-3', 'healthier_habits', 'medium'), ('STR-5', 'healthier_habits', 'medium'), ('CTX-2', 'healthier_habits', 'medium'), ('STR-3', 'healthier_habits', 'medium');

-- ---------------------------------------------------------------------
-- Seed: driver_probe_questions — only the drivers with a real,
-- already-collected daily_checkins column (same "don't fake a source
-- that doesn't exist yet" discipline migration 105 used for
-- correlation_candidate_pairs). Most of the driver library has no
-- daily-loggable source anywhere in the schema yet; those drivers are
-- seeded above (so they exist, are editable, and are ready for a probe
-- the moment a real column/question exists) but get no bank row here.
--
-- Bedtime/wake time (SLP-4, SLP-3) are deliberately EXCLUDED from this
-- bank even though the column exists: lib/wellness/morningReadiness.ts's
-- isMorningReadinessEligible() hard-requires actual_bedtime/
-- actual_wake_time for a Morning Readiness Score (and therefore the
-- Daily Wellness Score, which reuses that same gate) to exist for the
-- day at all — rotating them out would silently zero out an existing
-- score on any day they weren't picked, the same "silently degrades a
-- working feature" failure mode the correlation-engine's own protected
-- inputs are guarded against. So bedtime/wake time stay always-asked,
-- same as the six fixed-core metrics, just not literally one of them.
--
-- These five fields already exist in the check-in UI today (asked
-- unconditionally); this migration's only effect on them is making them
-- selectable by the adaptive picker instead of always-shown — see
-- lib/daily-checkin-adaptive/. Confirmed safe: none of the three
-- Morning-Readiness-adjacent ones (night waking, night sweats, bowel
-- status) are part of that eligibility gate — that file's own comment
-- states they "only affect the score's weighting once present, never its
-- eligibility" — and digestion/movement have no eligibility gate of
-- their own (isDailyWellnessScoreEligible reuses the same Morning
-- Readiness gate verbatim, per lib/wellness/dailyWellnessScore.ts).
-- ---------------------------------------------------------------------
insert into driver_probe_questions (question_key, driver_id, prompt, response_type, options, storage, daily_checkins_column, wearable_metric_code, requires, excludes, priority) values
  ('checkin_probe.night_waking_count', 'SLP-2', 'How many times did you wake up during the night?', 'count', '[0,1,2,3,4,5]'::jsonb, 'daily_checkins_column', 'night_waking_count', null, '[]'::jsonb, '[]'::jsonb, 0),
  ('checkin_probe.night_sweats', 'SLP-6', 'Any night sweats?', 'boolean', '[]'::jsonb, 'daily_checkins_column', 'night_sweats', null, '[]'::jsonb, '[]'::jsonb, 0),
  ('checkin_probe.bowel_movement_status', 'DIG-1', 'Bowel movement status', 'single_select', '["normal","constipated","loose","none"]'::jsonb, 'daily_checkins_column', 'bowel_movement_status', null, '[]'::jsonb, '[]'::jsonb, 0),
  ('checkin_probe.digestion_rating', 'DIG-2', 'How was your digestion today?', 'scale', '[1,2,3,4,5]'::jsonb, 'daily_checkins_column', 'digestion_rating', null, '[]'::jsonb, '[]'::jsonb, 0),
  ('checkin_probe.movement_today', 'MOV-2', 'How much did you move your body today overall?', 'single_select', '["none","light","moderate","full_session"]'::jsonb, 'daily_checkins_column', 'movement_today', null, '[]'::jsonb, '[]'::jsonb, 0);

-- ---------------------------------------------------------------------
-- Local follow-ups to the fixed-core pain question (requirement 5):
-- "pain reported as significant leads to where, then to what makes it
-- worse." driver_id is null on purpose — these are not goal-weighted or
-- picked by the adaptive engine's random selection; they exist here only
-- so daily_checkin_probe_answers has a valid question_key to reference.
-- lib/daily-checkin-adaptive/probeBank.ts explicitly excludes any row
-- with a null driver_id from the rotating-probe bank; the check-in UI
-- shows them deterministically once pain_discomfort_level clears
-- PAIN_FOLLOWUP_THRESHOLD, then once the first is answered — "keep this
-- local to the question, no global branching tree."
-- ---------------------------------------------------------------------
insert into driver_probe_questions (question_key, driver_id, prompt, response_type, options, storage, daily_checkins_column, wearable_metric_code, requires, excludes, priority) values
  ('checkin_probe.pain_location', null, 'Where is it, mainly?', 'single_select', '["neck","shoulders","upper_back","lower_back","hips","knees","feet_or_ankles","hands_or_wrists","widespread","other"]'::jsonb, 'probe_answer', null, null, '[]'::jsonb, '[]'::jsonb, 0),
  ('checkin_probe.pain_aggravating_factor', null, 'What tends to make it worse?', 'single_select', '["sitting","standing","movement","bending_or_lifting","first_thing_in_the_morning","by_end_of_day","not_sure"]'::jsonb, 'probe_answer', null, null, '[]'::jsonb, '[]'::jsonb, 0);
