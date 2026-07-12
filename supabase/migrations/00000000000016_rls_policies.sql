-- Architecture v2.1, Section C. RLS is enabled on every Sprint 1 table with
-- no default-allow policy: a table with RLS on and zero matching policies
-- for a given caller returns zero rows. This is deny-by-default enforced by
-- Postgres itself, not application code. Every policy below is deliberately
-- narrow — anything not explicitly granted is denied.

-- ============================================================
-- organizations
-- ============================================================
alter table organizations enable row level security;

create policy platform_admin_all_organizations on organizations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No member/coach policy exists at all in Sprint 1 — organizations is not a
-- Sprint 1 product surface, so there is nothing to grant yet.

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

create policy member_read_own_profile on profiles
  for select
  using (id = auth.uid());

create policy member_update_own_profile on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy coach_read_assigned_client_profile on profiles
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), id));

create policy platform_admin_all_profiles on profiles
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No INSERT policy for any role — profile creation happens exclusively via
-- the handle_new_user() trigger (migration 17), which runs as
-- SECURITY DEFINER and bypasses RLS by design. A client can never insert a
-- profiles row directly.

-- ============================================================
-- roles (read-only reference table)
-- ============================================================
alter table roles enable row level security;

create policy authenticated_read_roles on roles
  for select
  using (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policy for anyone except via migration — the role
-- catalog itself is not user- or even admin-editable at runtime in Sprint 1.

-- ============================================================
-- user_roles
-- ============================================================
alter table user_roles enable row level security;

create policy member_read_own_roles on user_roles
  for select
  using (user_id = auth.uid());

create policy platform_admin_all_user_roles on user_roles
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Deliberately no INSERT/UPDATE policy for member or coach — this is what
-- makes "a member cannot grant themselves a role" true at the database
-- layer. Only platform_administrator (via the FOR ALL policy above) or the
-- handle_new_user() trigger (SECURITY DEFINER, bypasses RLS) can write here.

-- ============================================================
-- consent_records
-- ============================================================
alter table consent_records enable row level security;

create policy member_read_own_consent on consent_records
  for select
  using (user_id = auth.uid());

create policy member_insert_own_consent on consent_records
  for insert
  with check (user_id = auth.uid());

create policy platform_admin_all_consent on consent_records
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No UPDATE policy for member — consent is append-only; a revocation is a
-- new row with revoked_at set via platform_administrator or a dedicated
-- revoke action (Sprint 2+), not a client-side mutation of an existing grant.

-- ============================================================
-- coach_client_assignments
-- ============================================================
alter table coach_client_assignments enable row level security;

create policy coach_read_own_assignments on coach_client_assignments
  for select
  using (coach_id = auth.uid());

create policy client_read_own_assignments on coach_client_assignments
  for select
  using (client_id = auth.uid());

create policy platform_admin_all_assignments on coach_client_assignments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No INSERT/UPDATE policy for coach or member at all. This is the exact
-- mechanism behind "no self-assignment" and "no coach-created assignments" —
-- only platform_administrator can write to this table in Sprint 1.

-- ============================================================
-- onboarding_assessment_versions / onboarding_questions (reference data)
-- ============================================================
alter table onboarding_assessment_versions enable row level security;
alter table onboarding_questions enable row level security;

create policy authenticated_read_assessment_versions on onboarding_assessment_versions
  for select
  using (auth.role() = 'authenticated');

create policy authenticated_read_questions on onboarding_questions
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_assessment_versions on onboarding_assessment_versions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy platform_admin_all_questions on onboarding_questions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- onboarding_submissions
-- ============================================================
alter table onboarding_submissions enable row level security;

create policy member_read_own_submissions on onboarding_submissions
  for select
  using (user_id = auth.uid());

create policy member_insert_own_submissions on onboarding_submissions
  for insert
  with check (user_id = auth.uid());

create policy coach_read_assigned_submissions on onboarding_submissions
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), user_id));

create policy platform_admin_all_submissions on onboarding_submissions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- onboarding_answers (ownership derived via the parent submission)
-- ============================================================
alter table onboarding_answers enable row level security;

create policy member_read_own_answers on onboarding_answers
  for select
  using (
    exists (
      select 1 from onboarding_submissions s
      where s.id = onboarding_answers.submission_id and s.user_id = auth.uid()
    )
  );

create policy member_insert_own_answers on onboarding_answers
  for insert
  with check (
    exists (
      select 1 from onboarding_submissions s
      where s.id = onboarding_answers.submission_id and s.user_id = auth.uid()
    )
  );

create policy coach_read_assigned_answers on onboarding_answers
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and exists (
      select 1 from onboarding_submissions s
      where s.id = onboarding_answers.submission_id
        and public.is_active_coach_for(auth.uid(), s.user_id)
    )
  );

create policy platform_admin_all_answers on onboarding_answers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- onboarding_baselines (table exists, population job not built this sprint)
-- ============================================================
alter table onboarding_baselines enable row level security;

create policy member_read_own_baselines on onboarding_baselines
  for select
  using (user_id = auth.uid());

create policy coach_read_assigned_baselines on onboarding_baselines
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), user_id));

create policy platform_admin_all_baselines on onboarding_baselines
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No INSERT policy for member/coach — this table is written only by the
-- (not-yet-built) baseline projection job, which will run as service_role.

-- ============================================================
-- habits
-- ============================================================
alter table habits enable row level security;

create policy member_read_own_habits on habits
  for select
  using (user_id = auth.uid());

create policy coach_read_assigned_habits on habits
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), user_id));

create policy platform_admin_all_habits on habits
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No INSERT policy for member/coach in Sprint 1 — habit assignment is
-- seeded directly (see supabase/seed/seed.sql); a coach-driven assignment
-- UI is Sprint 2+.

-- ============================================================
-- daily_checkins
-- ============================================================
alter table daily_checkins enable row level security;

create policy member_read_own_checkins on daily_checkins
  for select
  using (user_id = auth.uid());

create policy member_insert_own_checkins on daily_checkins
  for insert
  with check (user_id = auth.uid());

create policy coach_read_assigned_checkins on daily_checkins
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), user_id));

create policy platform_admin_all_checkins on daily_checkins
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No UPDATE policy for member — check-ins are append-only version history
-- (see submit_daily_checkin() in migration 19). "Editing" inserts a new
-- version row; it never mutates an existing one.

-- ============================================================
-- habit_logs
-- ============================================================
alter table habit_logs enable row level security;

create policy member_read_own_habit_logs on habit_logs
  for select
  using (user_id = auth.uid());

create policy member_insert_own_habit_logs on habit_logs
  for insert
  with check (user_id = auth.uid());

create policy member_update_own_habit_logs on habit_logs
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy coach_read_assigned_habit_logs on habit_logs
  for select
  using (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), user_id));

create policy platform_admin_all_habit_logs on habit_logs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
