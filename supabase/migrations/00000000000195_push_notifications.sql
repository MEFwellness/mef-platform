-- Push notifications, part 1: the plumbing and the one moment she is asked.
--
-- WHAT THIS DOES AND DOES NOT DO. This migration stores the devices a
-- member has said yes on, and the single preference that turns the whole
-- thing on or off for her. It schedules nothing and it sends nothing. The
-- daily decision job that decides whether there is genuinely something
-- waiting, and sends at most one reminder, is a later build. Nothing here
-- runs on a clock.
--
-- WHY THE ENDPOINT IS ITS OWN COLUMN. A browser push subscription is one
-- JSON object: an endpoint URL plus the two keys that encrypt the payload
-- for that device. The whole object is kept verbatim in `subscription`,
-- because that is what the sending library takes and anything less would
-- be this app's own idea of the shape rather than the browser's. The
-- endpoint is ALSO lifted out into its own column, because it is the only
-- part of that object that identifies the device, and two things need it
-- as a key rather than as a value buried in JSON: "this device is already
-- saved, do not save it twice", and "the push service says this device is
-- gone, revoke it".
--
-- ONE LIVE OWNER PER DEVICE, AND THE DATABASE IS WHAT SAYS SO. A push
-- subscription belongs to a browser, not to a person. Two members who
-- sign in on the same phone produce the SAME endpoint, so without a rule
-- here the first member's reminders would keep arriving on a phone the
-- second member is now holding. The partial unique index below makes that
-- impossible: at most one row per endpoint may be live at a time, and
-- public.claim_member_push_subscription is the only sanctioned way in, so
-- claiming a device always retires whoever held it before.
--
-- A ROW IS NEVER DELETED, IT IS REVOKED. revoked_at is the whole of the
-- lifetime. Turning notifications off, signing out of a device, or a push
-- service reporting an endpoint as gone all set that one column, so the
-- history of what was once enabled survives and nothing has to guess
-- whether a missing row means "never said yes" or "said yes and changed
-- her mind".

create table member_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The push service URL for this one browser on this one device. Lifted
  -- out of `subscription` on purpose, see the header.
  endpoint text not null,

  -- The browser's PushSubscription, verbatim: { endpoint, keys: { p256dh, auth } }.
  subscription jsonb not null,

  -- A plain-language "which phone is this" label, derived from the user
  -- agent at save time (for example "iPhone, Safari"). Shown to an
  -- administrator picking a device to test against, and to a member if a
  -- later build ever lists her devices. Never used to decide anything.
  device_label text,

  created_at timestamptz not null default now(),
  revoked_at timestamptz,

  -- One row per member per device, so re-enabling on a phone she already
  -- said yes on updates that row rather than growing a second one.
  unique (member_id, endpoint)
);

-- At most one LIVE row per endpoint, across all members. This is the rule
-- that stops one member's reminders reaching another member's phone.
create unique index member_push_subscriptions_live_endpoint_idx
  on member_push_subscriptions (endpoint)
  where revoked_at is null;

create index member_push_subscriptions_live_member_idx
  on member_push_subscriptions (member_id)
  where revoked_at is null;

alter table member_push_subscriptions enable row level security;

-- She reads, saves and revokes her own devices. There is deliberately no
-- delete policy: revoking is an update, and a device she once enabled is
-- part of her own record.
create policy member_read_own_push_subscriptions on member_push_subscriptions
  for select using (member_id = auth.uid());

create policy member_insert_own_push_subscriptions on member_push_subscriptions
  for insert with check (member_id = auth.uid());

create policy member_update_own_push_subscriptions on member_push_subscriptions
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- An administrator can read every device, because the admin testing tool
-- has to be able to pick one and send a real push to it, and can update
-- one, because a send that comes back "this device is gone" must be able
-- to retire it.
create policy platform_admin_all_push_subscriptions on member_push_subscriptions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- Claiming a device
-- ---------------------------------------------------------------------
-- security definer for exactly one reason: retiring the row that belongs
-- to the PREVIOUS member of this endpoint. That is another member's row,
-- so no policy a member holds could ever do it, and leaving it live is
-- the misdelivery this table exists to prevent. Everything else the
-- function does is something the caller could already do for herself.
--
-- It reads the member from auth.uid() and never takes a member id, so
-- there is no argument shape that writes somebody else's subscription.
create or replace function public.claim_member_push_subscription(
  p_endpoint text,
  p_subscription jsonb,
  p_device_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := auth.uid();
  v_id uuid;
begin
  if v_member is null then
    raise exception 'Not signed in.';
  end if;

  if p_endpoint is null or length(p_endpoint) = 0 then
    raise exception 'A push subscription needs an endpoint.';
  end if;

  -- The endpoint column and the stored JSON must agree, or the column
  -- stops being a reliable key for the JSON beside it.
  if p_subscription is null or (p_subscription ->> 'endpoint') is distinct from p_endpoint then
    raise exception 'The subscription and the endpoint must agree.';
  end if;

  update member_push_subscriptions
     set revoked_at = now()
   where endpoint = p_endpoint
     and revoked_at is null
     and member_id <> v_member;

  update member_push_subscriptions
     set subscription = p_subscription,
         device_label = p_device_label,
         revoked_at = null
   where endpoint = p_endpoint
     and member_id = v_member
  returning id into v_id;

  if v_id is null then
    insert into member_push_subscriptions (member_id, endpoint, subscription, device_label)
    values (v_member, p_endpoint, p_subscription, p_device_label)
    returning id into v_id;
  end if;

  update profiles
     set push_notifications_enabled = true
   where id = v_member;

  return v_id;
end;
$$;

comment on function public.claim_member_push_subscription(text, jsonb, text) is
  'Saves the calling member''s push subscription for one device, retires any other member''s live row for the same device, and turns her notifications preference on. The member is always auth.uid(); this can never write another member''s subscription.';

grant execute on function public.claim_member_push_subscription(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- The preference, and the one time she is asked
-- ---------------------------------------------------------------------
-- push_notifications_enabled is the single switch. It is the one thing a
-- send has to consult: off means send nothing, whatever rows exist. It
-- defaults to false because nobody has agreed to anything yet, and no
-- existing member's experience changes on deploy.
--
-- push_prompt_shown_at follows evening_reflection_reminder_shown_at
-- (migration 87) exactly: a nullable timestamp whose presence IS the
-- "already asked" signal, with no second boolean to drift out of sync. It
-- is set the moment the ask is actually put in front of her, and never
-- cleared, so she is asked once in a membership and the settings switch
-- is the only other way in from then on.
alter table profiles
  add column push_notifications_enabled boolean not null default false,
  add column push_prompt_shown_at timestamptz,
  add column push_prompt_answer text
    check (push_prompt_answer in ('enabled', 'declined', 'needs_install'));

comment on column profiles.push_notifications_enabled is
  'The member''s single on/off preference for reminders on her phone. False means send nothing, regardless of which devices are still saved. Turned on by saving a subscription, turned off by the switch in her account settings, which also revokes every saved device.';
comment on column profiles.push_prompt_shown_at is
  'Null until the one-time "want a gentle reminder" ask has actually been put in front of her after a Daily Reset. Set once, never cleared, so she is never auto-asked a second time.';
comment on column profiles.push_prompt_answer is
  'What she did with that one ask. enabled = she said yes and the browser granted permission, declined = she said no or the browser refused, needs_install = she is on an iPhone browser that cannot receive push until the app is added to the Home Screen, so she was shown how instead. Recorded for honesty about what happened; nothing reads it to decide behavior.';

-- No RLS change for profiles: member_read_own_profile /
-- member_update_own_profile (migration 16) already cover every column.
