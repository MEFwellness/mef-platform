-- Unified Adaptive Assessment Foundation.
--
-- Additive only: three new, currently-empty tables. Nothing existing is
-- altered, no content is migrated. Every assessment continues to run on
-- its current tables exactly as before (onboarding_questions, the shared
-- wellness_assessments/wellness_assessment_answers engine used by Four
-- Doctors/CHEK HLC1/Short-HAQ, and Primal Pattern's own tables).
--
-- This is a reusable question/section/assessment schema that future
-- assessments (Four Doctors v2, HAQ, WBSA, Breathing, Nutrition, Primal
-- Pattern, etc.) can opt into instead of inventing a new bespoke table set
-- each time. `unified_assessment_definitions` is deliberately a different
-- table from `assessment_definitions` (migration 70): that table is a thin
-- catalog row ("what assessments exist"), explicitly not the content
-- itself per its own header comment. `catalog_definition_id` below is the
-- optional bridge between the two once/if a future assessment registers
-- itself in both places.
create table unified_assessment_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  catalog_definition_id uuid references assessment_definitions(id),

  title text not null,
  description text,
  assessment_type text,
  estimated_completion_time_minutes int,

  adaptive_enabled boolean not null default false,
  reassessment_enabled boolean not null default false,
  safety_enabled boolean not null default false,
  scoring_profile jsonb,

  version int not null default 1,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table unified_assessment_definitions enable row level security;

create policy authenticated_read_unified_assessment_definitions on unified_assessment_definitions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_unified_assessment_definitions on unified_assessment_definitions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Sections are optional structure within a definition — a definition with
-- no sections is valid (flat question list), matching how Onboarding has
-- no section concept today.
create table unified_assessment_sections (
  id uuid primary key default gen_random_uuid(),
  assessment_definition_id uuid not null references unified_assessment_definitions(id) on delete cascade,

  title text not null,
  subtitle text,
  display_order int not null default 0,

  adaptive_rules jsonb,
  completion_rules jsonb,
  optional boolean not null default false,
  required boolean not null default true,
  safety_category text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table unified_assessment_sections enable row level security;

create policy authenticated_read_unified_assessment_sections on unified_assessment_sections
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_unified_assessment_sections on unified_assessment_sections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- The unified question library. `weight` isn't part of the content brief
-- but is required to satisfy lib/adaptive-assessment-engine's
-- AdaptiveQuestion contract (base selection score) so rows here plug
-- straight into the existing, unmodified selectNext/selectBatch — see that
-- package for `requires`/`excludes`/`boosts`/`priority` semantics.
-- `follow_up_rules`/`skip_rules`/`completion_rules` are reserved,
-- typed-but-uninterpreted metadata for a future section/flow navigator;
-- nothing reads them yet.
create table unified_assessment_questions (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  assessment_definition_id uuid not null references unified_assessment_definitions(id) on delete cascade,
  section_id uuid references unified_assessment_sections(id) on delete set null,

  version int not null default 1,
  active boolean not null default true,
  display_order int not null default 0,

  prompt text not null,
  description text,
  answer_type text not null,
  answer_options jsonb,
  validation jsonb,

  tags text[],
  body_system text,
  body_region text,
  concern_category text,
  educational_tags text[],
  coach_tags text[],
  related_systems text[],
  severity_tags text[],

  weight numeric not null default 1,
  requires jsonb,
  excludes jsonb,
  boosts jsonb,
  priority numeric,
  follow_up_rules jsonb,
  skip_rules jsonb,
  completion_rules jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (question_key, version)
);

create index unified_assessment_questions_definition_idx on unified_assessment_questions (assessment_definition_id);
create index unified_assessment_questions_section_idx on unified_assessment_questions (section_id);

alter table unified_assessment_questions enable row level security;

create policy authenticated_read_unified_assessment_questions on unified_assessment_questions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_unified_assessment_questions on unified_assessment_questions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
