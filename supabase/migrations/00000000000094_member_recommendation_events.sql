-- Recommendation outcome events (Prompt 12, Part 4 — Recommendation
-- Learning) — append-only, one row per thing that happened to a
-- member_recommendations row over time. Deliberately NOT folded into
-- member_recommendations.status: that column drives
-- member_recommendations_open_key_idx's unique partial index and every
-- existing status-based read (deriveEffectiveStatus, listMemberRecommendations,
-- both the member and coach recommendations views) — overloading it with
-- twelve event types would collapse history down to whichever transition
-- happened last, and risk regressing Prompt 11's dedup semantics. Same
-- shape as investigation_router_decisions (migration 89): a small,
-- append-only companion table sitting next to the row it's about, not a
-- rewrite of it.
--
-- markRecommendationDone/markRecommendationNotHelpful
-- (app/actions/recommendations.ts) and startMyExperiment/
-- reflectAndCloseMyExperiment/abandonMyExperiment
-- (app/actions/lifestyleExperiments.ts) each additionally insert one of
-- these rows alongside their existing member_recommendations.status
-- write — additive, that write path is untouched.
create table member_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references member_recommendations(id) on delete cascade,

  event_type text not null check (event_type in (
    'started', 'stopped_early', 'dismissed', 'marked_helpful', 'marked_not_helpful',
    'reflection_outcome_worked', 'reflection_outcome_partially_worked',
    'reflection_outcome_didnt_work', 'reflection_outcome_inconclusive',
    'member_reported_improvement', 'member_reported_no_change', 'member_reported_worsening'
  )),
  note text,

  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index member_recommendation_events_member_idx on member_recommendation_events (member_id, recorded_at desc);
create index member_recommendation_events_recommendation_idx on member_recommendation_events (recommendation_id);

alter table member_recommendation_events enable row level security;

create policy member_read_own_member_recommendation_events on member_recommendation_events
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_recommendation_events on member_recommendation_events
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The member is the only writer — these events record the member's own
-- actions/reflections. No update/delete policy at all, on either side:
-- append-only, mirroring investigation_router_decisions' own precedent —
-- a history of what happened is never edited after the fact.
create policy member_insert_own_member_recommendation_events on member_recommendation_events
  for insert
  with check (member_id = auth.uid());

create policy platform_admin_all_member_recommendation_events on member_recommendation_events
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
