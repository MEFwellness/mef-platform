-- ---------------------------------------------------------------------
-- Two test-account-only delete policies, so the movement flip can be
-- verified on a live production account.
-- ---------------------------------------------------------------------
--
-- WHY THIS IS SEPARATE FROM 155. Migration 155 was already applied to
-- production when these turned out to be needed, and an applied migration
-- is a historical record rather than a file to edit. So the policies get
-- their own version, which is also the honest reading: 155 widened a
-- constraint and touched no policy, and this one touches only policies.
--
-- WHY THEY EXIST. The card claims one priority per member per local day and
-- never rewrites it (migration 147's insert-if-absent rule). That is correct
-- behavior and it is also unverifiable on demand: a live verification pass
-- cannot wait until tomorrow to watch the next claim, and it cannot prove
-- "a session is offered once the Daily Reset is done" on a day whose
-- priority was claimed before the reset was finished.
--
-- The route that uses them (app/api/test-only/movement-priority-reset)
-- clears TODAY'S OWN claim so the next render runs the real engine over her
-- real data. It composes nothing, fabricates nothing, and completes nothing.
--
-- WHY THIS SHAPE. It is EXACTLY the shape migration 151 established for the
-- weekly review's own force-redelivery path, deliberately rather than
-- coincidentally: the restriction to test accounts lives in the database as
-- well as in the route handler, so it survives someone forgetting it at a
-- call site. Both tables remain undeletable by a real member, by a coach,
-- and by any session whose profiles.is_test is not true. Neither policy
-- grants a read, an insert or an update that did not already exist, and no
-- row is touched by applying this.
-- ---------------------------------------------------------------------

create policy test_member_delete_own_daily_priorities on member_daily_priorities
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy test_member_delete_own_coaching_decisions on member_coaching_decisions
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );
