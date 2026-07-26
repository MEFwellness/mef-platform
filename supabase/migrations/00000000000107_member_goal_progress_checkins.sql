-- Member Goal Progress Check-ins — the case view's headline measure
-- (requirement 5: "her original goal, charted"). A periodic, plain
-- self-rating of how the thing she actually came for is going, phrased
-- in her own words (lib/case-view/goalProgress.ts builds the prompt from
-- member_goal_selections' primary_goal / goals_other, quoting free text
-- verbatim) — never scored, classified, or fed into any tier/correlation
-- logic. This is deliberately separate from daily_checkins,
-- driver_probe_questions, onboarding_questions, and reassessment
-- entirely, per the standing instruction not to touch the check-in
-- question flow: it lives only on the new case view page, prompted on
-- its own cadence (see GOAL_PROGRESS_RECHECK_DAYS), not as a daily
-- check-in field.
create table member_goal_progress_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  -- Plain 1-5 "how is this going" scale — no product interpretation
  -- attached; the case view charts this raw value directly.
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (member_id, local_date)
);

create index member_goal_progress_checkins_member_idx on member_goal_progress_checkins (member_id, local_date);

alter table member_goal_progress_checkins enable row level security;

create policy member_manage_own_member_goal_progress_checkins on member_goal_progress_checkins
  for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_read_assigned_member_goal_progress_checkins on member_goal_progress_checkins
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_member_goal_progress_checkins on member_goal_progress_checkins
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
