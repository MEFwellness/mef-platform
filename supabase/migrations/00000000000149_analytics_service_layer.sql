-- Admin Analytics, the server side aggregation layer.
--
-- Everything here reads the ONE existing event stream through the ONE
-- existing read surface: product_analytics_events (migration 146) over
-- member_wellness_events (migration 63). No second events table, no
-- third-party analytics SDK, no duplicated instrumentation. This migration
-- adds only read paths: no new table, no new column, no trigger, no change
-- to any existing row, policy, or writer.
--
-- Five rules this file follows everywhere, each one already established by
-- migration 146's own header and docs/PRODUCT_ANALYTICS.md:
--
--   1. DAY FILTERING USES local_date, NEVER occurred_at. occurred_at is the
--      member's wall clock stamped as UTC, so it is correct for ordering
--      events relative to each other and wrong for "which calendar day was
--      this". local_date is computed at write time in the member's own
--      timezone and is the only correct day column. This was caught and
--      fixed once already; every function below filters on local_date.
--   2. TEST ACCOUNTS ARE EXCLUDED BY DEFAULT. Every function takes
--      p_include_test and defaults it to false. profiles.is_test
--      (migration 114) is the flag, joined onto every row by the
--      product_analytics_events view.
--   3. BEHAVIORAL CONTENT ONLY. The view already excludes the five
--      health-content wellness event types by construction, so nothing here
--      can reach a check-in answer, a pain location, a sleep number, or a
--      questionnaire response even by mistake. No function below selects
--      from any table that holds member health answers.
--   4. AGGREGATION HAPPENS HERE, IN THE DATABASE. Nothing in this design
--      loads raw event rows into application memory. Every function returns
--      either a small jsonb summary or a bounded per-member fact row.
--   5. PURCHASES ARE EXCLUDED. purchase_completed is an accepted event type
--      that nothing emits, because billing is not built in this
--      application. It is never counted as activity anywhere below, and the
--      funnel reports its stage as explicitly unmeasurable rather than as
--      zero.
--
-- Authorization. Every top-level function is SECURITY INVOKER and calls
-- analytics_assert_admin() first. Two independent things therefore both
-- have to be true for a caller to see cross member numbers: the explicit
-- role check raises for anyone who is not a platform administrator, and,
-- because these functions run as the caller rather than as their owner, the
-- existing row level security on member_wellness_events and profiles still
-- applies underneath. A member who somehow got past the first check would
-- still only be able to see their own rows. The helpers are invoker too,
-- for the same reason.

-- ---------------------------------------------------------------------
-- Authorization guard.
-- ---------------------------------------------------------------------
-- Deliberately SECURITY INVOKER: inside a SECURITY DEFINER function
-- current_user is the function owner, which would make the trusted
-- connection check below meaningless. As an invoker function current_user
-- is genuinely the caller's database role.
create or replace function public.analytics_assert_admin()
returns void
language plpgsql
stable
as $$
begin
  -- A direct database session (psql, a migration, a maintenance script) or
  -- a service-role connection (the app's own cron routes, and later the
  -- Engagement Agent) is already trusted infrastructure that bypasses row
  -- level security anyway. Everything else has to prove the role.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return;
  end if;

  if auth.uid() is null then
    raise exception 'Analytics services require an authenticated platform administrator.'
      using errcode = '42501';
  end if;

  if not public.has_active_role(auth.uid(), 'platform_administrator') then
    raise exception 'Analytics services require the platform_administrator role.'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.analytics_assert_admin is
  'Raises 42501 unless the caller is a platform administrator or a trusted
   database/service-role connection. Called first by every analytics
   function. Not the only protection: the analytics functions are security
   invoker, so RLS on the underlying tables applies as well.';

-- ---------------------------------------------------------------------
-- What counts as the member doing something.
-- ---------------------------------------------------------------------
-- "Meaningful activity" is the definition the whole layer is built on:
-- active days, sessions, engagement states, absences and declines are all
-- derived from it. Three analytics types are deliberately NOT meaningful
-- activity:
--
--   signup_completed        account creation is not app usage
--   membership_tier_changed written by a trigger, usually by an
--                           administrator, not by the member
--   purchase_completed      nothing emits it (no billing integration)
--
-- Everything else is evidence that the member was in the app. That
-- includes the three events the app shows TO her (paywall_viewed,
-- priority_shown, re_entry_shown), because she has to have opened the app
-- for any of them to render.
create or replace function public.is_meaningful_activity_event_type(p_event_type text)
returns boolean
language sql
immutable
as $$
  select p_event_type in (
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'priority_shown',
    'priority_action',
    're_entry_shown'
  );
$$;

-- ---------------------------------------------------------------------
-- Who counts as a member.
-- ---------------------------------------------------------------------
-- One definition, used by every function below, so no two numbers can ever
-- disagree about the denominator. A member is a profile that is not a test
-- fixture (unless the caller asked for them) and does not hold a staff role
-- grant. A coach signing in to review a caseload writes session_started the
-- same way a member does; counting that as member activity would inflate
-- every active-member number on the dashboard.
--
-- Any grant of a staff role disqualifies the account, whether or not the
-- role itself is currently active. That is deliberately stricter than
-- has_active_role: an account that was ever operated as staff is not a real
-- member's usage record.
create or replace function public.analytics_member_scope(p_include_test boolean)
returns table (member_id uuid, display_name text, created_at timestamptz, is_test boolean)
language sql
stable
as $$
  select p.id, p.display_name, p.created_at, p.is_test
  from public.profiles p
  where (p_include_test or p.is_test = false)
    and not exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role in ('coach', 'platform_administrator', 'clinician_reviewer')
        and ur.revoked_at is null
    );
$$;

-- The start date an "all time" request resolves to: the first day anything
-- was ever recorded. Deliberately not a hardcoded floor like 2000-01-01,
-- because per-day averages divided by twenty six years of empty calendar
-- would be a fabricated number rather than an honest one. Falls back to
-- today when there is no data at all, which yields a one day range and
-- correctly empty results.
create or replace function public.analytics_default_start(p_include_test boolean)
returns date
language sql
stable
as $$
  select coalesce(min(e.local_date), current_date)
  from public.product_analytics_events e
  where (p_include_test or e.is_test = false);
$$;

-- Every analytics event belonging to an in-scope member, in a date range.
-- The single entry point for raw rows. Nothing below reads
-- product_analytics_events directly.
create or replace function public.analytics_scoped_events(
  p_start date,
  p_end date,
  p_include_test boolean
)
returns table (
  member_id uuid,
  event_type text,
  local_date date,
  occurred_at timestamptz,
  payload jsonb
)
language sql
stable
as $$
  select e.member_id, e.event_type, e.local_date, e.occurred_at, e.payload
  from public.product_analytics_events e
  join public.analytics_member_scope(p_include_test) s on s.member_id = e.member_id
  where e.local_date between p_start and p_end;
$$;

-- One row per (member, calendar day) on which that member did something.
-- This is the atom of the whole layer.
--
-- SESSION, defined. This service treats one active member-day as one
-- session, not one session_started event. session_started fires only on a
-- completed sign-in, and this app keeps members signed in across days, so
-- sign-ins undercount real visits badly. Sign-in counts are still reported
-- separately, as sign-ins, never as sessions.
create or replace function public.analytics_member_days(
  p_start date,
  p_end date,
  p_include_test boolean
)
returns table (member_id uuid, active_date date, event_count bigint)
language sql
stable
as $$
  select e.member_id, e.local_date, count(*)::bigint
  from public.analytics_scoped_events(p_start, p_end, p_include_test) e
  where public.is_meaningful_activity_event_type(e.event_type)
  group by e.member_id, e.local_date;
$$;

-- ---------------------------------------------------------------------
-- Registries. The one place each list of "things we measure" is declared.
-- ---------------------------------------------------------------------
-- Matching is by jsonb containment, so a filter of '{}' matches every event
-- of that type and '{"surface":"home"}' matches only the home surface. Every
-- key and value here comes from lib/analytics/surfaces.ts's closed
-- allowlists, so these can never drift into free text.

-- Surfaces and features a member can use. Listed exhaustively, including
-- ones with no usage yet, so a report shows an honest zero rather than
-- silently omitting the row.
create or replace function public.analytics_feature_registry()
returns table (feature_key text, label text, event_type text, payload_filter jsonb)
language sql
immutable
as $$
  select * from (values
    -- Major screens, from PRODUCT_SURFACES.
    ('home',                 'Home',                     'surface_viewed', '{"surface":"home"}'::jsonb),
    ('today',                'Today',                    'surface_viewed', '{"surface":"today"}'::jsonb),
    ('daily_reset',          'Daily Reset',              'surface_viewed', '{"surface":"daily_reset"}'::jsonb),
    ('daily_reset_evening',  'Daily Reset, evening',     'surface_viewed', '{"surface":"daily_reset_evening"}'::jsonb),
    ('food_lens',            'Food Lens',                'surface_viewed', '{"surface":"food_lens"}'::jsonb),
    ('progress',             'Your Wellness Story',      'surface_viewed', '{"surface":"progress"}'::jsonb),
    ('your_case',            'Your Case',                'surface_viewed', '{"surface":"your_case"}'::jsonb),
    ('movement',             'Movement',                 'surface_viewed', '{"surface":"movement"}'::jsonb),
    ('questionnaires',       'Experiences catalog',      'surface_viewed', '{"surface":"questionnaires"}'::jsonb),
    ('questionnaire',        'An experience',            'surface_viewed', '{"surface":"questionnaire"}'::jsonb),
    ('conversation',         'Conversation',             'surface_viewed', '{"surface":"conversation"}'::jsonb),
    ('reset_plan',           'Reset Plan',               'surface_viewed', '{"surface":"reset_plan"}'::jsonb),
    ('root_score',           'Root Score',               'surface_viewed', '{"surface":"root_score"}'::jsonb),
    ('insights',             'Insights',                 'surface_viewed', '{"surface":"insights"}'::jsonb),
    ('noticing',             'Noticing',                 'surface_viewed', '{"surface":"noticing"}'::jsonb),
    ('recommendations',      'Recommendations',          'surface_viewed', '{"surface":"recommendations"}'::jsonb),
    ('membership',           'Membership',               'surface_viewed', '{"surface":"membership"}'::jsonb),
    ('profile',              'Profile',                  'surface_viewed', '{"surface":"profile"}'::jsonb),
    ('body_assessment',      'Body assessment',          'surface_viewed', '{"surface":"body_assessment"}'::jsonb),

    -- Features with their own event types, which is a real interaction
    -- rather than a screen opening.
    ('todays_focus',         'Today''s Focus',           'feature_engaged', '{"feature":"todays_focus"}'::jsonb),
    ('reset_plan_actions',   'Reset Plan actions',       'feature_engaged', '{"feature":"reset_plan"}'::jsonb),
    ('food_scan',            'Food Lens scans',          'food_scan_performed', '{}'::jsonb),
    ('food_logging',         'Food and protein logging', 'food_entry_logged', '{}'::jsonb),
    ('daily_reset_flow',     'Daily Reset wizard',       'daily_reset_started', '{}'::jsonb),
    ('onboarding_flow',      'Onboarding',               'onboarding_started', '{}'::jsonb),
    ('priority_card',        'Priority Card',            'priority_shown', '{}'::jsonb)
  ) as r(feature_key, label, event_type, payload_filter);
$$;

-- Started/completed pairs. A flow appears here only if BOTH halves are
-- really emitted somewhere in the codebase; a pair whose events exist as
-- accepted types but have no call site is listed with measurable = false
-- and a reason, never as a zero.
create or replace function public.analytics_flow_registry()
returns table (
  flow_key text,
  label text,
  feature_key text,
  start_event_type text,
  start_filter jsonb,
  complete_event_type text,
  complete_filter jsonb,
  measurable boolean,
  unmeasurable_reason text
)
language sql
immutable
as $$
  select * from (values
    ('daily_reset', 'Daily Reset', 'daily_reset_flow',
      'daily_reset_started', '{}'::jsonb,
      'daily_reset_completed', '{}'::jsonb,
      true, null::text),

    ('onboarding', 'Onboarding', 'onboarding_flow',
      'onboarding_started', '{}'::jsonb,
      'onboarding_completed', '{}'::jsonb,
      true, null::text),

    ('todays_focus_item', 'Today''s Focus item', 'todays_focus',
      'feature_engaged', '{"feature":"todays_focus","action":"opened_item"}'::jsonb,
      'feature_engaged', '{"feature":"todays_focus","action":"completed_item"}'::jsonb,
      true, null::text),

    ('reset_plan_setup', 'Reset Plan setup', 'reset_plan_actions',
      'feature_engaged', '{"feature":"reset_plan","action":"chose_focus"}'::jsonb,
      'feature_engaged', '{"feature":"reset_plan","action":"chose_action_tier"}'::jsonb,
      true, null::text),

    ('priority_card', 'Priority Card', 'priority_card',
      'priority_shown', '{}'::jsonb,
      'priority_action', '{"action":"done"}'::jsonb,
      true, null::text),

    -- Accepted vocabulary with no emitter. lib/analytics/surfaces.ts lists
    -- questionnaire as an engageable feature with started/completed
    -- actions, but no call site in the app writes them: an experience is
    -- only ever observed as a surface_viewed. Reported as unmeasurable so
    -- nobody reads a structural zero as a 100 percent drop-off.
    ('experience', 'Experience', 'questionnaire',
      'feature_engaged', '{"feature":"questionnaire","action":"started"}'::jsonb,
      'feature_engaged', '{"feature":"questionnaire","action":"completed"}'::jsonb,
      false, 'No call site emits feature_engaged for the questionnaire feature yet, so an experience has no start or completion event. Only surface views of an experience are recorded.')
  ) as r(flow_key, label, feature_key, start_event_type, start_filter,
         complete_event_type, complete_filter, measurable, unmeasurable_reason);
$$;

-- Features where opening the thing and doing something in it are separate
-- events, so "looked at it and never touched it" is observable.
create or replace function public.analytics_view_engage_registry()
returns table (
  feature_key text,
  label text,
  view_event_type text,
  view_filter jsonb,
  engage_event_type text,
  engage_filter jsonb
)
language sql
immutable
as $$
  select * from (values
    ('todays_focus', 'Today''s Focus',
      'feature_engaged', '{"feature":"todays_focus","action":"opened_item"}'::jsonb,
      'feature_engaged', '{"feature":"todays_focus"}'::jsonb),
    ('reset_plan', 'Reset Plan',
      'surface_viewed', '{"surface":"reset_plan"}'::jsonb,
      'feature_engaged', '{"feature":"reset_plan"}'::jsonb),
    ('priority_card', 'Priority Card',
      'priority_shown', '{}'::jsonb,
      'priority_action', '{}'::jsonb)
  ) as r(feature_key, label, view_event_type, view_filter, engage_event_type, engage_filter);
$$;

-- ---------------------------------------------------------------------
-- SERVICE GROUP A: overview metrics.
-- ---------------------------------------------------------------------
-- Every rate returns null, never zero, when its denominator is zero. A
-- fabricated "0 percent completion" from an empty period is worse than an
-- honest "not enough data".
create or replace function public.analytics_overview(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_week_start date;
  v_result jsonb;
begin
  perform public.analytics_assert_admin();
  v_week_start := greatest(v_start, v_end - 6);

  with days as (
    select * from public.analytics_member_days(v_start, v_end, p_include_test)
  ),
  events as (
    select * from public.analytics_scoped_events(v_start, v_end, p_include_test)
  ),
  per_member as (
    select d.member_id, count(*)::bigint as active_days
    from days d group by d.member_id
  ),
  per_day as (
    select d.active_date, count(distinct d.member_id)::bigint as members
    from days d group by d.active_date
  ),
  gaps as (
    select d.member_id,
           d.active_date - lag(d.active_date) over (partition by d.member_id order by d.active_date) as gap
    from days d
  ),
  member_gap as (
    select g.member_id, avg(g.gap)::numeric as avg_gap
    from gaps g where g.gap is not null group by g.member_id
  ),
  totals as (
    select
      (select count(*) from public.analytics_member_scope(p_include_test) s
        where s.created_at::date <= v_end)::bigint as total_members,
      (select count(distinct e.member_id) from events e
        where e.event_type = 'signup_completed')::bigint as new_members,
      (select count(*) from per_member)::bigint as active_members,
      (select count(*) from per_member pm where pm.active_days >= 2)::bigint as returning_members,
      (select count(distinct d.member_id) from days d where d.active_date >= v_week_start)::bigint as weekly_actives,
      (select sum(pm.active_days) from per_member pm)::bigint as total_sessions,
      (select count(*) from events e where e.event_type = 'session_started')::bigint as sign_ins,
      (select avg(mg.avg_gap) from member_gap mg)::numeric as avg_days_between_visits,
      (select count(*) from public.analytics_member_scope(p_include_test) s2
        where s2.created_at::date between v_start and v_end)::bigint as profiles_created_in_range
  ),
  flow_counts as (
    select
      count(distinct e.member_id) filter (where e.event_type = 'daily_reset_started')::bigint as dr_started_members,
      count(*) filter (where e.event_type = 'daily_reset_started')::bigint as dr_started_events,
      count(distinct e.member_id) filter (where e.event_type = 'daily_reset_completed')::bigint as dr_completed_members,
      count(*) filter (where e.event_type = 'daily_reset_completed')::bigint as dr_completed_events,
      count(distinct e.member_id) filter (where e.event_type = 'onboarding_started')::bigint as ob_started_members,
      count(distinct e.member_id) filter (where e.event_type = 'onboarding_completed')::bigint as ob_completed_members,
      count(distinct e.member_id) filter (
        where e.event_type in ('food_scan_performed', 'food_entry_logged')
           or (e.event_type = 'surface_viewed' and e.payload @> '{"surface":"food_lens"}'::jsonb)
      )::bigint as nutrition_members,
      count(distinct e.member_id) filter (
        where e.event_type = 'surface_viewed' and e.payload @> '{"surface":"today"}'::jsonb
      )::bigint as today_members,
      count(distinct e.member_id) filter (
        where e.event_type = 'feature_engaged' and e.payload @> '{"feature":"todays_focus"}'::jsonb
      )::bigint as todays_focus_members,
      count(distinct e.member_id) filter (
        where e.event_type = 'feature_engaged' and e.payload @> '{"feature":"reset_plan"}'::jsonb
      )::bigint as reset_plan_members,
      count(distinct e.member_id) filter (
        where e.event_type = 'surface_viewed' and e.payload @> '{"surface":"reset_plan"}'::jsonb
      )::bigint as reset_plan_viewers,
      count(distinct e.member_id) filter (
        where e.event_type = 'surface_viewed' and e.payload @> '{"surface":"your_case"}'::jsonb
      )::bigint as your_case_members,
      count(*) filter (where e.event_type = 'paywall_viewed')::bigint as paywall_events,
      count(distinct e.member_id) filter (where e.event_type = 'paywall_viewed')::bigint as paywall_members,
      count(*) filter (where e.event_type = 'membership_tier_changed')::bigint as tier_events,
      count(distinct e.member_id) filter (where e.event_type = 'membership_tier_changed')::bigint as tier_members
    from events e
  )
  select jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end, 'days', (v_end - v_start) + 1),
    'includeTestAccounts', p_include_test,
    'hasData', (t.active_members > 0 or t.new_members > 0),
    'totalMembers', t.total_members,
    'newMembers', t.new_members,
    'profilesCreatedInRange', t.profiles_created_in_range,
    'activeMembers', t.active_members,
    'returningMembers', t.returning_members,
    'weeklyActiveMembers', t.weekly_actives,
    'dailyActiveAverage',
      case when (v_end - v_start) + 1 > 0 and t.total_sessions is not null
        then round(t.total_sessions::numeric / ((v_end - v_start) + 1), 2) end,
    'dailyActiveLatest', coalesce((select pd.members from per_day pd where pd.active_date = v_end), 0),
    'dailyActiveSeries', coalesce((
      select jsonb_agg(jsonb_build_object('localDate', pd.active_date, 'members', pd.members)
                       order by pd.active_date)
      from per_day pd), '[]'::jsonb),
    'sessions', coalesce(t.total_sessions, 0),
    'signIns', t.sign_ins,
    'averageSessionsPerActiveMember',
      case when t.active_members > 0 then round(t.total_sessions::numeric / t.active_members, 2) end,
    'averageDaysBetweenVisits',
      case when t.avg_days_between_visits is not null then round(t.avg_days_between_visits, 2) end,
    'dailyReset', jsonb_build_object(
      'startedMembers', f.dr_started_members,
      'startedEvents', f.dr_started_events,
      'completedMembers', f.dr_completed_members,
      'completedEvents', f.dr_completed_events,
      'completionRate', case when f.dr_started_events > 0
        then round(f.dr_completed_events::numeric * 100 / f.dr_started_events, 1) end
    ),
    'onboarding', jsonb_build_object(
      'startedMembers', f.ob_started_members,
      'completedMembers', f.ob_completed_members,
      'completionRate', case when f.ob_started_members > 0
        then round(f.ob_completed_members::numeric * 100 / f.ob_started_members, 1) end
    ),
    'membersUsingNutrition', f.nutrition_members,
    'membersViewingToday', f.today_members,
    'membersUsingTodaysFocus', f.todays_focus_members,
    'membersUsingResetPlan', f.reset_plan_members,
    'membersViewingResetPlan', f.reset_plan_viewers,
    'membersViewingYourCase', f.your_case_members,
    'paywallViews', jsonb_build_object('events', f.paywall_events, 'members', f.paywall_members),
    'tierChanges', jsonb_build_object('events', f.tier_events, 'members', f.tier_members),
    'purchases', jsonb_build_object(
      'measurable', false,
      'reason', 'No billing integration exists in this application, so nothing emits purchase_completed. Membership tier changes and paywall views are the monetization signals available today.'
    )
  )
  into v_result
  from totals t, flow_counts f;

  return v_result;
end;
$$;

comment on function public.analytics_overview is
  'Service group A. Period overview metrics. A session means one active
   member-day, not one sign-in, because this app keeps members signed in
   across days. Rates are null rather than zero when the denominator is
   zero. Test accounts excluded unless p_include_test.';

-- ---------------------------------------------------------------------
-- SERVICE GROUP B: the funnel.
-- ---------------------------------------------------------------------
-- Cohort based. The cohort is every in-scope member whose signup_completed
-- event has a local_date inside the range. Each later stage asks "did this
-- member ever do this", at any time up to p_end, not "did they do it inside
-- the range": a member who signed up on the last day of the range has not
-- had time to do anything else inside it, and counting her as a drop-off
-- would be false.
--
-- One honest limitation, reported in the return value rather than hidden.
-- signup_completed only exists from the day product analytics shipped, so
-- accounts created before then are not in any cohort. profilesCreatedInRange
-- is returned alongside cohortSize so that gap is visible instead of looking
-- like nobody signed up.
create or replace function public.analytics_funnel(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_cohort_size bigint;
  v_stages jsonb;
  v_profiles_in_range bigint;
begin
  perform public.analytics_assert_admin();

  select count(*) into v_profiles_in_range
  from public.analytics_member_scope(p_include_test) s
  where s.created_at::date between v_start and v_end;

  with cohort as (
    select distinct e.member_id
    from public.analytics_scoped_events(v_start, v_end, p_include_test) e
    where e.event_type = 'signup_completed'
  ),
  cohort_size as (
    select count(*)::bigint as members from cohort
  ),
  lifetime as (
    -- Every event these cohort members ever produced, up to p_end. Not
    -- restricted to the range, deliberately: see the header.
    select e.*
    from public.analytics_scoped_events(date '2000-01-01', v_end, p_include_test) e
    join cohort c on c.member_id = e.member_id
  ),
  active_days as (
    select l.member_id, count(distinct l.local_date)::bigint as days
    from lifetime l
    where public.is_meaningful_activity_event_type(l.event_type)
    group by l.member_id
  ),
  stage_counts as (
    select
      count(distinct l.member_id) filter (where l.event_type = 'onboarding_started')::bigint as onboarding_started,
      count(distinct l.member_id) filter (where l.event_type = 'onboarding_completed')::bigint as onboarding_completed,
      -- First meaningful app use: anything beyond creating the account,
      -- signing in, and moving through onboarding.
      count(distinct l.member_id) filter (
        where public.is_meaningful_activity_event_type(l.event_type)
          and l.event_type not in ('session_started', 'onboarding_started', 'onboarding_completed')
      )::bigint as first_use,
      count(distinct l.member_id) filter (where l.event_type = 'daily_reset_started')::bigint as reset_started,
      count(distinct l.member_id) filter (where l.event_type = 'daily_reset_completed')::bigint as reset_completed,
      -- Another major feature: real use of something that is not the Daily
      -- Reset and not onboarding.
      count(distinct l.member_id) filter (
        where l.event_type in ('food_scan_performed', 'food_entry_logged')
           or (l.event_type = 'feature_engaged')
           or (l.event_type = 'surface_viewed' and l.payload->>'surface' in (
                 'food_lens', 'today', 'your_case', 'progress', 'movement',
                 'questionnaires', 'questionnaire', 'conversation', 'reset_plan',
                 'root_score', 'insights', 'noticing', 'recommendations', 'body_assessment'))
      )::bigint as other_feature,
      count(distinct l.member_id) filter (where l.event_type = 'paywall_viewed')::bigint as paywall
    from lifetime l
  ),
  returned as (
    select count(*)::bigint as members from active_days a where a.days >= 2
  )
  select cs.members, jsonb_build_array(
    jsonb_build_object('key', 'account_created', 'label', 'Account created',
      'measurable', true, 'unmeasurableReason', null, 'members', cs.members),
    jsonb_build_object('key', 'onboarding_started', 'label', 'Onboarding started',
      'measurable', true, 'unmeasurableReason', null, 'members', s.onboarding_started),
    jsonb_build_object('key', 'onboarding_completed', 'label', 'Onboarding completed',
      'measurable', true, 'unmeasurableReason', null, 'members', s.onboarding_completed),
    jsonb_build_object('key', 'first_meaningful_use', 'label', 'First meaningful app use',
      'measurable', true, 'unmeasurableReason', null, 'members', s.first_use),
    jsonb_build_object('key', 'first_daily_reset_started', 'label', 'First Daily Reset started',
      'measurable', true, 'unmeasurableReason', null, 'members', s.reset_started),
    jsonb_build_object('key', 'first_daily_reset_completed', 'label', 'First Daily Reset completed',
      'measurable', true, 'unmeasurableReason', null, 'members', s.reset_completed),
    jsonb_build_object('key', 'returned_another_day', 'label', 'Returned another day',
      'measurable', true, 'unmeasurableReason', null, 'members', r.members),
    jsonb_build_object('key', 'used_another_major_feature', 'label', 'Used another major feature',
      'measurable', true, 'unmeasurableReason', null, 'members', s.other_feature),
    jsonb_build_object('key', 'viewed_premium_locked_feature', 'label', 'Viewed a premium or locked feature',
      'measurable', true, 'unmeasurableReason', null, 'members', s.paywall),
    jsonb_build_object('key', 'completed_a_purchase', 'label', 'Completed a purchase',
      'measurable', false,
      'unmeasurableReason', 'Checkout happens entirely outside this application. Nothing emits purchase_completed, so this stage has no data at all rather than a count of zero.',
      'members', null)
  )
  into v_cohort_size, v_stages
  from stage_counts s, returned r, cohort_size cs;

  return jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'includeTestAccounts', p_include_test,
    'cohortBasis', 'Members whose signup_completed event falls inside the range. Later stages count whether that member has ever reached the stage, up to the end of the range.',
    'cohortSize', v_cohort_size,
    'profilesCreatedInRange', v_profiles_in_range,
    'stages', v_stages
  );
end;
$$;

comment on function public.analytics_funnel is
  'Service group B. Signup cohort funnel. Stages that cannot be measured
   from events that actually have an emitter are returned with
   measurable = false, a reason, and a null count, never a fabricated zero.';

-- ---------------------------------------------------------------------
-- SERVICE GROUP C: feature usage.
-- ---------------------------------------------------------------------
create or replace function public.analytics_feature_usage(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_active_members bigint;
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  select count(distinct d.member_id) into v_active_members
  from public.analytics_member_days(v_start, v_end, p_include_test) d;

  with events as (
    select * from public.analytics_scoped_events(v_start, v_end, p_include_test)
  ),
  per_member as (
    select r.feature_key, e.member_id,
           count(*)::bigint as events,
           count(distinct e.local_date)::bigint as days
    from public.analytics_feature_registry() r
    join events e
      on e.event_type = r.event_type
     and e.payload @> r.payload_filter
    group by r.feature_key, e.member_id
  ),
  rolled as (
    select r.feature_key, r.label,
           coalesce(count(pm.member_id), 0)::bigint as unique_members,
           coalesce(sum(pm.events), 0)::bigint as total_events,
           coalesce(count(pm.member_id) filter (where pm.events > 1), 0)::bigint as repeat_members,
           coalesce(count(pm.member_id) filter (where pm.days > 1), 0)::bigint as multi_day_members
    from public.analytics_feature_registry() r
    left join per_member pm on pm.feature_key = r.feature_key
    group by r.feature_key, r.label
  ),
  flows as (
    select f.feature_key, f.flow_key, f.label as flow_label, f.measurable, f.unmeasurable_reason,
           (select count(*) from events e
             where e.event_type = f.start_event_type and e.payload @> f.start_filter)::bigint as started,
           (select count(*) from events e
             where e.event_type = f.complete_event_type and e.payload @> f.complete_filter)::bigint as completed
    from public.analytics_flow_registry() f
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'featureKey', x.feature_key,
      'label', x.label,
      'uniqueMembers', x.unique_members,
      'totalEvents', x.total_events,
      'percentOfActiveMembers', case when v_active_members > 0
        then round(x.unique_members::numeric * 100 / v_active_members, 1) end,
      'repeatMembers', x.repeat_members,
      'repeatRate', case when x.unique_members > 0
        then round(x.repeat_members::numeric * 100 / x.unique_members, 1) end,
      'multiDayMembers', x.multi_day_members,
      'averageEventsPerMember', case when x.unique_members > 0
        then round(x.total_events::numeric / x.unique_members, 2) end,
      'completionRate', case
        when x.measurable is not true then null
        when x.started > 0 then round(x.completed::numeric * 100 / x.started, 1) end,
      'completionBasis', case when x.measurable is true then x.flow_label end,
      'completionMeasurable', x.measurable,
      'completionUnmeasurableReason', x.unmeasurable_reason
    )
    order by x.unique_members desc, x.total_events desc, x.feature_key
  ), '[]'::jsonb)
  into v_result
  from (
    select ro.*, fl.flow_key, fl.flow_label, fl.measurable, fl.unmeasurable_reason,
           fl.started, fl.completed
    from rolled ro
    left join flows fl on fl.feature_key = ro.feature_key
  ) x;

  return jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'includeTestAccounts', p_include_test,
    'activeMembers', v_active_members,
    'features', v_result
  );
end;
$$;

comment on function public.analytics_feature_usage is
  'Service group C. Per feature unique members, total events, share of
   active members, repeat usage and, where a real started/completed pair
   exists, completion rate. Ranked most to least used. Features with no
   usage are returned as honest zeros rather than omitted.';

-- ---------------------------------------------------------------------
-- SERVICE GROUP D: drop-off.
-- ---------------------------------------------------------------------
-- Flow level only. Per-question drop-off inside the Daily Reset or an
-- onboarding flow is deliberately absent: no per-screen or per-question
-- event exists, and inferring it from anything else would be invention.
create or replace function public.analytics_drop_off(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  with events as (
    select * from public.analytics_scoped_events(v_start, v_end, p_include_test)
  ),
  pairs as (
    select f.*,
      (select count(*) from events e
        where e.event_type = f.start_event_type and e.payload @> f.start_filter)::bigint as started_events,
      (select count(distinct e.member_id) from events e
        where e.event_type = f.start_event_type and e.payload @> f.start_filter)::bigint as started_members,
      (select count(*) from events e
        where e.event_type = f.complete_event_type and e.payload @> f.complete_filter)::bigint as completed_events,
      (select count(distinct e.member_id) from events e
        where e.event_type = f.complete_event_type and e.payload @> f.complete_filter)::bigint as completed_members
    from public.analytics_flow_registry() f
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'flowKey', p.flow_key,
      'label', p.label,
      'measurable', p.measurable,
      'unmeasurableReason', p.unmeasurable_reason,
      'startedEvents', case when p.measurable then p.started_events end,
      'completedEvents', case when p.measurable then p.completed_events end,
      'startedMembers', case when p.measurable then p.started_members end,
      'completedMembers', case when p.measurable then p.completed_members end,
      'completionRate', case when p.measurable and p.started_events > 0
        then round(p.completed_events::numeric * 100 / p.started_events, 1) end,
      'dropOffRate', case when p.measurable and p.started_events > 0
        then round((p.started_events - p.completed_events)::numeric * 100 / p.started_events, 1) end,
      'memberCompletionRate', case when p.measurable and p.started_members > 0
        then round(p.completed_members::numeric * 100 / p.started_members, 1) end
    )
    order by
      case when p.measurable and p.started_events > 0
        then (p.started_events - p.completed_events)::numeric / p.started_events end desc nulls last,
      p.flow_key
  ), '[]'::jsonb)
  into v_result
  from pairs p;

  return jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'includeTestAccounts', p_include_test,
    'perQuestionDropOff', jsonb_build_object(
      'measurable', false,
      'reason', 'No per-question or per-screen event exists in the instrumentation, so drop-off inside a flow cannot be attributed to a particular question.'
    ),
    'flows', v_result
  );
end;
$$;

comment on function public.analytics_drop_off is
  'Service group D. Started/completed counts and drop-off for every flow
   that really emits both halves. Flows whose events have no emitter are
   flagged unmeasurable with a reason. Per-question drop-off is explicitly
   reported as unmeasurable.';

-- ---------------------------------------------------------------------
-- SERVICE GROUP E and F: the shared per-member behavioral facts.
-- ---------------------------------------------------------------------
-- ONE detection function, consumed by everything that asks a question
-- about how a member's own behavior has changed: the engagement state
-- classifier, the "who has disengaged" query, the "who reduced their usage"
-- query, and the long-absence, decline, and return-after-absence friction
-- signals. There is deliberately no second implementation of "days since
-- last activity" or "recent versus baseline" anywhere in this codebase.
--
-- Windows, fixed and documented:
--   recent   = the 14 calendar days ending on p_end
--   baseline = the 28 calendar days immediately before that
--   lifetime = everything up to p_end
--
-- Nothing here decides anything. It returns counts and dates only; the
-- rules that turn them into a state live in
-- lib/analytics-service/engagementState.ts, in plain language, so they can
-- be read, tested and argued with without a database.
create or replace function public.analytics_member_engagement_facts(
  p_end date default null,
  p_include_test boolean default false,
  p_member uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_end date := coalesce(p_end, current_date);
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  with days as (
    select d.member_id, d.active_date
    from public.analytics_member_days(date '2000-01-01', v_end, p_include_test) d
    where p_member is null or d.member_id = p_member
  ),
  gaps as (
    select d.member_id, d.active_date,
           d.active_date - lag(d.active_date) over (partition by d.member_id order by d.active_date) as gap
    from days d
  ),
  agg as (
    select d.member_id,
      min(d.active_date) as first_activity,
      max(d.active_date) as last_activity,
      count(*)::bigint as lifetime_active_days,
      count(*) filter (where d.active_date > v_end - 14)::bigint as recent_active_days,
      count(*) filter (where d.active_date <= v_end - 14 and d.active_date > v_end - 42)::bigint as baseline_active_days
    from days d group by d.member_id
  ),
  gap_agg as (
    select g.member_id,
      percentile_cont(0.5) within group (order by g.gap)::numeric as median_gap,
      max(g.gap)::bigint as longest_gap,
      -- The gap that was just closed by her most recent visit. This is what
      -- makes "she came back after being away" observable, as distinct from
      -- "she has always been sporadic".
      (array_agg(g.gap order by g.active_date desc))[1]::bigint as latest_gap
    from gaps g where g.gap is not null group by g.member_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', s.member_id,
      'displayName', s.display_name,
      'accountCreatedDate', s.created_at::date,
      'isTestAccount', s.is_test,
      'referenceDate', v_end,
      'firstActivityDate', a.first_activity,
      'lastActivityDate', a.last_activity,
      'daysSinceLastActivity', case when a.last_activity is not null then v_end - a.last_activity end,
      'daysSinceAccountCreated', v_end - s.created_at::date,
      'historyDays', case when a.first_activity is not null then (v_end - a.first_activity) + 1 end,
      'lifetimeActiveDays', coalesce(a.lifetime_active_days, 0),
      'recentActiveDays', coalesce(a.recent_active_days, 0),
      'recentWindowDays', 14,
      'baselineActiveDays', coalesce(a.baseline_active_days, 0),
      'baselineWindowDays', 28,
      'typicalGapDays', case when g.median_gap is not null then round(g.median_gap, 2) end,
      'longestGapDays', g.longest_gap,
      'latestGapDays', g.latest_gap
    )
    order by a.last_activity desc nulls last, s.member_id
  ), '[]'::jsonb)
  into v_result
  from public.analytics_member_scope(p_include_test) s
  left join agg a on a.member_id = s.member_id
  left join gap_agg g on g.member_id = s.member_id
  where p_member is null or s.member_id = p_member;

  return v_result;
end;
$$;

comment on function public.analytics_member_engagement_facts is
  'The single behavioral-change detection function. Per member: first and
   last activity, days since, lifetime active days, recent (14 day) versus
   baseline (28 day) active days, and her own typical/longest/most recent
   gap between visits. Returns facts only; classification happens in
   lib/analytics-service/engagementState.ts.';

-- Started something and did not finish it, per member, per flow. The one
-- detection behind both the "who started but did not finish" agent query
-- and the repeated-incomplete-flow friction signals.
create or replace function public.analytics_detect_incomplete_flows(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false,
  p_member uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  with events as (
    select e.* from public.analytics_scoped_events(v_start, v_end, p_include_test) e
    where p_member is null or e.member_id = p_member
  ),
  per_member as (
    select f.flow_key, f.label, f.feature_key, e.member_id,
      count(*) filter (where e.event_type = f.start_event_type and e.payload @> f.start_filter)::bigint as started,
      count(*) filter (where e.event_type = f.complete_event_type and e.payload @> f.complete_filter)::bigint as completed,
      count(distinct e.local_date) filter (where e.event_type = f.start_event_type and e.payload @> f.start_filter)::bigint as started_days,
      max(e.local_date) filter (where e.event_type = f.start_event_type and e.payload @> f.start_filter) as last_started_date,
      max(e.local_date) filter (where e.event_type = f.complete_event_type and e.payload @> f.complete_filter) as last_completed_date
    from public.analytics_flow_registry() f
    join events e
      on (e.event_type = f.start_event_type and e.payload @> f.start_filter)
      or (e.event_type = f.complete_event_type and e.payload @> f.complete_filter)
    where f.measurable
    group by f.flow_key, f.label, f.feature_key, e.member_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', pm.member_id,
      'displayName', s.display_name,
      'flowKey', pm.flow_key,
      'label', pm.label,
      'featureKey', pm.feature_key,
      'startedEvents', pm.started,
      'completedEvents', pm.completed,
      'startedDays', pm.started_days,
      'unfinishedEvents', greatest(pm.started - pm.completed, 0),
      'completionRate', case when pm.started > 0
        then round(pm.completed::numeric * 100 / pm.started, 1) end,
      'lastStartedDate', pm.last_started_date,
      'lastCompletedDate', pm.last_completed_date
    )
    order by (pm.started - pm.completed) desc, pm.member_id, pm.flow_key
  ), '[]'::jsonb)
  into v_result
  from per_member pm
  join public.analytics_member_scope(p_include_test) s on s.member_id = pm.member_id
  where pm.started > 0;

  return v_result;
end;
$$;

comment on function public.analytics_detect_incomplete_flows is
  'The single started-but-not-completed detection. Per member, per flow,
   inside the range. Consumed by the agent query and by the friction
   signals so the two can never disagree.';

-- Per member, per feature: how much she used it recently versus her own
-- earlier baseline. The one detection behind the "she has stopped using a
-- feature she used to use" signal.
create or replace function public.analytics_detect_feature_change(
  p_end date default null,
  p_window_days integer default 14,
  p_include_test boolean default false,
  p_member uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_end date := coalesce(p_end, current_date);
  v_window integer := greatest(coalesce(p_window_days, 14), 1);
  v_recent_start date;
  v_baseline_start date;
  v_result jsonb;
begin
  perform public.analytics_assert_admin();
  v_recent_start := v_end - (v_window - 1);
  -- Baseline is twice the recent window, immediately before it, so a single
  -- quiet week inside a normal rhythm does not read as a decline.
  v_baseline_start := v_recent_start - (v_window * 2);

  with events as (
    select e.* from public.analytics_scoped_events(v_baseline_start, v_end, p_include_test) e
    where p_member is null or e.member_id = p_member
  ),
  per_member as (
    select r.feature_key, r.label, e.member_id,
      count(*) filter (where e.local_date >= v_recent_start)::bigint as recent_events,
      count(*) filter (where e.local_date < v_recent_start)::bigint as baseline_events,
      count(distinct e.local_date) filter (where e.local_date >= v_recent_start)::bigint as recent_days,
      count(distinct e.local_date) filter (where e.local_date < v_recent_start)::bigint as baseline_days,
      max(e.local_date) as last_used_date
    from public.analytics_feature_registry() r
    join events e on e.event_type = r.event_type and e.payload @> r.payload_filter
    group by r.feature_key, r.label, e.member_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', pm.member_id,
      'displayName', s.display_name,
      'featureKey', pm.feature_key,
      'label', pm.label,
      'recentWindow', jsonb_build_object('start', v_recent_start, 'end', v_end, 'days', v_window),
      'baselineWindow', jsonb_build_object('start', v_baseline_start, 'end', v_recent_start - 1, 'days', v_window * 2),
      'recentEvents', pm.recent_events,
      'baselineEvents', pm.baseline_events,
      'recentDays', pm.recent_days,
      'baselineDays', pm.baseline_days,
      -- Rates per day, so a 14 day window and a 28 day window compare fairly.
      'recentRatePerDay', round(pm.recent_events::numeric / v_window, 3),
      'baselineRatePerDay', round(pm.baseline_events::numeric / (v_window * 2), 3),
      'changeRatio', case when pm.baseline_events > 0
        then round((pm.recent_events::numeric / v_window) / (pm.baseline_events::numeric / (v_window * 2)), 3) end,
      'lastUsedDate', pm.last_used_date
    )
    order by pm.member_id, pm.feature_key
  ), '[]'::jsonb)
  into v_result
  from per_member pm
  join public.analytics_member_scope(p_include_test) s on s.member_id = pm.member_id;

  return v_result;
end;
$$;

-- Platform level version of the same question: which features are being
-- used less than they were, across everyone.
create or replace function public.analytics_feature_trend(
  p_end date default null,
  p_window_days integer default 14,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_end date := coalesce(p_end, current_date);
  v_window integer := greatest(coalesce(p_window_days, 14), 1);
  v_recent_start date;
  v_baseline_start date;
  v_result jsonb;
begin
  perform public.analytics_assert_admin();
  v_recent_start := v_end - (v_window - 1);
  v_baseline_start := v_recent_start - (v_window * 2);

  with events as (
    select * from public.analytics_scoped_events(v_baseline_start, v_end, p_include_test)
  ),
  rolled as (
    select r.feature_key, r.label,
      count(*) filter (where e.local_date >= v_recent_start)::bigint as recent_events,
      count(*) filter (where e.local_date < v_recent_start)::bigint as baseline_events,
      count(distinct e.member_id) filter (where e.local_date >= v_recent_start)::bigint as recent_members,
      count(distinct e.member_id) filter (where e.local_date < v_recent_start)::bigint as baseline_members
    from public.analytics_feature_registry() r
    left join events e on e.event_type = r.event_type and e.payload @> r.payload_filter
    group by r.feature_key, r.label
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'featureKey', ro.feature_key,
      'label', ro.label,
      'recentEvents', ro.recent_events,
      'baselineEvents', ro.baseline_events,
      'recentMembers', ro.recent_members,
      'baselineMembers', ro.baseline_members,
      'recentRatePerDay', round(ro.recent_events::numeric / v_window, 3),
      'baselineRatePerDay', round(ro.baseline_events::numeric / (v_window * 2), 3),
      'changeRatio', case when ro.baseline_events > 0
        then round((ro.recent_events::numeric / v_window) / (ro.baseline_events::numeric / (v_window * 2)), 3) end
    )
    order by case when ro.baseline_events > 0
      then (ro.recent_events::numeric / v_window) / (ro.baseline_events::numeric / (v_window * 2)) end asc nulls last,
      ro.feature_key
  ), '[]'::jsonb)
  into v_result
  from rolled ro;

  return jsonb_build_object(
    'referenceDate', v_end,
    'windowDays', v_window,
    'recentWindow', jsonb_build_object('start', v_recent_start, 'end', v_end),
    'baselineWindow', jsonb_build_object('start', v_baseline_start, 'end', v_recent_start - 1),
    'includeTestAccounts', p_include_test,
    'features', v_result
  );
end;
$$;

-- Opened it and never did anything in it. Only for features where opening
-- and acting are genuinely separate events.
create or replace function public.analytics_detect_view_without_engagement(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false,
  p_member uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  with events as (
    select e.* from public.analytics_scoped_events(v_start, v_end, p_include_test) e
    where p_member is null or e.member_id = p_member
  ),
  per_member as (
    select r.feature_key, r.label, e.member_id,
      count(*) filter (where e.event_type = r.view_event_type and e.payload @> r.view_filter)::bigint as views,
      count(distinct e.local_date) filter (where e.event_type = r.view_event_type and e.payload @> r.view_filter)::bigint as view_days,
      -- An engagement event that is not itself the view event, otherwise
      -- Today's Focus would count its own opened_item as an interaction.
      count(*) filter (
        where e.event_type = r.engage_event_type
          and e.payload @> r.engage_filter
          and not (e.event_type = r.view_event_type and e.payload @> r.view_filter)
      )::bigint as engagements,
      min(e.local_date) filter (where e.event_type = r.view_event_type and e.payload @> r.view_filter) as first_view_date,
      max(e.local_date) filter (where e.event_type = r.view_event_type and e.payload @> r.view_filter) as last_view_date
    from public.analytics_view_engage_registry() r
    join events e
      on (e.event_type = r.view_event_type and e.payload @> r.view_filter)
      or (e.event_type = r.engage_event_type and e.payload @> r.engage_filter)
    group by r.feature_key, r.label, e.member_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', pm.member_id,
      'displayName', s.display_name,
      'featureKey', pm.feature_key,
      'label', pm.label,
      'views', pm.views,
      'viewDays', pm.view_days,
      'engagements', pm.engagements,
      'engagementRate', case when pm.views > 0
        then round(pm.engagements::numeric * 100 / pm.views, 1) end,
      'firstViewDate', pm.first_view_date,
      'lastViewDate', pm.last_view_date
    )
    order by pm.member_id, pm.feature_key
  ), '[]'::jsonb)
  into v_result
  from per_member pm
  join public.analytics_member_scope(p_include_test) s on s.member_id = pm.member_id
  where pm.views > 0;

  return v_result;
end;
$$;

-- She keeps coming back to the same thing. Not friction, the opposite of
-- it, and worth naming for the same reason: a coaching layer should know
-- what is working before it suggests anything.
create or replace function public.analytics_detect_consistent_feature_use(
  p_start date default null,
  p_end date default null,
  p_include_test boolean default false,
  p_member uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_start date := coalesce(p_start, public.analytics_default_start(p_include_test));
  v_end date := coalesce(p_end, current_date);
  v_result jsonb;
begin
  perform public.analytics_assert_admin();

  with days as (
    select d.member_id, d.active_date
    from public.analytics_member_days(v_start, v_end, p_include_test) d
    where p_member is null or d.member_id = p_member
  ),
  member_days as (
    select d.member_id, count(*)::bigint as active_days from days d group by d.member_id
  ),
  events as (
    select e.* from public.analytics_scoped_events(v_start, v_end, p_include_test) e
    where p_member is null or e.member_id = p_member
  ),
  feature_days as (
    select r.feature_key, r.label, e.member_id,
      count(distinct e.local_date)::bigint as used_days,
      count(*)::bigint as events
    from public.analytics_feature_registry() r
    join events e on e.event_type = r.event_type and e.payload @> r.payload_filter
    group by r.feature_key, r.label, e.member_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', fd.member_id,
      'displayName', s.display_name,
      'featureKey', fd.feature_key,
      'label', fd.label,
      'usedDays', fd.used_days,
      'events', fd.events,
      'memberActiveDays', md.active_days,
      'shareOfActiveDays', case when md.active_days > 0
        then round(fd.used_days::numeric * 100 / md.active_days, 1) end
    )
    order by fd.member_id, fd.used_days desc, fd.feature_key
  ), '[]'::jsonb)
  into v_result
  from feature_days fd
  join member_days md on md.member_id = fd.member_id
  join public.analytics_member_scope(p_include_test) s on s.member_id = fd.member_id;

  return v_result;
end;
$$;

-- The measurements taken on each side of the comparison. Separate function
-- so the two sides are provably identical arithmetic.
create or replace function public.analytics_window_metrics(
  p_member uuid,
  p_start date,
  p_end date,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
begin
  perform public.analytics_assert_admin();

  return (
  with days as (
    select d.active_date
    from public.analytics_member_days(p_start, p_end, p_include_test) d
    where d.member_id = p_member
  ),
  events as (
    select e.*
    from public.analytics_scoped_events(p_start, p_end, p_include_test) e
    where e.member_id = p_member
  ),
  gaps as (
    select d.active_date - lag(d.active_date) over (order by d.active_date) as gap from days d
  ),
  features as (
    select r.feature_key, r.label, count(*)::bigint as events,
           count(distinct e.local_date)::bigint as days
    from public.analytics_feature_registry() r
    join events e on e.event_type = r.event_type and e.payload @> r.payload_filter
    group by r.feature_key, r.label
  )
  select jsonb_build_object(
    'window', jsonb_build_object('start', p_start, 'end', p_end, 'days', (p_end - p_start) + 1),
    'activeDays', (select count(*) from days),
    'activeDayRate', case when (p_end - p_start) + 1 > 0
      then round((select count(*) from days)::numeric / ((p_end - p_start) + 1), 3) end,
    'signIns', (select count(*) from events e where e.event_type = 'session_started'),
    'dailyResetStarted', (select count(*) from events e where e.event_type = 'daily_reset_started'),
    'dailyResetCompleted', (select count(*) from events e where e.event_type = 'daily_reset_completed'),
    'dailyResetCompletionRate', (
      select case when count(*) filter (where e.event_type = 'daily_reset_started') > 0
        then round(count(*) filter (where e.event_type = 'daily_reset_completed')::numeric * 100
                   / count(*) filter (where e.event_type = 'daily_reset_started'), 1) end
      from events e),
    'totalEvents', (select count(*) from events),
    'averageDaysBetweenVisits', (
      select case when count(g.gap) > 0 then round(avg(g.gap)::numeric, 2) end
      from gaps g where g.gap is not null),
    'featureUse', coalesce((
      select jsonb_agg(jsonb_build_object(
        'featureKey', f.feature_key, 'label', f.label, 'events', f.events, 'days', f.days)
        order by f.events desc, f.feature_key)
      from features f), '[]'::jsonb)
  ));
end;
$$;

-- ---------------------------------------------------------------------
-- The before/after comparison primitive.
-- ---------------------------------------------------------------------
-- Given one member and a reference date, the same behavioral measurements
-- for the window before it and the window after it. The reference day
-- itself belongs to neither window: it is the pivot, the day the thing
-- being observed happened.
--
-- afterWindowComplete says whether the after window has actually finished
-- yet. Reading a half-elapsed after window as a decline would be the
-- obvious way to make this primitive lie, so the caller is told.
create or replace function public.analytics_member_window_comparison(
  p_member uuid,
  p_reference_date date,
  p_window_days integer default 14,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_window integer := greatest(coalesce(p_window_days, 14), 1);
  v_ref date := p_reference_date;
  v_before_start date;
  v_before_end date;
  v_after_start date;
  v_after_end date;
  v_before jsonb;
  v_after jsonb;
  v_in_scope boolean;
begin
  perform public.analytics_assert_admin();

  if p_member is null or v_ref is null then
    raise exception 'analytics_member_window_comparison requires a member and a reference date.'
      using errcode = '22004';
  end if;

  select exists (
    select 1 from public.analytics_member_scope(p_include_test) s where s.member_id = p_member
  ) into v_in_scope;

  v_before_start := v_ref - v_window;
  v_before_end := v_ref - 1;
  v_after_start := v_ref + 1;
  v_after_end := v_ref + v_window;

  v_before := public.analytics_window_metrics(p_member, v_before_start, v_before_end, p_include_test);
  v_after := public.analytics_window_metrics(p_member, v_after_start, v_after_end, p_include_test);

  return jsonb_build_object(
    'memberId', p_member,
    'inScope', v_in_scope,
    'referenceDate', v_ref,
    'windowDays', v_window,
    'includeTestAccounts', p_include_test,
    'afterWindowComplete', v_after_end <= current_date,
    'daysOfAfterWindowElapsed', greatest(least(current_date, v_after_end) - v_after_start + 1, 0),
    'before', v_before,
    'after', v_after
  );
end;
$$;

comment on function public.analytics_member_window_comparison is
  'The before/after primitive. One member, one reference date, the same
   behavioral measurements for the window before and the window after.
   The reference day belongs to neither window. Deterministic arithmetic
   only, no interpretation of why anything changed.';

-- ---------------------------------------------------------------------
-- Index.
-- ---------------------------------------------------------------------
-- Every query in this file is "all members, one calendar-day range, some
-- event types". The two existing indexes cannot serve that shape:
-- (member_id, local_date, event_type) needs a member id, and
-- (event_type, occurred_at desc) is on occurred_at, which is deliberately
-- not the column any day filtering may use. This is the missing one. It is
-- additive: no existing reader's plan changes.
--
-- Deliberately NOT added, and why: a materialized daily rollup. At the
-- current data volume every function here is one range scan over a few
-- thousand rows, and a rollup would introduce a staleness contract and a
-- refresh job for no measurable gain. If the event table grows past roughly
-- ten million rows, the next step is a member_analytics_daily summary table
-- refreshed by the existing cron infrastructure, keyed on
-- (member_id, local_date), which every function here could read instead of
-- product_analytics_events with no change to its own shape.
create index if not exists member_wellness_events_local_date_type_idx
  on member_wellness_events (local_date, event_type);

-- ---------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------
-- authenticated is granted execute because a platform administrator is an
-- authenticated user. Authorization is the runtime role check inside each
-- function, plus the row level security that still applies because these
-- are security invoker functions. The helper functions are safe to expose
-- for the same reason: called by a member, they can only ever see that
-- member's own rows.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.analytics_assert_admin()',
    'public.is_meaningful_activity_event_type(text)',
    'public.analytics_member_scope(boolean)',
    'public.analytics_scoped_events(date, date, boolean)',
    'public.analytics_member_days(date, date, boolean)',
    'public.analytics_feature_registry()',
    'public.analytics_flow_registry()',
    'public.analytics_view_engage_registry()',
    'public.analytics_overview(date, date, boolean)',
    'public.analytics_funnel(date, date, boolean)',
    'public.analytics_feature_usage(date, date, boolean)',
    'public.analytics_drop_off(date, date, boolean)',
    'public.analytics_member_engagement_facts(date, boolean, uuid)',
    'public.analytics_detect_incomplete_flows(date, date, boolean, uuid)',
    'public.analytics_detect_feature_change(date, integer, boolean, uuid)',
    'public.analytics_feature_trend(date, integer, boolean)',
    'public.analytics_detect_view_without_engagement(date, date, boolean, uuid)',
    'public.analytics_detect_consistent_feature_use(date, date, boolean, uuid)',
    'public.analytics_window_metrics(uuid, date, date, boolean)',
    'public.analytics_member_window_comparison(uuid, date, integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;

-- Same reason migrations 124 and 146 do this: new functions are called
-- through PostgREST, and a `db push --db-url` run does not reliably make
-- PostgREST reload its cached schema. Without this every RPC call fails
-- with PGRST202 until the instance happens to restart.
notify pgrst, 'reload schema';
