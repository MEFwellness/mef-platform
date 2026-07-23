-- Investigation Router decisions (Investigation Engine foundation, Prompt 9).
--
-- Every architecture document in the Rooted Reset Method series
-- (METHODOLOGY.md §7 step 4, ROOT-MODEL-AND-ROUTER.md §7) flags the same
-- real gap: "no field logs... the member chose X when Y was recommended"
-- — Method §7's own "member agency" honesty check has never had anywhere
-- to write. This table is that home. Append-only: one row per Root Router
-- decision (lib/investigation-engine/rootRouter.ts), written only when a
-- real recommendation existed, recording what was recommended and — once
-- known — what the member actually chose to start instead.
--
-- No member self-insert policy, deliberately, same posture migration 40
-- originally took for registry_entries: a member never authors this row
-- directly; it's written by server-side Investigation Engine code (today,
-- nothing calls the insert path yet — recordRouterDecision exists and is
-- tested but has no caller, the same "built, not yet wired" state
-- pickRecommendation() itself was in before this migration).
create table investigation_router_decisions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- AssessmentKey values (lib/assessment-registry/types.ts) — text, not a
  -- foreign key, same "stable key, not a database id" convention
  -- reassessment_schedules.assessment_definition_id deliberately does NOT
  -- follow (that one references assessment_definitions.id); this table
  -- intentionally stores the portable key instead, since a router decision
  -- is a Root Router-layer concept, not an Assessment Registry row.
  recommended_key text not null,
  recommended_reason text not null,
  chosen_key text,

  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index investigation_router_decisions_member_idx on investigation_router_decisions (member_id, decided_at);

alter table investigation_router_decisions enable row level security;

create policy member_read_own_investigation_router_decisions on investigation_router_decisions
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_investigation_router_decisions on investigation_router_decisions
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_investigation_router_decisions on investigation_router_decisions
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_investigation_router_decisions on investigation_router_decisions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
