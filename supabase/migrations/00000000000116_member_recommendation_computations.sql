-- Member Recommendation Computations — a single per-member marker of when
-- the Recommendation Engine's full compute-and-persist pass
-- (recomputeAndPersist, app/actions/recommendations.ts) last ran and why,
-- mirroring member_health_profiles' own last_recalculated_at/
-- last_recalculated_trigger pattern (migration 41) exactly, for the same
-- reason: member_recommendations' own per-row created_at/updated_at gets
-- touched by unrelated member actions (marking a row done/not helpful), so
-- it can't answer "when was this member's recommendation set as a whole
-- last (re)computed" without conflating that with individual row
-- lifecycle edits. This table answers exactly that question, for exactly
-- one purpose: deciding whether a page can trust the stored
-- member_recommendations rows or should treat them as stale and refresh.
--
-- One row per member (member_id is the primary key, not a separate id +
-- unique index) — there is never more than one "last computed at" per
-- member, so a composite key would just be an unused extra column.
create table member_recommendation_computations (
  member_id uuid primary key references auth.users(id) on delete cascade,
  computed_at timestamptz not null default now(),
  trigger text not null check (trigger in (
    'check_in', 'assessment_published', 'questionnaire_completed', 'manual'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table member_recommendation_computations enable row level security;

create policy member_read_own_recommendation_computation on member_recommendation_computations
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_recommendation_computation on member_recommendation_computations
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Written by whichever session triggered a recompute — the member's own
-- (a completed check-in) or an assigned coach's (viewing/refreshing the
-- client panel) — same trust boundary member_recommendations itself uses.
create policy member_upsert_own_recommendation_computation on member_recommendation_computations
  for insert
  with check (member_id = auth.uid());

create policy coach_upsert_assigned_recommendation_computation on member_recommendation_computations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_recommendation_computation on member_recommendation_computations
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_update_assigned_recommendation_computation on member_recommendation_computations
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_recommendation_computation on member_recommendation_computations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
