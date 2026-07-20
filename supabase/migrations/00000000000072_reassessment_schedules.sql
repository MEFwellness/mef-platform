-- Reassessment schedules.
--
-- Nothing in the current schema tracks a *scheduled* reassessment —
-- Onboarding's checkpoint_label (30_day/90_day) column is reserved but
-- unread by any scheduler (inventory risk #4), and every other system's
-- reassessment/retake is purely member-initiated with no due date. This
-- table gives a future scheduler somewhere to write to; it starts
-- completely empty (no historical schedule data exists to backfill, and
-- inventing due dates for existing members would misrepresent a feature
-- that has never actually run).
create table reassessment_schedules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  assessment_definition_id uuid not null references assessment_definitions(id),

  -- The attempt this schedule was generated from, if any (e.g. "90 days
  -- after this baseline"). Null for a schedule not anchored to a specific
  -- prior attempt.
  anchor_attempt_id uuid,

  stage text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reassessment_schedules_member_idx on reassessment_schedules (member_id, assessment_definition_id, due_at);

alter table reassessment_schedules enable row level security;

create policy member_read_own_reassessment_schedules on reassessment_schedules
  for select
  using (member_id = auth.uid());

create policy member_update_own_reassessment_schedules on reassessment_schedules
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_reassessment_schedules on reassessment_schedules
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_reassessment_schedules on reassessment_schedules
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_reassessment_schedules on reassessment_schedules
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
