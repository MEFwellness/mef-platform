-- Architecture v2.1, Section B.3.
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  domain text not null,
  target_frequency text not null check (target_frequency in ('daily', '3x_week', '5x_week')),
  active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now()
);

create index habits_user_active_idx on habits (user_id) where active = true;
