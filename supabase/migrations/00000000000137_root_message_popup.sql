-- Root message pop-up — per-member dismissal state for proactive Root
-- messages that expect a response or acknowledgment (today: the Core
-- Values Snapshot day-3/day-7 Weekly Experiment follow-ups; the same
-- table is meant to hold any future message of that shape too, keyed by
-- a stable message_key string rather than a foreign key to any one
-- feature's own tables).
--
-- Two escape hatches, two different lifetimes:
--   'snoozed' ("Maybe later") — the pop-up must return on the member's
--   next real login. snoozed_at records when the snooze happened so the
--   app can compare it against auth.users.last_sign_in_at (a real login
--   timestamp GoTrue itself updates on sign-in, never on a silent token
--   refresh) — if the member has signed in again since snoozed_at, the
--   snooze has expired and the pop-up is due again.
--   'ignored' ("Ignore") — permanent. The pop-up never returns for this
--   exact message; the message still renders as an ordinary card
--   wherever it already lives on the dashboard.
--
-- One row per (member, message); a fresh answer/acknowledgment deletes
-- the row entirely (see app/actions/coreValuesSnapshot.ts), so a member
-- who answers after having snoozed doesn't leave stale state behind.
create table member_root_popup_dismissals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  message_key text not null,

  status text not null check (status in ('snoozed', 'ignored')),
  snoozed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, message_key)
);

create index member_root_popup_dismissals_member_idx on member_root_popup_dismissals (member_id);

alter table member_root_popup_dismissals enable row level security;

create policy member_read_own_root_popup_dismissals on member_root_popup_dismissals
  for select
  using (member_id = auth.uid());

create policy member_insert_own_root_popup_dismissals on member_root_popup_dismissals
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_root_popup_dismissals on member_root_popup_dismissals
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy member_delete_own_root_popup_dismissals on member_root_popup_dismissals
  for delete
  using (member_id = auth.uid());

create policy platform_admin_all_root_popup_dismissals on member_root_popup_dismissals
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
