-- Nutrition Safety Overrides — health-safety architecture for the
-- Nutrition Intelligence Service (apps/consumer-web-app/lib/
-- nutrition-intelligence/). Deliberately its own table, independent of
-- both primal_pattern_assessments (migration 64) and wellness_assessments
-- (migration 62): a completed assessment result must never be able to
-- overwrite or clear medical safety information, and the reverse must
-- also hold (recording a safety flag never touches or invalidates a past
-- assessment result). Keeping them in separate tables makes that
-- separation structural rather than a convention someone could
-- accidentally violate in a later change.
--
-- One row per member (upserted, not append-only) — a member's current
-- known safety profile, not a history of edits. If an audit trail of who
-- changed what is needed later, that's a natural extension of
-- safety_audit_log (migration 28), not a reason to make this table
-- append-only itself.
--
-- Scope: this table only ever gates/flags — no coaching content lives
-- here (that's explicitly deferred; see the Primal Pattern Assessment
-- foundation prompt). last_updated_by/last_updated_by_role record
-- provenance (self-reported vs. coach-entered vs. clinician-confirmed)
-- so a future coaching surface can weight clinician-confirmed flags
-- differently from a member's own self-report without a schema change.
--
-- other_flags is an open-ended jsonb map (e.g. {"celiac": true}) for
-- future safety flags that don't yet warrant their own boolean column —
-- same "config in code, extend without a migration" philosophy already
-- used for questionnaire content, applied here to flag *keys* rather than
-- rows.
--
-- RLS follows the established pattern: a member manages their own flags
-- (self-report), an assigned coach may read and update them (e.g. after
-- confirming a clinician-provided detail), platform_administrator has
-- full access. No delete policy — a flag is corrected by setting it back
-- to false, never removed, so "this member does not have condition X" and
-- "we have never asked" stay distinguishable.

create table member_nutrition_safety_flags (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references auth.users(id) on delete cascade,

  has_diabetes boolean not null default false,
  has_prediabetes boolean not null default false,
  has_gestational_diabetes boolean not null default false,
  has_reactive_hypoglycemia boolean not null default false,
  uses_insulin boolean not null default false,
  has_clinician_nutrition_plan boolean not null default false,
  is_pregnant boolean not null default false,

  -- Extensible slot for future flags (e.g. { "celiac": true, "renal_diet": true })
  -- without a migration. Not DB-validated beyond being a jsonb object,
  -- same hand-authored convention as every other jsonb column in this schema.
  other_flags jsonb not null default '{}'::jsonb,

  last_updated_by uuid references auth.users(id) on delete set null,
  last_updated_by_role text check (last_updated_by_role is null or last_updated_by_role in ('member', 'coach', 'platform_administrator')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_nutrition_safety_flags_member_idx on member_nutrition_safety_flags (member_id);

-- Fast "does this member have any active override" lookup for consumers
-- that only need the boolean gate, not which flag specifically.
create index member_nutrition_safety_flags_active_idx on member_nutrition_safety_flags (member_id)
  where has_diabetes or has_prediabetes or has_gestational_diabetes or has_reactive_hypoglycemia
     or uses_insulin or has_clinician_nutrition_plan or is_pregnant;

alter table member_nutrition_safety_flags enable row level security;

create policy member_read_own_nutrition_safety_flags on member_nutrition_safety_flags
  for select
  using (member_id = auth.uid());

create policy member_insert_own_nutrition_safety_flags on member_nutrition_safety_flags
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_nutrition_safety_flags on member_nutrition_safety_flags
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_nutrition_safety_flags on member_nutrition_safety_flags
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_nutrition_safety_flags on member_nutrition_safety_flags
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_nutrition_safety_flags on member_nutrition_safety_flags
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_nutrition_safety_flags on member_nutrition_safety_flags
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
