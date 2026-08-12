-- Product Analytics Instrumentation, behavioral event tracking, built by
-- widening the existing member_wellness_events stream (migration 63)
-- rather than adding a second, parallel tracking system or a third-party
-- analytics SDK. That table's own header already states the rule this
-- migration follows: "a future event source widens this check constraint,
-- never adds a second events table."
--
-- HARD RULE, enforced by convention in lib/analytics/track.ts and by
-- tests/product-analytics-payload-safety.test.ts: an analytics event's
-- payload is behavioral only. Event name, surface name, timestamp, member
-- id, and neutral metadata. Never a check-in answer, a pain location, a
-- sleep number, a questionnaire response, or any other health content.
-- The pre-existing wellness event types (concern_flagged and friends) do
-- carry member content and are deliberately NOT analytics events; the
-- product_analytics_events view below excludes them by name.
--
-- Every new type is additive. No existing row, index, policy, or reader
-- changes behavior.

alter table member_wellness_events drop constraint member_wellness_events_event_type_check;

alter table member_wellness_events add constraint member_wellness_events_event_type_check
  check (event_type in (
    -- Pre-existing wellness types (migration 63), unchanged, and NOT
    -- analytics: these carry real member health content.
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded',

    -- Product analytics types (this migration), behavioral only.
    'signup_completed',
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
    'membership_tier_changed',
    'purchase_completed'
  ));

-- Analytics queries slice by event_type across all members and a date
-- range, which the two existing member-scoped indexes cannot serve. The
-- existing indexes are untouched, every member-scoped read keeps using
-- them.
create index member_wellness_events_type_occurred_idx
  on member_wellness_events (event_type, occurred_at desc);

-- The one place "which types are analytics" is defined in the database,
-- so a query never has to re-list them by hand and can never accidentally
-- pull a health-content event type into an analytics report.
create or replace function public.is_product_analytics_event_type(p_event_type text)
returns boolean
language sql
immutable
as $$
  select p_event_type in (
    'signup_completed',
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
    'membership_tier_changed',
    'purchase_completed'
  );
$$;

-- The analytics read surface. Two jobs, both of which every analytics
-- query needs and neither of which the raw table can do on its own:
--   1. Excludes the health-content wellness event types by construction,
--      so an analytics report can never accidentally read member answers.
--   2. Joins profiles.is_test (migration 114) onto every row, so test
--      accounts are filterable with a plain `where is_test = false`.
--      Test-account events still write normally; the flag only makes
--      excluding them possible, per the instrumentation brief.
-- security_invoker so this view carries no privilege of its own: the
-- caller's own RLS on member_wellness_events and profiles still applies,
-- meaning a member sees only their own rows here and a platform
-- administrator sees everything, exactly as they already do on the
-- underlying tables.
create view product_analytics_events
  with (security_invoker = true) as
  select
    e.id,
    e.member_id,
    e.event_type,
    e.occurred_at,
    e.recorded_at,
    e.timezone,
    e.local_date,
    e.payload,
    e.source,
    e.source_record_id,
    coalesce(p.is_test, false) as is_test
  from member_wellness_events e
  left join profiles p on p.id = e.member_id
  where public.is_product_analytics_event_type(e.event_type);

comment on view product_analytics_events is
  'Product analytics read surface over member_wellness_events. Behavioral
   event types only (health-content wellness types are excluded by
   construction), with profiles.is_test joined on so test accounts can be
   filtered out with `where is_test = false`. See
   docs/PRODUCT_ANALYTICS.md for the query patterns, including how return
   frequency is derived from session_started.';

-- ---------------------------------------------------------------------
-- Signup: written by the database, not the app.
-- ---------------------------------------------------------------------
-- handle_new_user() (migration 17, last re-created by migration 85) is the
-- one thing that runs exactly once at account creation, before any session
-- exists, signUp() in app/actions/auth.ts cannot write this event itself
-- because the member is not authenticated at that moment (email
-- verification happens later) and RLS would reject the insert. Recording
-- it here also means an account created any other way (an admin invite, a
-- future social login) is captured with no extra code.
--
-- Wrapped in its own exception block: an analytics failure must never
-- break account creation. Every other line of this function is byte
-- identical to migration 85's version.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  insert into public.profiles (id, display_name, timezone, welcome_flow_eligible)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/New_York'),
    true
  );

  -- Hardcoded 'member', never derived from client-supplied data.
  insert into public.user_roles (user_id, role, granted_at)
  values (new.id, 'member', now());

  begin
    v_timezone := coalesce(new.raw_user_meta_data ->> 'timezone', 'America/New_York');
    insert into public.member_wellness_events (
      member_id, event_type, occurred_at, timezone, local_date, payload, source
    ) values (
      new.id,
      'signup_completed',
      now(),
      v_timezone,
      (now() at time zone v_timezone)::date,
      '{}'::jsonb,
      'system'
    );
  exception when others then
    -- Analytics is never allowed to block a signup. Swallow and continue.
    null;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Membership tier changes.
-- ---------------------------------------------------------------------
-- profiles.membership_tier (migration 69) is never written by application
-- code today, it is changed out of band (an administrator in the Supabase
-- dashboard, and, whenever billing moves in-app, a webhook). A trigger is
-- therefore the only place that can see every real tier change regardless
-- of who made it. This is the honest, available half of the "purchases"
-- requirement: an actual purchase event cannot be captured while checkout
-- runs entirely outside this application (see docs/PRODUCT_ANALYTICS.md),
-- but the tier movement a purchase produces is captured here.
create or replace function public.track_membership_tier_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  if new.membership_tier is distinct from old.membership_tier then
    begin
      v_timezone := coalesce(new.timezone, 'America/New_York');
      insert into public.member_wellness_events (
        member_id, event_type, occurred_at, timezone, local_date, payload, source
      ) values (
        new.id,
        'membership_tier_changed',
        now(),
        v_timezone,
        (now() at time zone v_timezone)::date,
        jsonb_build_object(
          'fromTier', old.membership_tier,
          'toTier', new.membership_tier
        ),
        'system'
      );
    exception when others then
      -- Never allowed to block a profile update.
      null;
    end;
  end if;
  return new;
end;
$$;

create trigger track_membership_tier_change_trigger
  after update of membership_tier on profiles
  for each row execute function public.track_membership_tier_change();

-- Same reason migration 124 exists: this migration adds a new view
-- (product_analytics_events) that @supabase/supabase-js will query
-- through PostgREST, and a `db push --db-url` run does not reliably make
-- PostgREST reload its cached schema. Without this the view exists in
-- Postgres but every REST read of it fails with PGRST205 until the
-- instance happens to restart.
notify pgrst, 'reload schema';
