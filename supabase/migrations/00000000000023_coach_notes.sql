-- Coach Dashboard milestone. Private coach-authored notes on a client —
-- append-only (no update/delete policy), matching the same audit-trail
-- pattern used everywhere else in this schema (consent_records,
-- coach_client_assignments, daily_checkins). Deliberately NO member-facing
-- policy of any kind, on any table, ever inserted for this table — "not
-- visible to members" is enforced by Postgres never having a rule that
-- lets member_id = auth.uid() read this table, not by the app choosing
-- not to show it.
create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

create index coach_notes_coach_client_idx on coach_notes (coach_id, client_id, created_at desc);

alter table coach_notes enable row level security;

create policy coach_read_own_notes on coach_notes
  for select
  using (coach_id = auth.uid());

-- is_active_coach_for (migration 15) — same primitive every other
-- coach-facing RLS policy already relies on, so "can this coach write a
-- note about this client" can never drift from "can this coach read this
-- client's check-ins."
create policy coach_insert_own_notes on coach_notes
  for insert
  with check (coach_id = auth.uid() and public.is_active_coach_for(auth.uid(), client_id));

create policy platform_admin_all_coach_notes on coach_notes
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
