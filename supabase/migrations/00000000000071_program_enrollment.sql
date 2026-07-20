-- Program enrollment.
--
-- No program-enrollment concept exists anywhere in the current schema
-- (confirmed in the inventory: organizations/profiles.organization_id
-- exist for future multi-tenancy but are unused, and no table tracks a
-- member being "in" a program or phase). This adds the structure with no
-- historical data invented — programs is seeded with the one program name
-- this product already has a stable key for ('holistic_reset', per the
-- membership tier of the same name), program_phases and
-- program_enrollments start empty. Populating phases and enrolling real
-- members is a product/build decision for a later task, not something to
-- guess at here.
create table programs (
  key text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

insert into programs (key, display_name) values
  ('holistic_reset', 'Holistic Reset');

alter table programs enable row level security;

create policy authenticated_read_programs on programs
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_programs on programs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table program_phases (
  id uuid primary key default gen_random_uuid(),
  program_key text not null references programs(key),
  phase_key text not null,
  display_name text not null,
  phase_order int not null,

  unique (program_key, phase_key),
  unique (program_key, phase_order)
);

alter table program_phases enable row level security;

create policy authenticated_read_program_phases on program_phases
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_program_phases on program_phases
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Append-only, same pattern as coach_client_assignments (migration 6):
-- changing a member's phase is a new row referencing the same enrollment,
-- not an in-place mutation of history.
create table program_enrollments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  program_key text not null references programs(key),

  status text not null default 'active' check (status in ('active', 'completed', 'withdrawn')),
  current_phase_key text,

  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,

  coach_id uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite FK, not a single-column reference to program_phases.phase_key
  -- (that column is only unique per-program, not globally) — this also
  -- guarantees a member's current phase always belongs to their own
  -- enrolled program.
  constraint program_enrollments_current_phase_fk
    foreign key (program_key, current_phase_key)
    references program_phases (program_key, phase_key)
);

create index program_enrollments_member_idx on program_enrollments (member_id, program_key);

alter table program_enrollments enable row level security;

create policy member_read_own_program_enrollments on program_enrollments
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_program_enrollments on program_enrollments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_program_enrollments on program_enrollments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
