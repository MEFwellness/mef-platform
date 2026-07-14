-- Persisted Longitudinal Health Profile.
--
-- MemberHealthProfile (lib/intelligence-engine/types.ts) is, by its own
-- docblock, "intentionally a plain in-memory read composition, not a
-- mutable stored record" — recomputed from scratch on every read, nowhere
-- durable. That's the right model for "never overwrite history," but it
-- means there is no single durable anchor a future timeline UI, progress
-- report, practitioner review surface, or AI coaching context can point to
-- and say "this is the member's current state as of the last time it was
-- computed" without re-running every engine.
--
-- member_health_profiles is that anchor: one row per member, upserted (not
-- append-only) — a durable "current state index," not a duplicate ledger.
-- It intentionally does NOT re-store the full computed output of any
-- engine (that would duplicate computation and risk silently going stale);
-- full historical detail stays queryable from each engine's own tables
-- (wellness_insights, intelligence_profile_snapshots,
-- wellness_identity_observations, registry_entries) plus the append-only
-- health_timeline_events (migration 42). `summary` is a small, TS-typed
-- (HealthProfileSummary) jsonb rollup for fast reads; the pointer/count
-- columns exist so a consumer can tell how fresh this row is and jump
-- straight to the full detail without a second lookup.
--
-- Same atomic-upsert pattern as wellness_profile_dimensions (migration
-- 36): a real INSERT ... ON CONFLICT DO UPDATE inside one security-definer
-- function, because this row is recomputed on every assessment-publish
-- cascade (and potentially concurrently — see that migration's own
-- rationale for why a two-statement PostgREST upsert can't safely express
-- this under RLS with no member SELECT-on-write guarantee).

create table member_health_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references auth.users(id) on delete cascade,

  -- HealthProfileSummary (packages/shared-types-contracts/src/health-profile.types.ts) —
  -- not DB-enforced, same "hand-authored, kept in sync by hand" convention
  -- as every other jsonb column in this codebase (e.g.
  -- intelligence_profile_snapshots.member_summary).
  summary jsonb not null default '{}'::jsonb,

  latest_intelligence_snapshot_id uuid references intelligence_profile_snapshots(id) on delete set null,
  latest_wellness_insight_count int not null default 0,
  latest_registry_finding_count int not null default 0,
  overall_confidence numeric check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)),

  last_recalculated_at timestamptz not null default now(),
  last_recalculated_trigger text not null default 'manual' check (last_recalculated_trigger in (
    'assessment_published', 'check_in', 'onboarding', 'reassessment', 'manual'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_health_profiles_member_idx on member_health_profiles (member_id);

alter table member_health_profiles enable row level security;

create policy member_read_own_health_profile on member_health_profiles
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_health_profile on member_health_profiles
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_health_profile on member_health_profiles
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No member/coach insert or update policy — this table is written
-- exclusively through upsert_member_health_profile below, same "no general
-- write surface, only a narrow security-definer entry point" trust
-- boundary as wellness_profile_dimensions' own atomic upsert.
create or replace function upsert_member_health_profile(
  p_member uuid,
  p_summary jsonb,
  p_latest_snapshot_id uuid,
  p_wellness_insight_count int,
  p_registry_finding_count int,
  p_overall_confidence numeric,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    p_member = auth.uid()
    or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write member_health_profiles for this member';
  end if;

  insert into member_health_profiles (
    member_id, summary, latest_intelligence_snapshot_id,
    latest_wellness_insight_count, latest_registry_finding_count,
    overall_confidence, last_recalculated_at, last_recalculated_trigger, updated_at
  ) values (
    p_member, p_summary, p_latest_snapshot_id,
    p_wellness_insight_count, p_registry_finding_count,
    p_overall_confidence, now(), p_trigger, now()
  )
  on conflict (member_id) do update set
    summary = excluded.summary,
    latest_intelligence_snapshot_id = excluded.latest_intelligence_snapshot_id,
    latest_wellness_insight_count = excluded.latest_wellness_insight_count,
    latest_registry_finding_count = excluded.latest_registry_finding_count,
    overall_confidence = excluded.overall_confidence,
    last_recalculated_at = excluded.last_recalculated_at,
    last_recalculated_trigger = excluded.last_recalculated_trigger,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function upsert_member_health_profile(uuid, jsonb, uuid, int, int, numeric, text) from public;
grant execute on function upsert_member_health_profile(uuid, jsonb, uuid, int, int, numeric, text) to authenticated, service_role;
