-- Architecture v2.1, Section B.3. checkin_id is nullable by design — a habit
-- completion need not be bundled with a full daily check-in submission.
create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  checkin_id uuid references daily_checkins(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  timezone text not null,
  local_date date not null,
  completed boolean not null,
  unique (habit_id, local_date)
);

create index habit_logs_user_date_idx on habit_logs (user_id, local_date);
