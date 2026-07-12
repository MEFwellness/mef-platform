-- Architecture v2.1, Section B.1. Append-only — changing a client's coach is
-- a new row plus revoking the old one, never an update of coach_id in place.
create table coach_client_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id),
  client_id uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'completed')),
  start_date date not null default current_date,
  end_date date,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revocation_reason text,
  created_at timestamptz not null default now(),
  constraint coach_not_own_client check (coach_id <> client_id)
);

create index coach_client_assignments_client_idx on coach_client_assignments (client_id, status);
create index coach_client_assignments_coach_idx on coach_client_assignments (coach_id, status);
