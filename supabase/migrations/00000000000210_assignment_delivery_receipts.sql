-- The delivery receipt for a coach ASSIGNMENT.
--
-- WHAT A COACH COULD NOT TELL APART, before this. An open row in
-- assessment_assignments (migration 77) says a coach decided to send
-- something. It says nothing about whether it ever reached her. So a
-- pending assignment three days old meant one of two opposite things: she
-- was shown it and has not sat down to it, or she has not opened the app
-- since it was sent and has never seen it exists. Those call for different
-- conversations, and there was no record that could separate them.
--
-- THIS IS THE WEEKLY REFLECTION'S PATTERN, REUSED, NOT A SECOND ONE.
-- Migration 191 answered the identical question for the Weekly Reflection:
-- a separate receipt table, written once, from a mounted effect on the
-- surface that genuinely displayed the thing, never from a render and
-- never by staff. Everything below is that design applied to the one
-- ledger every coach assignment already lives in. There is deliberately no
-- second philosophy and no second vocabulary: lib/assignments/delivery.ts
-- resolves the same states lib/weekly-reflection/delivery.ts does.
--
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON assessment_assignments. Two
-- reasons, and the second is the one that matters.
--   1. That table is coach-written. Its insert and update policies are
--      "an active coach for this member", and its update policy covers the
--      whole row. A delivered_at column there would either need a member
--      update policy on a coach's ledger, which would let a member's own
--      session rewrite her assignment, or it would have to be written by
--      staff, which is exactly what a receipt may never be.
--   2. A receipt is a fact about a display, not a fact about the decision.
--      Keeping it out means nothing that asks "is this assignment open"
--      changes its answer because a receipt exists, and migration 144's
--      auto-close trigger stays the one thing that ever completes an
--      assignment.
--
-- ONCE PER ASSIGNMENT, ENFORCED BY THE DATABASE. The unique constraint on
-- assignment_id IS the once-only rule, the same way unique
-- (member_id, week_start) is in migration 191. Home can render the pop-up
-- and the persistent card in one pass, and she can reopen the app tomorrow
-- and see the card again: all of those are the same assignment, so all of
-- them resolve to one row carrying the FIRST delivered_at, never a second
-- row and never an overwrite. Re-assigning after a completion creates a
-- NEW assignment row, which correctly gets its own new receipt.
--
-- WHO WRITES IT. Only she does, from her own session, through the same
-- beacon the reflection's receipt travels on
-- (app/api/analytics/track/route.ts). There is no coach write and no
-- service write: the insert policy accepts only the signed in member's own
-- id, and only for an assignment that is genuinely hers, so no staff
-- render and no other member's session can manufacture a receipt.
--
-- TEST ACCOUNTS. A receipt for a seeded account is written normally, the
-- same as migration 191: the whole point of the fixture is to walk the
-- real experience. Nothing in lib/analytics-service/ reads this table, so
-- no figure counts it.

create table if not exists member_assignment_deliveries (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references auth.users(id) on delete cascade,

  -- The assignment that reached her. Cascades, because a receipt for an
  -- assignment that no longer exists is not a fact about anything.
  assignment_id uuid not null references assessment_assignments(id) on delete cascade,

  -- The first moment it genuinely reached her screen. Never updated: the
  -- claim is an insert-if-absent, so a second showing is a no-op rather
  -- than a newer timestamp.
  delivered_at timestamptz not null default now(),

  -- Which surface got there first. 'popup' is the Root pop-up chain,
  -- 'home_card' is the persistent card on Home that stays for as long as
  -- the assignment is open. Both are a real display to the member; the
  -- column exists so a coach's status line could later say which one, and
  -- so this stays honest about what "delivered" was.
  presentation text not null check (presentation in ('popup', 'home_card')),

  created_at timestamptz not null default now(),

  unique (assignment_id)
);

create index if not exists member_assignment_deliveries_member_idx
  on member_assignment_deliveries (member_id, delivered_at desc);

alter table member_assignment_deliveries enable row level security;

create policy member_read_own_assignment_deliveries on member_assignment_deliveries
  for select using (member_id = auth.uid());

-- HER OWN ASSIGNMENT, AND THE DATABASE CHECKS IT. Same shape as migration
-- 190's insert policy on member_stress_load_sessions: the row she names
-- has to be an assignment of her own. A hand-built POST cannot record a
-- receipt against somebody else's assignment, or against an id that is not
-- an assignment at all.
--
-- Deliberately NOT restricted to status = 'pending' here. Whether a
-- finished or cancelled assignment may take a receipt is a rule about what
-- is worth recording, not about who may write, and it is enforced in
-- app/actions/assessmentAssignments.ts beside the identical rule the
-- reflection's action applies. Putting it in the policy as well would turn
-- a receipt that raced its own completion by a few hundred milliseconds
-- into a silent refusal.
create policy member_insert_own_assignment_deliveries on member_assignment_deliveries
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
    )
  );

-- Deliberately no member update policy. A receipt records a moment that
-- already happened, and nothing in the app has a reason to move it.

-- The same narrow test-account escape hatch migrations 151, 189 and 191
-- give their own tables, and for the same reason: a verification pass has
-- to be able to see delivery happen more than once. Restricted to seeded
-- test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_assignment_deliveries on member_assignment_deliveries
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_assignment_deliveries on member_assignment_deliveries
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assignment_deliveries on member_assignment_deliveries
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
