-- The one switch that can turn the trial arc OFF for one account.
--
-- WHAT THE TRIAL ARC IS. A sequence of automated messages sent to somebody
-- who is on the free trial and has no relationship with the practice beyond
-- it. Which accounts it is for is decided in
-- apps/consumer-web-app/lib/trial-arc/eligibility.ts, from facts that
-- already exist. Nothing about the arc is stored per member; it is derived
-- every time it is asked for.
--
-- WHY THIS COLUMN EXISTS ANYWAY. Derivation cannot know that a particular
-- person should be left alone: somebody who wrote in upset, somebody in the
-- middle of a phone conversation with Osei, somebody who asked not to be
-- messaged. This is where that decision is recorded, and it is the only
-- stored input the arc has.
--
-- THE RULE, AND IT IS ONE DIRECTION ONLY. This column can only turn the arc
-- OFF. Nothing may ever read it to grant access, to extend a trial, to
-- lengthen a window, or to turn the arc ON for an account the derivation
-- said no to. A null here is not permission for anything; it only means
-- "nobody has silenced this account", and every other eligibility rule
-- still has to pass on its own.
--
-- WHO MAY WRITE IT. Administrators, through admin_set_trial_arc_suppression
-- below and through nothing else. No member-facing screen, server action or
-- render path writes it, and RLS on member_subscriptions has never carried
-- a member INSERT or UPDATE policy, so a member could not write it even if
-- a code path tried. tests/trial-arc-suppression-guard.test.ts fails the
-- build if a second writer appears in the source.

-- ---------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------
alter table member_subscriptions
  add column trial_arc_suppressed_at timestamptz;

comment on column member_subscriptions.trial_arc_suppressed_at is
  'When an administrator silenced the automated trial arc for this account,
   or null when nobody has. ONE DIRECTION ONLY: this column can only turn
   the trial arc OFF. Nothing may read it to grant access, extend a trial,
   move a trial window or turn the arc on, and null never means "eligible",
   only "not silenced". Written by admin_set_trial_arc_suppression() and by
   nothing else: no member-facing or render-time code path writes it.';

-- Deliberately NOT added to guard_manual_member_subscription()'s protected
-- field list. That trigger protects what an account is ENTITLED to from a
-- future billing build, and silencing a message stream changes nothing
-- about entitlement. For the same reason it is not on
-- track_member_access_change()'s list either: writing it produces no
-- membership_tier_changed event, because no tier changed.

-- ---------------------------------------------------------------------
-- 2. The one door that writes it.
-- ---------------------------------------------------------------------
-- Same shape, and the same three-times-over authorization, as migration
-- 159's admin_set_member_access: refused here by member_access_assert_admin
-- (which does not exempt the service role), refused again by the RLS policy
-- on member_subscriptions, and refused a third time by requireAdmin in the
-- server action that calls it.
--
-- Boolean in, timestamp out: the caller says on or off and the database
-- decides what "on" is stamped as, so two administrators pressing the same
-- button never disagree about the clock.
--
-- An account with no subscription row is refused rather than given one. A
-- row with no subscription is already outside the arc by rule 3 of
-- eligibility (tier trial, source system), so silently stamping a trial
-- window onto it to hold a suppression flag would be inventing an
-- entitlement in order to record a preference.
create or replace function public.admin_set_trial_arc_suppression(
  p_member_id uuid,
  p_suppressed boolean
)
returns member_subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row member_subscriptions;
begin
  perform public.member_access_assert_admin();

  if p_suppressed is null then
    raise exception 'Say whether the trial arc is suppressed or not.' using errcode = '22023';
  end if;

  update member_subscriptions s
  set trial_arc_suppressed_at = case when p_suppressed then now() else null end
  where s.member_id = p_member_id
  returning s.* into v_row;

  if v_row.member_id is null then
    raise exception 'No membership record for account %, so there is no trial arc to suppress.', p_member_id
      using errcode = '22023';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. The two read surfaces learn the column.
-- ---------------------------------------------------------------------
-- member_access_facts is what the app reads for one account. It stays
-- security_invoker, so a member reads their own row here and an
-- administrator reads everybody's, exactly as before.
create or replace view member_access_facts
  with (security_invoker = true) as
  select
    s.member_id,
    s.tier,
    s.source,
    s.status,
    s.full_access,
    s.trial_started_at,
    s.trial_ends_at,
    s.current_period_end,
    s.assigned_at,
    s.updated_at,
    coalesce(p.is_test, false) as is_test,
    s.trial_arc_suppressed_at
  from member_subscriptions s
  left join profiles p on p.id = s.member_id;

comment on view member_access_facts is
  'The facts the member app''s lock decision needs, in one read: the
   account''s subscription row and whether it is a seeded test account,
   plus the trial arc suppression stamp (migration 203), which the lock
   decision ignores entirely and only the trial arc reads. Read by
   lib/membership/service.ts. Carries no administrator note and no provider
   ids.';

-- The administrator's list gains the same column, so the panel can show
-- the current state rather than guessing at it. Dropped and recreated
-- because a `returns table` signature cannot be widened in place.
drop function if exists public.admin_list_member_access(boolean);

create function public.admin_list_member_access(
  p_include_test boolean default false
)
returns table (
  member_id uuid,
  email text,
  display_name text,
  is_test boolean,
  account_created_at timestamptz,
  tier text,
  source text,
  status text,
  full_access boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  assigned_at timestamptz,
  note text,
  trial_arc_suppressed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.member_access_assert_admin();

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.is_test,
    p.created_at,
    s.tier,
    s.source,
    s.status,
    s.full_access,
    s.trial_started_at,
    s.trial_ends_at,
    s.assigned_at,
    s.note,
    s.trial_arc_suppressed_at
  from profiles p
  join auth.users u on u.id = p.id
  left join member_subscriptions s on s.member_id = p.id
  where (p_include_test or not p.is_test)
    and not public.has_active_role(p.id, 'coach')
    and not public.has_active_role(p.id, 'platform_administrator')
  order by p.created_at;
end;
$$;

grant execute on function public.admin_set_trial_arc_suppression(uuid, boolean) to authenticated;
grant execute on function public.admin_list_member_access(boolean) to authenticated;

-- Same reason migration 159 ends this way: PostgREST caches the schema and
-- a `db push --db-url` run does not reliably make it reload, so the new
-- function and the widened list would exist in Postgres and fail every REST
-- call with PGRST202 until the instance happened to restart.
notify pgrst, 'reload schema';
