-- Personal Reset Plan — the first monthly-member experience in Rooted
-- Reset. The handoff from insight (Core Values Snapshot, Life Signal
-- Check, Readiness Pulse) to action: Root proposes a single focus, a
-- tiny daily action sized to readiness, and a short honest agreement
-- about what she'll do next (day-3 check-in, day-7 reflection, a
-- difficult-day offer if needed).
--
-- Entitlement: a single nullable profiles.reset_plan_granted_at column
-- (same shape as migration 85's welcome_flow_eligible/completed_at
-- pair) — presence = granted, enforced server-side in
-- lib/reset-plan/eligibility.ts, not just hidden in the UI.
--
-- Storage: three new tables. member_reset_plans is the current-state
-- row per member (one per member while in draft/active status, enforced
-- by a partial unique index, not just app-level checking).
-- member_reset_plan_versions is an append-only audit trail modeled
-- directly on driver_probe_question_revisions (migration 110) — full
-- before/after jsonb snapshots plus a decision_evidence jsonb column for
-- the Screen 2 focus pick and Screen 4 action-tier shrink, which the
-- build brief is explicit are plan decisions, never tone-preference
-- evidence. member_reset_plan_daily_logs is the explicit three-state
-- daily log (never a boolean, unlike the Weekly Experiment's own
-- cvs_experiment_daily_logs), one row per member/plan/local day.
--
-- Also extends wellness_coaching_style_profile with a
-- tone_preference_source column ('inferred' | 'direct') and rewrites its
-- upsert RPC so a direct member statement (e.g. Readiness Pulse's own
-- Question 5) can never be silently overwritten by the background
-- recompute (lib/intelligence-core/service.ts's recalculateIntelligenceCore,
-- which runs on nearly every member action) — the guard this build's own
-- brief requires, even though this experience's own screens never write
-- a tone preference themselves.

-- 1) Entitlement flag.
alter table profiles add column reset_plan_granted_at timestamptz;

-- 2) Coaching-style direct-vs-inferred guard.
alter table wellness_coaching_style_profile
  add column tone_preference_source text not null default 'inferred'
  check (tone_preference_source in ('inferred', 'direct'));

-- wellness_coaching_style_profile has no member SELECT policy on purpose
-- (tests/intelligence-core-integration.test.ts pins this: confidence,
-- rationale, and the other dimensions are coach-internal working data, the
-- same deliberate boundary as wellness_profile_dimensions). This
-- experience's own Screen 5 still needs her own tone_preference — the one
-- coarse category, not the internal confidence/rationale that explains how
-- Root arrived at it — so a narrow security-definer function returns just
-- that one field for the caller's own row, never a blanket table grant.
create function get_my_coaching_tone_preference()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select tone_preference from wellness_coaching_style_profile where member_id = auth.uid();
$$;

drop function if exists upsert_wellness_coaching_style_profile(uuid, text, text, text, int, numeric, int, text);

create or replace function upsert_wellness_coaching_style_profile(
  p_member uuid,
  p_tone_preference text,
  p_detail_preference text,
  p_task_load_preference text,
  p_time_commitment_sweet_spot_minutes int,
  p_confidence numeric,
  p_evidence_count int,
  p_rationale text,
  p_source text default 'inferred'
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
    raise exception 'not authorized to write wellness_coaching_style_profile for this member';
  end if;

  insert into wellness_coaching_style_profile (
    member_id, tone_preference, tone_preference_source, detail_preference, task_load_preference,
    time_commitment_sweet_spot_minutes, confidence, evidence_count, rationale,
    last_computed_at, updated_at
  ) values (
    p_member, p_tone_preference, p_source, p_detail_preference, p_task_load_preference,
    p_time_commitment_sweet_spot_minutes, p_confidence, p_evidence_count, p_rationale,
    now(), now()
  )
  on conflict (member_id) do update set
    -- The guard: once a row is 'direct', a background 'inferred' call
    -- (the only kind recalculateIntelligenceCore ever issues) leaves
    -- tone_preference/tone_preference_source untouched. A new 'direct'
    -- call (a future explicit member statement) always wins outright,
    -- same as it always could before this guard existed.
    tone_preference = case
      when wellness_coaching_style_profile.tone_preference_source = 'direct' and excluded.tone_preference_source = 'inferred'
        then wellness_coaching_style_profile.tone_preference
      else excluded.tone_preference
    end,
    tone_preference_source = case
      when wellness_coaching_style_profile.tone_preference_source = 'direct' and excluded.tone_preference_source = 'inferred'
        then wellness_coaching_style_profile.tone_preference_source
      else excluded.tone_preference_source
    end,
    detail_preference = excluded.detail_preference,
    task_load_preference = excluded.task_load_preference,
    time_commitment_sweet_spot_minutes = excluded.time_commitment_sweet_spot_minutes,
    confidence = excluded.confidence,
    evidence_count = excluded.evidence_count,
    rationale = excluded.rationale,
    last_computed_at = excluded.last_computed_at,
    updated_at = excluded.updated_at;
end;
$$;

-- 3) member_reset_plans — one current-state row per member while in
-- draft or active status. The partial unique index is the real
-- duplicate-protection boundary (migration-level, not just app code):
-- a second insert while one is already draft/active fails outright.
create table member_reset_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active')),
  current_screen text not null default 'intro'
    check (current_screen in ('intro', 'proposal', 'why', 'action', 'agreement', 'closing', 'done')),

  -- Screen 2 / Screen 4 decisions — the plan's own real content. Kept
  -- structural (a signal, a tier) rather than stored prose: the actual
  -- copy (why it matters, the action text, success framing) is fully
  -- derivable from these plus the snapshot columns below via
  -- lib/reset-plan/copy.ts, the approved action library, and
  -- lib/life-signal-check/adjacency.ts — one living source of truth
  -- for wording, never a second, driftable copy of it in the database.
  focus_signal text check (focus_signal in ('energy', 'sleep', 'tension', 'digestion', 'body', 'mind')),
  action_tier text check (action_tier in ('ready_now', 'ready_if_small', 'still_deciding', 'not_yet')),

  -- The input snapshot — recomputed once at plan creation from each
  -- experience's own real scoring engine (never parsed from narrative
  -- prose), so every claim Root makes in this experience stays
  -- provably true even if she later retakes Core Values Snapshot, Life
  -- Signal Check, or Readiness Pulse.
  snapshot_top_value text check (snapshot_top_value in ('health', 'relationships', 'growth', 'purpose', 'freedom', 'peace')),
  snapshot_loudest_signal text check (snapshot_loudest_signal in ('energy', 'sleep', 'tension', 'digestion', 'body', 'mind')),
  snapshot_final_readiness_pattern text check (snapshot_final_readiness_pattern in ('ready_now', 'ready_if_small', 'still_deciding', 'not_yet')),
  snapshot_q6_obstacle text check (snapshot_q6_obstacle in ('schedule', 'follow_through', 'other_people', 'expecting_too_much')),
  snapshot_target_signal text check (snapshot_target_signal in ('energy', 'sleep', 'tension', 'digestion', 'body', 'mind')),
  snapshot_cvs jsonb,
  snapshot_lsc jsonb,
  snapshot_rpl jsonb,
  snapshot_computed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  -- The member's own local calendar date the plan went active — day-3/
  -- day-7 eligibility is computed from this, exactly the role
  -- lifestyle_experiments.start_date already plays for the Weekly
  -- Experiment (lib/core-values-snapshot/experiment.ts's daysSinceStart).
  start_local_date date,
  day7_acknowledged_at timestamptz
);

create unique index member_reset_plans_one_current on member_reset_plans (member_id) where status in ('draft', 'active');
create index member_reset_plans_member_idx on member_reset_plans (member_id, created_at desc);

alter table member_reset_plans enable row level security;

create policy member_read_own_member_reset_plans on member_reset_plans
  for select using (member_id = auth.uid());
create policy member_insert_own_member_reset_plans on member_reset_plans
  for insert with check (member_id = auth.uid());
create policy member_update_own_member_reset_plans on member_reset_plans
  for update using (member_id = auth.uid());
create policy coach_read_assigned_member_reset_plans on member_reset_plans
  for select using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), member_id));
create policy platform_admin_all_member_reset_plans on member_reset_plans
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- 4) member_reset_plan_versions — append-only audit trail, exact shape
-- of driver_probe_question_revisions (migration 110): full before/after
-- jsonb, a fixed change_type vocabulary, and a real RLS-verified
-- changed_by (never client-supplied — the insert policy enforces
-- changed_by = auth.uid()). decision_evidence carries the Screen 2/4
-- structured choices this build's brief requires to be recorded here,
-- never written into wellness_coaching_style_profile. Version history
-- exists from V1 (the 'created' row) so the future Trend Reflection
-- feature can read real plan changes over time.
create table member_reset_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references member_reset_plans(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  change_type text not null check (change_type in ('created', 'focus_chosen', 'action_tier_chosen', 'activated')),
  before jsonb,
  after jsonb,
  decision_evidence jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index member_reset_plan_versions_plan_idx on member_reset_plan_versions (plan_id, changed_at);

alter table member_reset_plan_versions enable row level security;

create policy member_read_own_member_reset_plan_versions on member_reset_plan_versions
  for select using (member_id = auth.uid());
create policy member_insert_own_member_reset_plan_versions on member_reset_plan_versions
  for insert with check (member_id = auth.uid() and changed_by = auth.uid());
create policy coach_read_assigned_member_reset_plan_versions on member_reset_plan_versions
  for select using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), member_id));
create policy platform_admin_all_member_reset_plan_versions on member_reset_plan_versions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- 5) member_reset_plan_daily_logs — the three explicit states, never a
-- boolean. One final state per member/plan/local day, enforced with a
-- real database constraint (unique (plan_id, local_date)) — a
-- correction updates the existing row, never inserts a second one.
-- plan_version_id records which version of the plan was active at the
-- moment logged, same accuracy discipline as the snapshot columns above.
create table member_reset_plan_daily_logs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references member_reset_plans(id) on delete cascade,
  plan_version_id uuid not null references member_reset_plan_versions(id),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  -- Nullable, same shape as cvs_experiment_daily_logs.completed (migration
  -- 134): a row can exist for a given local_date purely to carry
  -- day3_response before the member has separately tapped today's daily
  -- state, or vice versa. A null state is never treated as an implicit
  -- "not_today" — see the build's own "no row/no state is a confirmed
  -- miss" rule.
  state text check (state in ('completed_normal', 'completed_difficult', 'not_today')),
  -- The day-3 "how is it going" qualitative check-in, stored on that
  -- day's own log row rather than a fourth table, same shape as
  -- cvs_experiment_daily_logs.day3_response (migration 134).
  day3_response text check (day3_response in ('going_well', 'mixed', 'not_started')),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, local_date)
);

create index member_reset_plan_daily_logs_plan_idx on member_reset_plan_daily_logs (plan_id, local_date);

alter table member_reset_plan_daily_logs enable row level security;

create policy member_read_own_member_reset_plan_daily_logs on member_reset_plan_daily_logs
  for select using (member_id = auth.uid());
create policy member_insert_own_member_reset_plan_daily_logs on member_reset_plan_daily_logs
  for insert with check (member_id = auth.uid());
create policy member_update_own_member_reset_plan_daily_logs on member_reset_plan_daily_logs
  for update using (member_id = auth.uid());
create policy coach_read_assigned_member_reset_plan_daily_logs on member_reset_plan_daily_logs
  for select using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), member_id));
create policy platform_admin_all_member_reset_plan_daily_logs on member_reset_plan_daily_logs
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
