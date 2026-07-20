-- Assessment Registry catalog.
--
-- Database-side mirror of the code-side registry at
-- apps/consumer-web-app/lib/assessment-registry/registry.ts. The `key`
-- values and `id` (fixed uuid literals, not generated) below MUST stay in
-- lockstep with that file's `databaseId`/`key` fields — this is
-- deliberately catalog data ("what assessments exist"), not the
-- assessment content itself (questions/scoring stay "config in code, not
-- in the database," same as every other assessment system here).
--
-- This does not touch any existing assessment table, RLS policy, or
-- route. It gives future cross-assessment features (the Questionnaires
-- page, access control, program enrollment) one place to join against
-- instead of hardcoding five different table/route names.
create table assessment_definitions (
  id uuid primary key,
  key text not null unique,

  display_name text not null,
  category text not null,

  -- Purely descriptive/audit — real gating logic stays in application
  -- code reading lib/assessment-registry/registry.ts, exactly like every
  -- other "config in code" convention in this schema. This column exists
  -- so a DB-level report/join can answer "what assessments exist" without
  -- a code deploy, not to duplicate the registry as a second source of
  -- truth for behavior.
  is_active boolean not null default true,
  implementation_status text not null default 'live'
    check (implementation_status in ('live', 'planned', 'coming_soon')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assessment_definitions enable row level security;

create policy authenticated_read_assessment_definitions on assessment_definitions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_assessment_definitions on assessment_definitions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

insert into assessment_definitions (id, key, display_name, category) values
  ('6b86f205-a75b-452f-b926-4c5dffc29baa', 'onboarding-health-history', 'Onboarding Assessment', 'health_history'),
  ('4305b5a8-0c0c-40b5-ab8a-7d0b2a9cb7b9', 'chek-hlc1-nutrition-lifestyle', 'Nutrition & Lifestyle Questionnaire', 'nutrition_lifestyle'),
  ('b67e32f5-ccdd-42b0-b7c2-2eb09431bc72', 'four-doctors', 'Four Doctors Assessment', 'holistic_balance'),
  ('524ed776-dad6-4584-8e0d-075a3ab76727', 'primal-pattern-diet-type', 'Primal Pattern Diet Type', 'nutrition_lifestyle'),
  ('6c071b7d-ca9a-4f52-a7c0-87ae69de726b', 'body-assessment', 'Body Assessment', 'movement');

-- One row per content/scoring version an assessment definition has ever
-- had. Every existing system is at version 1 today (see inventory: the
-- per-system questionnaire_version/assessment_version columns are
-- write-only stamps, never compared against "the current version" — this
-- table is what a future version-locking check would compare against).
create table assessment_definition_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_definition_id uuid not null references assessment_definitions(id),
  version int not null,
  released_at timestamptz not null default now(),
  retired_at timestamptz,
  notes text,

  unique (assessment_definition_id, version)
);

alter table assessment_definition_versions enable row level security;

create policy authenticated_read_assessment_definition_versions on assessment_definition_versions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_assessment_definition_versions on assessment_definition_versions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select id, 1, 'Initial version, matching the only version every existing system has ever had.'
from assessment_definitions;
