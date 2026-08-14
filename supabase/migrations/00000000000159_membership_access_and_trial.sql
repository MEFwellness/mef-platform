-- Membership tiers, the 30 day trial clock, and manual access control.
--
-- WHAT THIS IS FOR. People are signing up for 30 days free and nothing in
-- the product has ever known what a trial is, so nothing stops anyone on
-- day 31. Payment happens outside this application (external Stripe links
-- on Leadpages, and Zelle, which never touches a checkout at all), so the
-- only thing that can decide access today is Osei, by hand. This migration
-- builds the entitlement layer he runs it through, and shapes it so the
-- later in-app billing build plugs into the same rows instead of replacing
-- them.
--
-- WHY A NEW TABLE AND NOT profiles.membership_tier. That column (migration
-- 69) already exists and is already read: it is the minimum-tier input to
-- the assessment registry's gating (lib/assessment-registry/membership.ts,
-- min_membership on registry entries), on an entirely different vocabulary
-- (free_trial / membership / holistic_reset). Repurposing it would have
-- silently rewritten which assessments every member can open. It is left
-- exactly as it is, along with its own membership_tier_changed trigger from
-- migration 146. This is a layer above the questionnaire gating, not a
-- replacement for it.
--
-- ENTITLEMENTS ARE TIED TO THE ACCOUNT. One row per account, keyed by the
-- account id. Nothing here is read from, written to, or derived from a
-- session, a cookie, or a JWT claim. Signing out and back in, on any
-- device, cannot change what an account is entitled to.
--
-- NO NEW EVENT TYPES. Tier movement is recorded as membership_tier_changed,
-- the type migration 146 already added and docs/PRODUCT_ANALYTICS.md
-- already documents. The lock screen records paywall_viewed. Both already
-- exist; this migration adds no event type and no second event table.

-- ---------------------------------------------------------------------
-- 1. The tier catalog.
-- ---------------------------------------------------------------------
-- Same small text-keyed reference table shape as `roles` (migration 3) and
-- `membership_tiers` (migration 69). Named member_access_tiers rather than
-- reusing membership_tiers because it is a genuinely different vocabulary
-- answering a different question: membership_tiers answers "which
-- assessments may this member open", this answers "may this member open the
-- app at all".
create table member_access_tiers (
  key text primary key,
  display_name text not null,
  -- Ordering only, for presentation and for "at least this tier"
  -- comparisons a later build may want. Access is NOT decided by rank.
  rank int not null unique,
  -- Whether this tier is an access-granting tier at all. 'trial' is true
  -- here and still additionally requires its own window to be open: the
  -- trial clock is a date range, not a tier property. The one place that
  -- decides access from all of these facts together is
  -- lib/membership/access.ts's decideMemberAccess().
  grants_access boolean not null,
  description text not null
);

insert into member_access_tiers (key, display_name, rank, grants_access, description) values
  ('none',    'No access',       0, false, 'Expired or ended. The account keeps every row of its data and can still sign in, it just cannot open the member app.'),
  ('trial',   '30 day trial',    1, true,  'The free 30 day trial, granted automatically at account creation. Grants access while the trial window is still open.'),
  ('monthly', 'Monthly',         2, true,  'A monthly membership, however it was paid for.'),
  ('annual',  'Annual',          3, true,  'An annual membership, however it was paid for.'),
  ('program', '24 week program', 4, true,  'The 24 week coaching program.');

alter table member_access_tiers enable row level security;

create policy authenticated_read_member_access_tiers on member_access_tiers
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_member_access_tiers on member_access_tiers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 2. One subscription row per account.
-- ---------------------------------------------------------------------
create table member_subscriptions (
  -- The primary key IS the account. One account, one entitlement state,
  -- and no way to express a second one.
  member_id uuid primary key references auth.users(id) on delete cascade,

  tier text not null references member_access_tiers(key),

  -- HOW this state was arrived at.
  --   manual  Osei assigned it by hand, for someone who paid by Zelle, by
  --           an external Stripe link, or for someone he is simply
  --           granting access to. Protected: see the guard trigger below.
  --   billing Reserved for the later in-app billing build. Nothing writes
  --           it today. The app treats it exactly like manual.
  --   system  The untouched 30 day trial this migration and
  --           handle_new_user() stamp at account creation. Never assigned
  --           by a person, and the only source a later billing build is
  --           free to convert.
  --
  -- The brief names two values, manual and billing, and both are here
  -- meaning exactly what it says. 'system' exists because the automatic
  -- trial is neither of them: calling it 'manual' would have frozen every
  -- trial account under the protection rule below, so the future billing
  -- build could never convert a trial into a paid subscription, which is
  -- the single most important thing it will need to do.
  source text not null check (source in ('manual', 'billing', 'system')),

  -- The assignment's own lifecycle, so the later billing build has
  -- somewhere to put a cancellation or a failed renewal without a schema
  -- change. Whether the member can actually open the app is decided from
  -- this together with tier, full_access and the trial window, never from
  -- this alone.
  status text not null check (status in ('active', 'expired', 'canceled')),

  -- The manually assignable "everything is open" grant, for clients like
  -- existing monthly coaching members who pay outside the app entirely and
  -- should simply have the whole platform. Independent of tier on purpose:
  -- it answers a different question and it wins over every lock.
  full_access boolean not null default false,

  -- The trial clock. Always populated, for every account, whatever tier it
  -- is on: the trial is a fact about when the account was created, not a
  -- property of its current tier. Extending a trial moves trial_ends_at.
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,

  -- Left null by everything in this build. Here so the billing build has
  -- somewhere to put a renewal date and its provider ids without altering
  -- this table, per the brief's "design the entitlement layer to accept it
  -- cleanly".
  current_period_end timestamptz,
  external_customer_id text,
  external_subscription_id text,

  -- Who assigned it and when, for a manual assignment. Null for the
  -- automatic trial, which nobody assigned.
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  -- Osei's own note, e.g. "paid by Zelle 12 Aug". Administrator-entered
  -- text about a business arrangement. It is never read by the member app,
  -- never rendered on a member screen, and never reaches an analytics
  -- payload.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_subscriptions_trial_window_check check (trial_ends_at >= trial_started_at)
);

comment on table member_subscriptions is
  'One row per account: which access tier it is on, how that was granted,
   its status, whether it holds a full_access grant, and its 30 day trial
   window. Entitlement is tied to the account, never to a session. The
   decision this feeds is lib/membership/access.ts''s decideMemberAccess().';

create index member_subscriptions_tier_status_idx on member_subscriptions (tier, status);
create index member_subscriptions_trial_ends_idx on member_subscriptions (trial_ends_at);

alter table member_subscriptions enable row level security;

-- A member may read their own entitlement and nothing else about it. There
-- is deliberately no member insert, update or delete policy: a member can
-- see what they are on, and can never change it.
create policy member_read_own_subscription on member_subscriptions
  for select
  using (member_id = auth.uid());

create policy platform_admin_all_member_subscriptions on member_subscriptions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3. A manual assignment can only be changed by the admin panel.
-- ---------------------------------------------------------------------
-- The brief's hard rule: "The future billing build must never modify or
-- downgrade a manual assignment." Stating that in a comment would not have
-- held it, so it is enforced at the table.
--
-- HOW. admin_set_member_access() below sets a transaction-local marker
-- before it writes. This trigger rejects any change to the entitlement
-- fields of a row whose source is 'manual' when that marker is absent. A
-- future Stripe webhook writing through the service role, a maintenance
-- script, or an ordinary UPDATE from anywhere in this codebase is
-- therefore rejected by Postgres itself, not by remembering not to.
--
-- WHAT IT DOES NOT CLAIM. A database superuser can drop this trigger, and
-- no trigger can defend against that. What it does defend against is the
-- realistic failure: a later build, written months from now by someone
-- reading a Stripe webhook payload, quietly overwriting an arrangement
-- Osei made by hand with a customer who pays by Zelle.
-- security definer purely so the DELETE branch below can look at auth.users
-- whoever the caller is. It grants no ability to anyone: this function only
-- ever refuses a write or lets it proceed to the policies that were always
-- going to decide it.
create or replace function public.guard_manual_member_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_write boolean := coalesce(current_setting('mef.access_admin_write', true), 'off') = 'on';
begin
  if v_admin_write then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- An account being deleted takes its entitlement row with it, and must
    -- always be able to. Confirmed by hand against a real cascade: when
    -- auth.users is the thing being deleted, the parent row is already gone
    -- by the time this trigger runs on the child, so "the account still
    -- exists" is exactly the difference between somebody deleting an
    -- assignment and an account deletion carrying it away. Without this,
    -- deleting any manually assigned member's account fails outright, which
    -- is how this was found.
    if old.source = 'manual' and exists (select 1 from auth.users where id = old.member_id) then
      raise exception 'A manual membership assignment can only be changed through the admin member access panel.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.source = 'manual' then
      raise exception 'A manual membership assignment can only be created through the admin member access panel.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. Only a row that is already manual is protected, and only its
  -- entitlement fields. Bookkeeping columns (the billing build's provider
  -- ids, updated_at) are deliberately not on this list so a later build can
  -- still record what its provider told it without being able to change
  -- what the member is entitled to.
  if old.source = 'manual' and (
       new.tier is distinct from old.tier
    or new.source is distinct from old.source
    or new.status is distinct from old.status
    or new.full_access is distinct from old.full_access
    or new.trial_started_at is distinct from old.trial_started_at
    or new.trial_ends_at is distinct from old.trial_ends_at
  ) then
    raise exception 'A manual membership assignment can only be changed through the admin member access panel.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_manual_member_subscription_trigger
  before insert or update or delete on member_subscriptions
  for each row execute function public.guard_manual_member_subscription();

-- ---------------------------------------------------------------------
-- 4. The trial clock, stamped at account creation.
-- ---------------------------------------------------------------------
-- 30 days, in one place, so the database and the tests cannot disagree
-- about it. lib/membership/access.ts holds the same number for the app,
-- and tests/membership-access-integration.test.ts asserts the row this
-- function stamps is exactly TRIAL_LENGTH_DAYS long.
create or replace function public.member_trial_length_days()
returns integer
language sql
immutable
as $$ select 30; $$;

-- Backfill, before the change trigger exists so that stamping several
-- thousand historical accounts does not write several thousand analytics
-- events describing a change that never happened.
--
-- Trial start is the account's ORIGINAL signup date, exactly as the brief
-- says, for every account including test accounts. An account created more
-- than 30 days ago is therefore past its trial the moment this ships, which
-- is the intended and stated consequence. Test accounts are protected from
-- that lockout by the decision rule in lib/membership/access.ts rather than
-- by being given a dishonest signup date here: an is_test account with no
-- assignment of its own is never locked out by the clock.
insert into member_subscriptions (
  member_id, tier, source, status, trial_started_at, trial_ends_at
)
select
  p.id,
  'trial',
  'system',
  'active',
  p.created_at,
  p.created_at + (public.member_trial_length_days() || ' days')::interval
from profiles p
on conflict (member_id) do nothing;

-- Every account created from here on. handle_new_user() is the one thing
-- that runs exactly once per account, whatever path created it, and it
-- already carries the same pattern for the signup_completed event
-- (migration 146). Every other line of this function is byte identical to
-- migration 146's version.
--
-- Wrapped in its own exception block for the same reason that one is:
-- nothing in here may ever break account creation. A signup that somehow
-- fails to get a subscription row still gets an account, and
-- decideMemberAccess() treats a missing row as full access rather than as
-- a lockout, so the failure mode is a member who keeps their app, never a
-- member shut out by a bug.
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

  begin
    insert into public.member_subscriptions (
      member_id, tier, source, status, trial_started_at, trial_ends_at
    ) values (
      new.id,
      'trial',
      'system',
      'active',
      now(),
      now() + (public.member_trial_length_days() || ' days')::interval
    );
  exception when others then
    -- The trial stamp is never allowed to block a signup either. A member
    -- with no subscription row keeps the whole app (see
    -- decideMemberAccess), so failing here costs a trial clock, never a
    -- member's access.
    null;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Tier changes are recorded, whoever made them.
-- ---------------------------------------------------------------------
-- Reuses membership_tier_changed (migration 146). No new event type, and
-- the same fromTier/toTier payload shape the analytics layer already
-- understands, so docs/PRODUCT_ANALYTICS.md's existing tier queries pick
-- these up with no change.
--
-- Fires on a change to any entitlement field, not only to `tier`, because
-- granting full_access or extending a trial are real changes to what
-- somebody has and Osei needs them on the record. When only full_access or
-- the trial window moved, fromTier and toTier are equal, which is honest:
-- the tier genuinely did not move.
--
-- The payload carries tier keys and nothing else, exactly as the payload
-- contract in packages/shared-types-contracts/src/events.types.ts requires.
-- The administrator's note never travels here.
create or replace function public.track_member_access_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_from text;
begin
  if tg_op = 'UPDATE' and not (
       new.tier is distinct from old.tier
    or new.status is distinct from old.status
    or new.full_access is distinct from old.full_access
    or new.trial_started_at is distinct from old.trial_started_at
    or new.trial_ends_at is distinct from old.trial_ends_at
  ) then
    return new;
  end if;

  -- The automatic trial stamp at account creation is not a tier change:
  -- the account never held another tier, and signup already has its own
  -- event (signup_completed). Recording one here would put a second row on
  -- every single signup describing a movement that never happened.
  if tg_op = 'INSERT' and new.source = 'system' then
    return new;
  end if;

  begin
    v_from := case when tg_op = 'UPDATE' then old.tier else null end;
    select coalesce(timezone, 'America/New_York') into v_timezone
      from public.profiles where id = new.member_id;
    v_timezone := coalesce(v_timezone, 'America/New_York');

    insert into public.member_wellness_events (
      member_id, event_type, occurred_at, timezone, local_date, payload, source
    ) values (
      new.member_id,
      'membership_tier_changed',
      now(),
      v_timezone,
      (now() at time zone v_timezone)::date,
      jsonb_build_object('fromTier', v_from, 'toTier', new.tier),
      'system'
    );
  exception when others then
    -- Never allowed to block an access change. Osei changing someone's
    -- tier must always succeed, even if the event write cannot.
    null;
  end;

  return new;
end;
$$;

create trigger track_member_access_change_trigger
  after insert or update on member_subscriptions
  for each row execute function public.track_member_access_change();

-- updated_at, kept true without asking every writer to remember it.
create or replace function public.touch_member_subscription()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_member_subscription_trigger
  before update on member_subscriptions
  for each row execute function public.touch_member_subscription();

-- ---------------------------------------------------------------------
-- 6. The read surface the app uses.
-- ---------------------------------------------------------------------
-- One round trip for the two facts the lock decision needs: the
-- subscription row, and whether the account is a seeded test account.
-- security_invoker, so it carries no privilege of its own: a member sees
-- their own row here because the policies above already let them, and a
-- platform administrator sees every row for the same reason.
create view member_access_facts
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
    coalesce(p.is_test, false) as is_test
  from member_subscriptions s
  left join profiles p on p.id = s.member_id;

comment on view member_access_facts is
  'The two facts the member app''s lock decision needs, in one read: the
   account''s subscription row and whether it is a seeded test account.
   Read by lib/membership/service.ts. Carries no administrator note and no
   provider ids.';

-- ---------------------------------------------------------------------
-- 7. The administrator's own entry points.
-- ---------------------------------------------------------------------
-- Every function below refuses anyone who is not an authenticated platform
-- administrator, and asks that question through the same has_active_role()
-- function the RLS policies themselves call, so the panel and the real
-- boundary cannot drift apart about what an active grant is.
--
-- Deliberately NOT exempting the service role, unlike
-- analytics_assert_admin() (migration 149). The service role is precisely
-- what a future in-app Stripe webhook in this application would run as, and
-- letting it through here would hand it the one key that opens a manual
-- assignment. A real administrator, signed in, is the only caller.
create or replace function public.member_access_assert_admin()
returns void
language plpgsql
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Member access control requires a signed in platform administrator.'
      using errcode = '42501';
  end if;

  if not public.has_active_role(auth.uid(), 'platform_administrator') then
    raise exception 'Member access control requires the platform_administrator role.'
      using errcode = '42501';
  end if;
end;
$$;

-- Assign, grant, extend, expire. One entry point, because every one of
-- those is the same write with different fields set, and because a single
-- door is what makes the guard trigger above a real boundary rather than a
-- speed bump.
--
-- A null argument means "leave this alone", so the panel can grant
-- full_access without also having to restate the tier, and extend a trial
-- without touching anything else.
create or replace function public.admin_set_member_access(
  p_member_id uuid,
  p_tier text default null,
  p_full_access boolean default null,
  p_status text default null,
  p_trial_ends_at timestamptz default null,
  p_extend_trial_days integer default null,
  p_note text default null
)
returns member_subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row member_subscriptions;
  v_now timestamptz := now();
begin
  perform public.member_access_assert_admin();

  if not exists (select 1 from auth.users where id = p_member_id) then
    raise exception 'No such account: %', p_member_id using errcode = '22023';
  end if;

  if p_tier is not null and not exists (select 1 from member_access_tiers where key = p_tier) then
    raise exception 'Unknown access tier: %', p_tier using errcode = '22023';
  end if;

  if p_status is not null and p_status not in ('active', 'expired', 'canceled') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;

  -- The marker the guard trigger looks for. Transaction local (the third
  -- argument), so it lasts exactly as long as this one statement's
  -- transaction and can never leak into another request.
  perform set_config('mef.access_admin_write', 'on', true);

  -- An account with no row yet (created before this migration ran and
  -- somehow missed the backfill, or one whose stamp failed) gets one now,
  -- with a trial window starting from its own signup date so the clock
  -- stays honest.
  insert into member_subscriptions (member_id, tier, source, status, trial_started_at, trial_ends_at)
  select
    p_member_id,
    'trial',
    'system',
    'active',
    coalesce(p.created_at, v_now),
    coalesce(p.created_at, v_now) + (public.member_trial_length_days() || ' days')::interval
  from (select created_at from profiles where id = p_member_id) p
  on conflict (member_id) do nothing;

  update member_subscriptions s
  set
    tier = coalesce(p_tier, s.tier),
    full_access = coalesce(p_full_access, s.full_access),
    status = coalesce(p_status, s.status),
    trial_ends_at = coalesce(
      p_trial_ends_at,
      case when p_extend_trial_days is null then null
           else greatest(s.trial_ends_at, v_now) + (p_extend_trial_days || ' days')::interval
      end,
      s.trial_ends_at
    ),
    note = coalesce(p_note, s.note),
    -- Every write through this function is, by definition, a manual
    -- assignment by an administrator. That is what puts the row under the
    -- guard trigger's protection.
    source = 'manual',
    assigned_by = auth.uid(),
    assigned_at = v_now
  where s.member_id = p_member_id
  returning s.* into v_row;

  perform set_config('mef.access_admin_write', 'off', true);

  if v_row.member_id is null then
    raise exception 'No profile row for account %, cannot set access.', p_member_id using errcode = '22023';
  end if;

  return v_row;
end;
$$;

-- Expiring someone is three fields that must move together, so it gets its
-- own door rather than trusting every future caller to set all three. It
-- clears full_access on purpose: "expire this member" that quietly left a
-- full access grant standing would do nothing at all.
create or replace function public.admin_expire_member_access(
  p_member_id uuid,
  p_note text default null
)
returns member_subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.member_access_assert_admin();
  return public.admin_set_member_access(
    p_member_id := p_member_id,
    p_tier := 'none',
    p_full_access := false,
    p_status := 'expired',
    p_note := p_note
  );
end;
$$;

-- The panel's list. A security definer function rather than a view because
-- it reads auth.users for the email address, which is the only reliable way
-- for Osei to tell one member from another: profiles has a display name that
-- is often null and never an email.
--
-- Returns members only. An account holding an active coach or platform
-- administrator grant is staff, never sees a member screen (migration 158's
-- companion, lib/auth/staffRouting.ts) and therefore has no access state
-- worth assigning.
create or replace function public.admin_list_member_access(
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
  note text
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
    s.note
  from profiles p
  join auth.users u on u.id = p.id
  left join member_subscriptions s on s.member_id = p.id
  where (p_include_test or not p.is_test)
    and not public.has_active_role(p.id, 'coach')
    and not public.has_active_role(p.id, 'platform_administrator')
  order by p.created_at;
end;
$$;

grant execute on function public.member_trial_length_days() to authenticated;
grant execute on function public.admin_set_member_access(uuid, text, boolean, text, timestamptz, integer, text) to authenticated;
grant execute on function public.admin_expire_member_access(uuid, text) to authenticated;
grant execute on function public.admin_list_member_access(boolean) to authenticated;

-- Same reason migrations 124 and 146 end this way: this migration adds a
-- table, a view and three functions that @supabase/supabase-js reaches
-- through PostgREST, and a `db push --db-url` run does not reliably make
-- PostgREST reload its cached schema. Without this they exist in Postgres
-- but every REST call fails with PGRST202/PGRST205 until the instance
-- happens to restart.
notify pgrst, 'reload schema';
