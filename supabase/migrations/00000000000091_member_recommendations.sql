-- Member Recommendations (Prompt 11) — the Recommendation Engine's
-- persisted, stateful layer over lib/intelligence-engine/recommendations.ts's
-- already-computed, ephemeral Recommendation[]. That array is recomputed
-- fresh on every engine run and never itself persisted with a lifecycle
-- (the only existing jsonb `recommendations` column, on
-- intelligence_profile_snapshots, is an append-only frozen archive with no
-- status column at all — not reusable for this). This table is genuinely
-- new: one row per recommendation actually surfaced to a member, carrying
-- exactly the shown/completed/ignored/expired lifecycle nothing else in
-- this schema tracks for this concept.
--
-- Dedup/reopen model mirrors intelligence_coach_alerts' upsert-by-key
-- discipline (migration 34) exactly: recomputing the engine touches an
-- existing 'shown' row for the same (member, recommendation_key) rather
-- than duplicating it; a member's own 'completed' or 'ignored' decision is
-- never silently reopened by recompute, the same "a coach's dismissal is
-- never silently reversed" trust boundary applied to the member's own
-- choice this time.
--
-- Unlike intelligence_coach_alerts (coach-internal, no member SELECT
-- policy), this table IS a member-facing surface by design — the member
-- is meant to see, complete, and dismiss their own recommendations.
create table member_recommendations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Stable dedup key, e.g. "sleep_sleep_optimization_improve-your-wind-down-routine"
  -- — deterministic from the source Recommendation's domain/category/title,
  -- never a random id or timestamp, so unrelated recomputation runs
  -- resolve to the same row rather than spamming duplicates.
  recommendation_key text not null,

  category text not null check (category in (
    'education', 'lifestyle_experiment', 'reflection', 'coaching_conversation',
    'movement_focus', 'recovery_focus', 'nutrition_focus', 'stress_management',
    'sleep_optimization', 'breathing_practice', 'daily_habit', 'weekly_practice',
    'follow_up_investigation', 'coach_review', 'medical_referral_flag'
  )),
  -- The real RecommendationDomain (lib/intelligence-engine/types.ts) this
  -- row was mapped from — informational only, never read by RLS or app
  -- logic as a second source of truth.
  source_domain text not null,

  title text not null,
  explanation text not null,
  why_this_was_selected text not null,
  supporting_findings jsonb not null default '[]'::jsonb,
  confidence numeric not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  recommended_duration text not null check (recommended_duration in ('daily', 'weekly', 'one_time', 'ongoing')),
  reassessment_trigger text,

  status text not null default 'shown' check (status in ('shown', 'completed', 'ignored', 'expired')),
  completed_at timestamptz,
  ignored_at timestamptz,
  ignored_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_recommendations_member_idx on member_recommendations (member_id, created_at desc);

-- Enforces the dedup rule at the database level: at most one 'shown' row
-- per (member, recommendation_key) at a time. Once a row moves to
-- completed/ignored/expired it falls outside this partial index, so a
-- genuinely new occurrence of the same key is free to insert a fresh row
-- — "resolved allows recurrence," same semantics intelligence_coach_alerts
-- already established for resolved (vs. dismissed) alerts.
create unique index member_recommendations_open_key_idx
  on member_recommendations (member_id, recommendation_key)
  where status = 'shown';

create index member_recommendations_status_idx on member_recommendations (status);

alter table member_recommendations enable row level security;

create policy member_read_own_member_recommendations on member_recommendations
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_recommendations on member_recommendations
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Row generation runs on whichever session triggered it — the member's own
-- (opening their dashboard) or an assigned coach's (viewing the client
-- panel) — same insert trust boundary as intelligence_coach_alerts.
create policy member_insert_own_member_recommendations on member_recommendations
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_member_recommendations on member_recommendations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- A member may transition status on their own rows (mark done / not
-- helpful) — a coach never mutates a member's recommendation status in
-- this prompt's scope; the app layer (never RLS) additionally refuses to
-- let a member complete a coach_review/medical_referral_flag row, since
-- those categories aren't member-completable actions.
create policy member_update_own_member_recommendations on member_recommendations
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy platform_admin_all_member_recommendations on member_recommendations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
