-- Reassessment schedule config + Holistic Reset program phases.
--
-- program_phases (migration 71) was seeded empty on purpose — "populating
-- phases and enrolling real members is a product/build decision for a
-- later task." This is that task for the Holistic Reset program's four
-- phases. typical_start_week/typical_end_week are guidance defaults, not
-- an enforcement mechanism — a member's real phase is always whatever
-- program_enrollments.current_phase_key says (coach-updated), matching
-- the "milestone and phase-transition language, not only fixed calendar
-- labels" instruction: these columns exist so status/recommendation logic
-- has a sensible week-based default to recommend a phase transition, not
-- to auto-transition anyone.
alter table program_phases
  add column typical_start_week int,
  add column typical_end_week int;

insert into program_phases (program_key, phase_key, display_name, phase_order, typical_start_week, typical_end_week) values
  ('holistic_reset', 'phase_1_intake_baseline', 'Phase 1 — Intake & Baseline', 1, 0, 4),
  ('holistic_reset', 'phase_2_deeper_diagnostics', 'Phase 2 — Deeper Diagnostics', 2, 4, 8),
  ('holistic_reset', 'phase_3_active_coaching', 'Phase 3 — Active Coaching', 3, 8, 20),
  ('holistic_reset', 'phase_4_reassessment_completion', 'Phase 4 — Reassessment & Completion', 4, 20, 24);

-- Centralized reassessment RULES (config), distinct from
-- reassessment_schedules (migration 72), which holds the per-member
-- INSTANCES a scheduler or coach generates from these rules. Nothing here
-- assigns a schedule to any member — this table only defines "for program
-- X, assessment Y, stage Z happens around this many days after
-- enrollment," so that logic lives in one place instead of being
-- hardcoded into a page component (explicit task requirement). A null
-- program_key means the rule applies outside any program (e.g. a Monthly
-- member's optional retake cadence has no program to anchor to).
create table reassessment_schedule_configs (
  id uuid primary key default gen_random_uuid(),
  assessment_definition_id uuid not null references assessment_definitions(id),

  stage text not null check (stage in ('baseline', 'midpoint', 'final', 'retake')),

  program_key text references programs(key),
  program_phase_key text,

  -- Primary anchor: days after program_enrollments.enrolled_at. Nullable
  -- so a rule can instead be purely coach-triggered (no fixed offset).
  offset_days_from_enrollment int,

  is_coach_overridable boolean not null default true,
  notes text,

  created_at timestamptz not null default now(),

  constraint reassessment_schedule_configs_phase_fk
    foreign key (program_key, program_phase_key)
    references program_phases (program_key, phase_key),

  unique (assessment_definition_id, stage, program_key)
);

alter table reassessment_schedule_configs enable row level security;

create policy authenticated_read_reassessment_schedule_configs on reassessment_schedule_configs
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_reassessment_schedule_configs on reassessment_schedule_configs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Onboarding (the "health history" assessment) already has real
-- baseline/reassessment plumbing (assessment_type column, unlimited
-- member-initiated reassessment — see ASSESSMENT_INVENTORY.md 1.1). It's
-- the one existing assessment whose registry entry already declares
-- meaningful reassessment stages, so it's the only one seeded with a
-- Reset midpoint/final cadence here — inventing the same for CHEK/Four
-- Doctors/Primal Pattern (registry stages: []) would misrepresent
-- capability those systems don't actually have.
insert into reassessment_schedule_configs (assessment_definition_id, stage, program_key, program_phase_key, offset_days_from_enrollment, notes)
select id, 'baseline', 'holistic_reset', 'phase_1_intake_baseline', 0, 'Baseline intake at program enrollment.'
from assessment_definitions where key = 'onboarding-health-history'
union all
select id, 'midpoint', 'holistic_reset', null, 84, 'Week 12 midpoint reassessment.'
from assessment_definitions where key = 'onboarding-health-history'
union all
select id, 'final', 'holistic_reset', 'phase_4_reassessment_completion', 168, 'Week 24 final reassessment.'
from assessment_definitions where key = 'onboarding-health-history';

-- Version comparison compatibility (Version Locking). Self-compatible by
-- default — a version is always comparable to itself, never silently to
-- any other version. A future content/scoring revision that stays
-- comparison-compatible with its predecessor (e.g. a wording-only fix)
-- would explicitly list that predecessor version here; nothing does
-- today because every existing assessment has only ever had version 1.
alter table assessment_definition_versions
  add column comparison_compatible_versions int[] not null default '{}';

update assessment_definition_versions
  set comparison_compatible_versions = array[version]
  where comparison_compatible_versions = '{}';
