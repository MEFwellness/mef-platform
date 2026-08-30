-- A coach can send this week's Weekly Reflection to any client.
--
-- WHAT WAS MISSING. Migration 189 made the Weekly Reflection a pure
-- consequence of the plan: program tier, Friday through Sunday, nobody
-- else and no other day. That is still how it arrives on its own, and
-- nothing below changes it. What it left out is the ordinary coaching
-- move, which is a coach deciding on a Tuesday that one particular client
-- should sit down and write this week. Before this table there was no way
-- to say that, so the answer to "can she have one" was the plan and only
-- the plan.
--
-- THE STANDING RULE THIS OBEYS. Access is the plan, plus a coach
-- assignment that only ever ADDS. A row here opens one week, for one
-- member, and it can never close one: a program member's automatic Friday
-- is decided by her tier exactly as before and consults nothing here, and
-- there is no row shape that takes an experience away. This is not a
-- second invisible lock, because it is not a lock at all.
--
-- ONE ROW PER MEMBER PER WEEK, AND THE DATABASE IS WHAT SAYS SO. unique
-- (member_id, week_start) IS the "no duplicates" rule, the same way it is
-- on migration 189's reflections and migration 191's delivery receipts.
-- A coach double tapping Assign, or two coaches on one caseload pressing
-- it at once, resolves to the one row that already exists. The write is an
-- insert-if-absent for that reason, never an upsert: created_at means
-- "when this week was opened for her", and an upsert would move it.
--
-- WHICH WEEK, AND WHY IT IS STILL A FRIDAY. week_start is the member's own
-- local FRIDAY, the identical key the other two tables carry, so a
-- reflection, its receipt and its assignment for one week all join on the
-- value each of them already stores. An assignment made on a Tuesday
-- belongs to the Friday that BEGAN the seven day span she is standing in
-- (lib/weekly-reflection/week.ts's mostRecentReflectionWeekStart), so it
-- delivers that same Tuesday and expires on its own when the next Friday
-- opens a genuinely new week. There is no expiry column and no scheduler:
-- the week key is the whole of the lifetime.
--
-- WHAT IT DOES NOT DO. It creates no reflection row and no draft. The
-- standing rule that no row exists in member_weekly_reflections until she
-- FINISHES is untouched, and nothing that asks "has she completed this
-- week" reads this table. It also records no delivery: whether it actually
-- reached her is still migration 191's receipt, written by her own session
-- from the surface that displayed it.
--
-- WHO WRITES IT. Only a coach this member is actively assigned to, or a
-- platform administrator. There is deliberately no member insert policy: a
-- member cannot open an experience for herself that her plan does not
-- include.

create table member_weekly_reflection_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The member's own local Friday, YYYY-MM-DD. Same key as
  -- member_weekly_reflections.week_start and
  -- member_weekly_reflection_deliveries.week_start.
  week_start date not null,

  -- The coach who sent it. Kept so the panel can say when this week was
  -- opened for her, and so a later build could say by whom.
  assigned_by uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),

  unique (member_id, week_start)
);

create index member_weekly_reflection_assignments_member_week_idx
  on member_weekly_reflection_assignments (member_id, week_start desc);

alter table member_weekly_reflection_assignments enable row level security;

-- She reads her own, because the offer she is shown is decided from it.
create policy member_read_own_reflection_assignments on member_weekly_reflection_assignments
  for select using (member_id = auth.uid());

-- Deliberately no member insert, update or delete policy. A member may not
-- open this for herself, and an assignment records a decision that was
-- already made rather than something to be edited.

create policy coach_read_assigned_reflection_assignments on member_weekly_reflection_assignments
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_reflection_assignments on member_weekly_reflection_assignments
  for insert with check (
    assigned_by = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The same narrow test-account escape hatch migrations 151, 189 and 191
-- give their own tables, and for the same reason: a verification pass has
-- to be able to assign, watch it arrive, and put the account back exactly
-- as it was found. Restricted to seeded test accounts in the database
-- itself, not only at the call site.
create policy test_member_delete_own_reflection_assignments on member_weekly_reflection_assignments
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy platform_admin_all_reflection_assignments on member_weekly_reflection_assignments
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
