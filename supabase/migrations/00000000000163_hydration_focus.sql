-- Conditional water tracking.
--
-- Water logging used to exist for every member whether or not hydration was
-- ever one of their problems. Members with no water issue simply never
-- logged, and every reader of daily_checkins.water_cups then read that
-- silence as under-hydration: a nonexistent problem scored, trended,
-- correlated and surfaced to their coach. This migration makes water
-- conditional on one real, member-answered flag.
--
--   profiles.hydration_focus
--     true   water is tracked (they said they have a water problem, or a
--            coach turned it on for them)
--     false  water is not tracked anywhere: no check-in question, no Today
--            tracker, no scoring, no trend, no insight, no coach summary
--     null   not answered yet. Deliberately NOT the same as false: every
--            member who completed intake before this feature existed keeps
--            today's exact behavior (water visible, water scored) until
--            they answer Root's one-time pop-up. Nothing about their
--            experience changes on deploy.
--
-- Historical water data is never deleted. water_cups keeps every value it
-- has ever held on the base table; the gate below only stops it from being
-- read.

alter table profiles
  add column hydration_focus boolean,
  add column hydration_focus_source text
    check (hydration_focus_source in ('intake', 'member_popup', 'coach'));

comment on column profiles.hydration_focus is
  'Whether water is tracked for this member. true = track it, false = do not track or score it anywhere, null = not answered yet (behaves as tracked, and Root''s one-time hydration pop-up is still due). Set by the onboarding intake question baseline_hydration, by the member answering Root''s pop-up, or by a coach on the member''s coach profile — a coach''s value overrides the member''s intake answer in either direction, because a coach may know she needs it even if she answered otherwise.';
comment on column profiles.hydration_focus_source is
  'Who last set hydration_focus. Read by the coach toggle so it can say where the current value came from; never used to decide behavior.';

-- ---------------------------------------------------------------------
-- The one gate, readable from SQL
-- ---------------------------------------------------------------------
-- security definer on purpose. daily_checkins_current (below) is a
-- security_invoker view, and a coach reading her client's check-ins can
-- read the client's profiles row only through
-- coach_read_assigned_client_profile — a plain join would therefore
-- silently drop rows for anyone whose RLS did not happen to also cover
-- profiles. This returns nothing but a boolean about a tracking
-- preference, so bypassing RLS to answer it exposes nothing.
--
-- coalesce(..., true) is the fallback in both directions: an unanswered
-- flag and a missing profile row both mean "behave exactly as the app
-- always has."
create or replace function public.member_hydration_tracked(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select hydration_focus from profiles where id = p_member), true);
$$;

comment on function public.member_hydration_tracked(uuid) is
  'True when water should be tracked, displayed and scored for this member. Null (unanswered) and a missing profile both resolve to true, so behavior is unchanged until the member or a coach actually answers.';

grant execute on function public.member_hydration_tracked(uuid) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- daily_checkins_current carries the flag on every row
-- ---------------------------------------------------------------------
-- Every reader of check-in data in this application goes through this view
-- (the application never selects from daily_checkins directly except the
-- coach question-bank admin's own answered-count scan). Attaching the flag
-- here means every one of those readers — the Daily Wellness Index, the
-- correlation engine, coaching insights, the weekly nutrition report, the
-- coach's member entries screen — can gate itself on the row it already
-- fetched, with no extra query anywhere and no danger of one reader
-- disagreeing with another about whether water counts.
--
-- water_cups itself is deliberately left intact on the view: history stays
-- readable, and each reader states its own gate explicitly rather than
-- having a column silently blanked underneath it.
--
-- IMPORTANT for any future migration that recreates this view: it must
-- keep the hydration_tracked expression. `select *` alone would silently
-- restore water to members who said they do not need it.
-- tests/hydration-focus.test.ts asserts the column is still there.
drop view daily_checkins_current;

create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (d.user_id, d.local_date)
    d.*,
    public.member_hydration_tracked(d.user_id) as hydration_tracked
  from daily_checkins d
  order by d.user_id, d.local_date, d.checkin_version desc;

-- ---------------------------------------------------------------------
-- The one write path
-- ---------------------------------------------------------------------
-- A member may set her own flag (the intake question and Root's pop-up
-- both land here). A coach may set it for a client she is actively
-- assigned to, and a platform administrator for anyone — neither of whom
-- can write profiles under RLS (there is only member_update_own_profile),
-- which is exactly why this exists as a security definer function rather
-- than a direct update from the application.
create or replace function public.set_member_hydration_focus(
  p_member uuid,
  p_value boolean,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('intake', 'member_popup', 'coach') then
    raise exception 'Unknown hydration_focus source: %', p_source;
  end if;

  if not (
    auth.uid() = p_member
    or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'Not allowed to set hydration tracking for this member'
      using errcode = '42501';
  end if;

  update profiles
     set hydration_focus = p_value,
         hydration_focus_source = p_source
   where id = p_member;
end;
$$;

comment on function public.set_member_hydration_focus(uuid, boolean, text) is
  'The only write path for profiles.hydration_focus. Callable by the member herself, by her active coach, or by a platform administrator.';

grant execute on function public.set_member_hydration_focus(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- The intake question
-- ---------------------------------------------------------------------
-- A fourth question_pool value, because none of the three existing ones
-- has the behavior this question needs:
--   legacy       is the fixed 12 the reassessment flow re-asks verbatim and
--                lib/onboarding/comparison.ts compares by exact key. This
--                question is not a comparison metric and must not change
--                what a reassessment asks.
--   concern_bank is only ever reached by members with a matching primary
--                concern.
--   shared_pool  competes for a single sampled slot, so most members would
--                never see it.
-- core_lifestyle means "always asked, exactly once, of every member" —
-- lib/onboarding/adaptivePlan.ts puts it right after the lifestyle anchors
-- (sleep, stress, energy, digestion, pain, movement) and before the
-- readiness triplet.
alter table onboarding_questions
  drop constraint if exists onboarding_questions_question_pool_check;

alter table onboarding_questions
  add constraint onboarding_questions_question_pool_check
    check (question_pool in ('legacy', 'concern_bank', 'shared_pool', 'core_lifestyle'));

do $$
declare
  v_version_id uuid;
begin
  select id into v_version_id from onboarding_assessment_versions where assessment_version = 1;

  if v_version_id is null then
    raise exception 'No onboarding_assessment_versions row for version 1 — run migration 49 first.';
  end if;

  insert into onboarding_questions
    (question_key, assessment_version_id, question_version, display_order, prompt_text, helper_text,
     answer_type, allowed_values, domain, allows_not_sure, allows_not_applicable, allows_prefer_not_to_answer,
     question_pool, concern, weight, requires, boosts)
  values
  ('baseline_hydration', v_version_id, 1, 900,
   'On a typical day, how much water do you drink?',
   null,
   'enum',
   '["very_little","a_few_glasses","plenty"]'::jsonb,
   'lifestyle', true, true, true,
   'core_lifestyle', null, 1, null, null)
  on conflict (question_key, question_version) do nothing;
end $$;
