-- Foundation for the future four-screen welcome flow. Adds the smallest
-- possible schema surface to track eligibility and completion, on the
-- existing profiles table rather than a second profile table.
--
-- welcome_flow_eligible: not null, defaults to false. Adding a column with
-- a false default is a metadata-only operation for every existing row, no
-- UPDATE statement runs against existing members, so this is not a bulk
-- data write. Existing members simply inherit "not eligible" as the
-- column's own default, which is exactly "existing members are never
-- unexpectedly enrolled" with no extra logic required. handle_new_user()
-- (migration 17) is updated below so brand-new signups get true going
-- forward; nothing else in the system ever sets this column, and there is
-- no backfill of any existing row.
alter table profiles
  add column welcome_flow_eligible boolean not null default false;

-- welcome_flow_completed_at: null while the flow is outstanding. Doubles as
-- the "completed" boolean (is not null) and the completion timestamp, so
-- there is no separate boolean column that could ever drift out of sync
-- with it. Nothing writes this column yet; the completion action ships
-- with the four-screen interface in a later prompt.
alter table profiles
  add column welcome_flow_completed_at timestamptz;

comment on column profiles.welcome_flow_eligible is
  'True only for members created after the welcome-flow foundation shipped.
   Set once, at signup, by handle_new_user(); nothing else ever updates it.
   Existing members default to false and are never retroactively enrolled.';

comment on column profiles.welcome_flow_completed_at is
  'Null until the member finishes the four-screen welcome flow. Presence of
   a value is the sole "completed" signal, there is no separate boolean.';

-- Re-create handle_new_user() so future signups are marked eligible at
-- creation time. This only fires on INSERT into auth.users (the trigger
-- below is unchanged), so it cannot touch any existing member's row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  return new;
end;
$$;

-- No RLS policy changes. member_read_own_profile / member_update_own_profile
-- (migration 16) already scope all of profiles, including these two new
-- columns, to id = auth.uid(): a member can read and write only their own
-- welcome-flow status, same as their existing display_name/timezone.
-- coach_read_assigned_client_profile and platform_admin_all_profiles already
-- expose the full profiles row to an assigned coach or an administrator;
-- these two columns inherit that same existing access, not a new grant.
