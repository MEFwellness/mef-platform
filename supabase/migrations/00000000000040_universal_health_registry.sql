-- Universal Metric & Finding Registry.
--
-- Five subsystems (wellness_insights, intelligence_profile_snapshots/
-- intelligence_coach_alerts, wellness_identity_observations/
-- wellness_profile_dimensions, body_assessment_findings,
-- assessment_ai_analyses/assessment_ai_observations) each independently
-- invented their own "finding" shape, confidence/severity vocabulary, and
-- evidence-ref type. MemberHealthProfile (the one existing unified read
-- composition — see lib/intelligence-engine/profile.ts) has no visibility
-- into body_assessment_findings or assessment_ai_observations at all, so a
-- significant body-assessment finding can never surface as an Intelligence
-- Engine hypothesis, an Intelligence Core identity observation, or a coach
-- alert.
--
-- This migration does not rebuild or replace any of those five subsystems —
-- each keeps its own computation, persistence, and lifecycle exactly as-is.
-- registry_entries is a landing zone / normalized read-model: one common
-- contract ("findings and metrics") that any assessment-level data source —
-- today's body assessment posture findings and coach-published AI
-- observations, tomorrow's sleep/stress/nutrition/wearable/lab/hormone
-- integrations — can write into once, and every consumer of
-- MemberHealthProfile (the MEF Intelligence Engine, Intelligence Core,
-- Conversation Coach) can read from once. A future assessment type needs
-- zero changes to any of the three existing intelligence engines: it only
-- needs an adapter that writes registry_entries rows (see
-- apps/consumer-web-app/lib/registry/adapters/), the same way
-- lib/registry/adapters/bodyAssessment.ts and
-- lib/registry/adapters/coachIntelligence.ts do for this milestone's two
-- real producers.
--
-- `entry_kind` is the one discriminator between a qualitative "finding"
-- (severity-scored, e.g. a posture observation) and a quantitative "metric"
-- (numeric_value + unit, e.g. a future wearable's resting heart rate) — one
-- table, one contract, per the milestone's explicit "findings and metrics
-- using one common contract" requirement, rather than two parallel tables.
--
-- Same conventions as every migration since 15: text CHECK-constraint
-- enums, supersedes_id/superseded_by_id self-referencing audit chain (same
-- posture as wellness_identity_observations, migration 36),
-- source_feature/source_record_id polymorphic pointer (same convention as
-- safety_classifications and assessment_ai_analyses), and a security-
-- definer dedup lookup RPC mirroring find_active_wellness_insight
-- (migration 32) so a member-triggered recalculation session can still see
-- its own coach-only prior row when deciding whether to supersede it.
--
-- RLS deliberately has no blanket member_update_own / member_insert_own
-- policy: unlike wellness_identity_observations, a member never authors or
-- mutates a registry entry directly in this milestone — only the
-- coach-triggered publish orchestration (running under the publishing
-- coach's own session) and future server-side adapters write here.

create table registry_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  entry_kind text not null check (entry_kind in ('finding', 'metric')),

  -- Full taxonomy up front, per the milestone's explicit list — only
  -- 'posture'/'movement'/'breathing' have a real producer this milestone;
  -- the rest exist so a future adapter needs no schema migration, just a
  -- new source_feature value (see the source_feature check below).
  domain text not null check (domain in (
    'posture', 'movement', 'breathing', 'questionnaire', 'sleep', 'stress',
    'nutrition', 'wearable', 'lab', 'hormone'
  )),

  -- Domain-scoped key, e.g. domain='posture', code='forward_head', or a
  -- future domain='wearable', code='resting_heart_rate'. One column, not a
  -- separate finding_type/metric_key pair — the literal "one common
  -- contract" the milestone asks for.
  code text not null,
  label text not null,

  -- entry_kind='finding' only; null for 'metric' rows.
  severity text check (severity is null or severity in
    ('none', 'mild', 'moderate', 'significant', 'unknown')),
  -- entry_kind='metric' only; null for 'finding' rows.
  numeric_value numeric,
  unit text,

  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  narrative text,
  -- {type, id, note?} — same evidence-pointer shape every other engine in
  -- this codebase already uses independently.
  evidence_refs jsonb not null default '[]'::jsonb,

  -- Polymorphic pointer to the producing row, same convention as
  -- assessment_ai_analyses.source_feature. Only two real values wired this
  -- milestone; extend this check constraint (new migration) as future
  -- adapters land, same additive-extension convention ai_events.event_type
  -- already follows.
  source_feature text not null check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation'
  )),
  source_record_id uuid not null,

  status text not null default 'active' check (status in (
    'active', 'resolved', 'superseded', 'dismissed'
  )),
  -- False for anything derived from a coach-internal category (e.g. a
  -- red_flag AI observation) — same "force-set false" mechanism
  -- assessment_ai_observations' own RLS already relies on to keep a red
  -- flag invisible to the member; here it's set explicitly by the adapter
  -- rather than re-derived from RLS at read time.
  member_visible boolean not null default true,
  coach_context text,
  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,

  supersedes_id uuid references registry_entries(id) on delete set null,
  superseded_by_id uuid references registry_entries(id) on delete set null,

  -- When the underlying fact was true (e.g. the assessment's local_date),
  -- distinct from created_at (when this row was written, which can lag
  -- recorded_at when a publish orchestration runs after the fact).
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index registry_entries_member_active_idx on registry_entries (member_id) where status = 'active';
create index registry_entries_member_domain_idx on registry_entries (member_id, domain);
create index registry_entries_code_idx on registry_entries (member_id, domain, code);
create index registry_entries_source_idx on registry_entries (source_feature, source_record_id);
create index registry_entries_supersedes_idx on registry_entries (supersedes_id);

alter table registry_entries enable row level security;

create policy member_read_own_registry_entries on registry_entries
  for select
  using (member_id = auth.uid() and member_visible and status = 'active');

create policy coach_read_assigned_registry_entries on registry_entries
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_registry_entries on registry_entries
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_registry_entries on registry_entries
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_registry_entries on registry_entries
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Security-definer dedup lookup, same fix migration 32 already applied to
-- wellness_insights: the writing session (the publishing coach's own
-- session) must be able to see a member's own prior active row for the
-- same (domain, code) regardless of member_visible, or a coach-only
-- (red-flag-derived) entry would look inactive and get duplicated on every
-- recalculation.
create or replace function find_active_registry_entry(
  p_member uuid,
  p_domain text,
  p_code text
)
returns setof registry_entries
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from registry_entries
  where member_id = p_member
    and domain = p_domain
    and code = p_code
    and status = 'active'
    and (
      p_member = auth.uid()
      or public.is_active_coach_for(auth.uid(), p_member)
      or public.has_active_role(auth.uid(), 'platform_administrator')
    )
  order by created_at desc
  limit 1;
$$;

revoke all on function find_active_registry_entry(uuid, text, text) from public;
grant execute on function find_active_registry_entry(uuid, text, text) to authenticated, service_role;
