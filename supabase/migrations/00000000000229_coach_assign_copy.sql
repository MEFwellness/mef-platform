-- ASSIGNING SOMETHING TWICE, AND SAYING WHAT HAPPENED LAST TIME.
--
-- WHAT WENT WRONG. The coach's assessment list offered an Assign button
-- only on a row in Not Yet Assigned. The moment a client finished
-- something, the row moved to Completed and the only control left on it
-- was View results, so there was no way to send it again from the screen
-- that lists it. Retaking an assessment is the whole point of a
-- reassessment comparison, and the page that draws that comparison had no
-- way to ask for the second sitting.
--
-- And when a coach did send one, the form said nothing about what had
-- already happened: whether this client was sitting on an open copy right
-- now, when it was last sent, who sent it, whether she had ever finished
-- it. A coach deciding whether to send something again needs those four
-- facts, and they were all one page scroll away in a different block.
--
-- WHAT THIS MIGRATION HOLDS. Only the words. The behaviour is in the app:
-- which instruments may be sent again, what the form shows in each of its
-- four states, and the resend that moves an open assignment's due date
-- instead of writing a second one. Every sentence a coach reads in that
-- form is a row here, so a rewording is an update and not a deploy, which
-- is the same rule body_systems_copy and whole_body_signal_copy already
-- live by.
--
-- COACH ONLY, AND STRUCTURALLY SO. There is no member select policy on
-- this table and there never may be one: these sentences talk ABOUT a
-- member to somebody else ("This is already waiting for Ebony, sent
-- Sep 12"), and a member reading her coach's working notes about her is
-- not a screen this app has.
--
-- NO EM DASH IN ANY VALUE BELOW. Commas, periods, colons and parentheses,
-- the same rule every member and coach facing sentence in this app keeps.
--
-- IT CHANGES NO INSTRUMENT. The MEF Body Systems Survey, the MEF
-- Whole-Body Signal Assessment and the Whole-Body Check-In keep every
-- table, question, band and word they have. Nothing below reads or writes
-- any of them.

-- ---------------------------------------------------------------------
-- 1. The words.
-- ---------------------------------------------------------------------

-- A token in a value is filled in by the app: {date}, {by}, {name},
-- {days}. A value carrying a token the app does not know for that key is
-- printed with the token left in it rather than guessed at, which is a
-- visible mistake rather than a silent one.
create table coach_assign_copy (
  copy_key text primary key,
  value text not null,
  /** What this line is for, and which tokens it may carry. For the coach editing it. */
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into coach_assign_copy (copy_key, value, note) values
  -- The four history lines, in the order the form prints them.
  ('assign.history_heading', 'What has happened with this one', 'The small heading over the history lines.'),
  ('assign.last_assigned', 'Last assigned {date}, by {by}.', 'Tokens: {date} the day it was last sent, {by} who sent it.'),
  ('assign.by_you', 'you', 'Fills {by} when the coach reading it is the one who sent it.'),
  ('assign.by_unknown', 'another coach', 'Fills {by} when the name of the coach who sent it cannot be read, which for a plain coach is any coach other than themselves.'),
  ('assign.last_completed', 'Last completed {date}.', 'Token: {date}. Printed when this client has ever finished it.'),
  ('assign.not_completed', 'Not completed.', 'Printed instead when this client has never finished it.'),
  ('assign.open_notice', 'This is already waiting for {name}, sent {date}.', 'Tokens: {name} the client first name, {date} the day the open one was sent.'),

  -- The one quiet line about a recent finish. No warning, no block.
  ('assign.completed_today', 'Completed today.', 'Shown when the last completion was today, in her timezone.'),
  ('assign.completed_one_day_ago', 'Completed 1 day ago.', 'The singular of the line below.'),
  ('assign.completed_days_ago', 'Completed {days} days ago.', 'Token: {days}. Shown only inside the recent window.'),

  -- The controls.
  ('assign.row_assign', 'Assign', 'The control on a row nothing has been sent for yet.'),
  ('assign.row_assign_again', 'Assign Again', 'The control on a row this client has already finished.'),
  ('assign.row_resend', 'Resend', 'The control on a row this client is sitting on right now.'),
  ('assign.row_close', 'Close', 'What the same control reads once the form under it is open.'),
  ('assign.confirm_assign', 'Assign', 'The confirm button when this will create an assignment.'),
  ('assign.confirm_resend', 'Resend', 'The confirm button when an open assignment will be moved instead.'),
  ('assign.confirm_sending', 'Sending', 'The confirm button while the assignment is being written.'),
  ('assign.confirm_resending', 'Resending', 'The confirm button while the open assignment is being moved.'),
  ('assign.resend_note', 'Resending keeps the one assignment they already have and moves its due date. Leave the date blank for seven days from today.', 'The note under a form that will resend rather than assign.')
on conflict (copy_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. One revision trail, the same shape every content bank here has.
-- ---------------------------------------------------------------------

create table coach_assign_copy_revisions (
  id uuid primary key default gen_random_uuid(),
  copy_key text not null,
  change_type text not null check (change_type in ('created', 'updated', 'retired', 'restored')),
  before jsonb,
  after jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index coach_assign_copy_revisions_key_idx
  on coach_assign_copy_revisions (copy_key, changed_at desc);

-- ---------------------------------------------------------------------
-- 3. Row level security. Staff read, coach write, and no member policy.
-- ---------------------------------------------------------------------

alter table coach_assign_copy enable row level security;
alter table coach_assign_copy_revisions enable row level security;

create policy staff_read_coach_assign_copy on coach_assign_copy
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

create policy coach_write_coach_assign_copy on coach_assign_copy
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_coach_assign_copy on coach_assign_copy
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy staff_read_coach_assign_copy_revisions on coach_assign_copy_revisions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

create policy coach_insert_coach_assign_copy_revisions on coach_assign_copy_revisions
  for insert with check (
    public.has_active_role(auth.uid(), 'coach') and changed_by = auth.uid()
  );

create policy platform_admin_all_coach_assign_copy_revisions on coach_assign_copy_revisions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
