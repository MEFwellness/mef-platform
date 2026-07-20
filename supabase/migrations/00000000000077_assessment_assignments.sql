-- Assessment Assignments — the coach-assignment minimum interface.
--
-- A coach can assign any registered assessment (or a reassessment stage of
-- one) to a client: required/optional, an availability date, a due date, a
-- short reason, and can cancel it. This is deliberately its own small
-- table rather than new columns on wellness_assessments/body_assessments/
-- etc. — every one of those four source tables has a different shape and
-- RLS story (see assessment_attempts's own header comment, migration 73),
-- so a single generic assignment ledger that references the
-- assessment_definitions catalog (not any one source table) covers all
-- five existing systems without touching any of their schemas. Same
-- append-only-with-status-column pattern as reassessment_schedules
-- (migration 72), and the same coach-write RLS predicate used everywhere
-- else in this schema (has_active_role + is_active_coach_for).
create table assessment_assignments (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references auth.users(id) on delete cascade,
  assessment_definition_id uuid not null references assessment_definitions(id),
  -- Which reassessment stage this assignment is for, if any — 'standard'
  -- for a plain "please take this" assignment with no stage semantics.
  stage text not null default 'standard'
    check (stage in ('baseline', 'midpoint', 'final', 'retake', 'standard')),

  assigned_by uuid not null references auth.users(id),
  is_required boolean not null default true,
  reason text,

  available_at timestamptz not null default now(),
  due_at timestamptz,

  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_attempt_id uuid references assessment_attempts(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessment_assignments_cancelled_fields check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  )
);

create index assessment_assignments_member_idx
  on assessment_assignments (member_id, assessment_definition_id, status);

alter table assessment_assignments enable row level security;

create policy member_read_own_assessment_assignments on assessment_assignments
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_assessment_assignments on assessment_assignments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_assessment_assignments on assessment_assignments
  for insert
  with check (
    assigned_by = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Covers cancel (set status/cancelled_at/cancelled_by) and marking
-- completed when a member's attempt satisfies the assignment — both are
-- coach-initiated actions on an assignment they created for a client
-- they're still actively assigned to.
create policy coach_update_assigned_assessment_assignments on assessment_assignments
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assessment_assignments on assessment_assignments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
