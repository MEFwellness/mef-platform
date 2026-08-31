-- Push notifications, part 2: the daily decision job's own two records.
--
-- Part 1 (migration 195) stored the devices and the one switch. It
-- scheduled nothing. This adds the two things a scheduled job needs and
-- nothing else: a delivery receipt that makes "one a day" a fact the
-- database enforces, and the hour of her own day the job is allowed to
-- reach her at.
--
-- ---------------------------------------------------------------------
-- member_push_deliveries
-- ---------------------------------------------------------------------
--
-- MODELLED ON member_weekly_reflection_deliveries (migration 191), and
-- for the same reason: a receipt records that something REACHED her, and
-- is never a decision, a draft or an attempt. A day on which the job
-- looked and found nothing worth interrupting her for writes no row at
-- all, exactly as a week she was never shown the reflection in writes no
-- receipt. The absence of a row means "nothing was sent", which is the
-- honest reading of an empty table and the only one this schema allows.
--
-- ONE A DAY, ENFORCED BY THE DATABASE, NOT BY THE JOB. unique (member_id,
-- local_date) IS the cap. The job claims this row with an insert-if-
-- absent BEFORE it asks the push service for anything, so two runs that
-- overlap, a retried cron invocation, and an administrator pressing the
-- force-run button while the schedule is mid-flight all end with exactly
-- one send. The claim losing is not an error: it is the cap working.
--
-- WHY THE CLAIM COMES BEFORE THE SEND, AND WHY THERE IS NO RETRY. A
-- receipt written after a successful send would leave a window in which
-- the send succeeded and the receipt did not, and the only way to recover
-- from that is to send again. A second notification for one day is a
-- worse outcome than a missed one, so the row is claimed first and stands
-- whatever the push service then says. sent_device_count records what
-- actually happened, including 0, so a day that failed is legible rather
-- than invisible; nothing reads it to decide whether to try again,
-- because nothing ever tries again.
--
-- local_date is HER OWN calendar day, resolved from her stored profile
-- timezone by lib/time/localDate.ts, never a UTC date. The same key
-- member_daily_priorities uses, so today's receipt and today's priority
-- are joinable on the value both already carry.
--
-- WHAT IS RECORDED AND WHY. The rule and key of the priority that was
-- sent, so a coach or an administrator can see which of the card's rungs
-- the notification came from without re-running the engine, and so
-- "never notify about the same thing twice" stays answerable later. The
-- title as it was actually sent, because the card's own wording can
-- legitimately change during the day and a receipt that said something
-- else would be a record of a notification nobody received.
--
-- TEST ACCOUNTS. A receipt for a seeded fixture is written normally: the
-- whole point of the fixture is to walk the real path. The SCHEDULED pass
-- never selects a test account (lib/push-decision/data.ts); the
-- administrator's force-run tool deliberately does, which is how this
-- feature is provable at all. Nothing in lib/analytics-service/ reads
-- this table, so no figure counts it.

create table member_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Her own local calendar day, YYYY-MM-DD.
  local_date date not null,

  -- The moment the row was claimed, which is the moment immediately
  -- before the push service was asked. Never updated.
  sent_at timestamptz not null default now(),

  -- Which rung of the Priority Card ladder this notification carried, and
  -- that rung's own key when it has one. Recorded, never re-derived.
  priority_rule text not null,
  priority_key text,

  -- Exactly the words that were sent, and the in-app path a tap opens.
  title text not null,
  body text not null,
  url text not null,

  -- Whether this was the daily cadence or the once-a-week cadence a
  -- member drops to after five ignored notifications in a row.
  cadence text not null check (cadence in ('daily', 'weekly')),

  -- Who ran the decision: the schedule, or an administrator pressing the
  -- force-run button. Both produce a real send and a real receipt; this
  -- says which, so a fixture's receipts are tellable from a live one's.
  source text not null check (source in ('scheduled', 'admin')),

  -- How many devices the push service accepted it for. 0 is a real,
  -- recorded outcome and never a reason to try again.
  sent_device_count integer not null default 0,
  -- Devices the push service reported as gone, retired on this send.
  retired_device_count integer not null default 0,

  created_at timestamptz not null default now(),

  unique (member_id, local_date)
);

create index member_push_deliveries_member_date_idx
  on member_push_deliveries (member_id, local_date desc);

alter table member_push_deliveries enable row level security;

-- She may read her own record of what was sent to her. There is no member
-- insert or update policy: only the job writes here, through the service
-- role, so no session can manufacture or erase a receipt and thereby give
-- itself a second notification.
create policy member_read_own_push_deliveries on member_push_deliveries
  for select using (member_id = auth.uid());

-- An administrator reads every receipt, because the force-run tool has to
-- be able to say "she already had today's one notification at 9:04".
create policy platform_admin_read_push_deliveries on member_push_deliveries
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- profiles.push_send_hour_local
-- ---------------------------------------------------------------------
--
-- The hour of HER OWN day the job may reach her at, 0 to 23. Null means
-- the default, which is 9, and null is what every member has: no screen
-- writes this column in this build, and saying otherwise on a member
-- screen would be a promise with no date on it. It exists as a column
-- rather than a constant because "a fixed local time per member" is the
-- rule the job actually implements, and a rule that lives in one
-- member's row is a rule that can be answered per member without a
-- deploy.
--
-- The default is deliberately NOT a database default of 9. A stored 9 and
-- an absent value would then be indistinguishable, and the code that
-- resolves the default (lib/push-decision/window.ts) is where the answer
-- belongs, so there is one place that decides it rather than two that
-- have to agree.
alter table profiles
  add column push_send_hour_local smallint
    check (push_send_hour_local is null or (push_send_hour_local between 0 and 23));

comment on column profiles.push_send_hour_local is
  'Hour of the member''s own local day the daily notification job may send at, 0 to 23. Null means the default of 9. No screen writes this today.';
