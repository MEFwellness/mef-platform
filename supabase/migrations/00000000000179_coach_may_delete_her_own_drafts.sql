-- ============================================================================
-- 179. A coach may throw away her own unpublished draft.
-- ============================================================================
-- Found by the live run of migration 178's review workflow, and confirmed
-- against local Supabase: a coach pressing Discard deleted nothing and was
-- told it had worked.
--
-- coach_program_assignments has had four policies since migration 82:
-- SELECT, INSERT and UPDATE for the assigned coach, and a blanket ALL for a
-- platform administrator. There is no DELETE policy for a coach at all. A
-- DELETE that matches no policy is not an error in PostgREST, it is a
-- successful statement that affects zero rows, so
-- lib/programs/blueprints/assign.ts's discardBlueprintDraft returned true
-- and left the draft exactly where it was.
--
-- This is NOT new to the review workflow. The same function is what the
-- unified assign flow's own Discard button calls (migration 174), so a
-- coach previewing a named program and then discarding it has been leaving
-- an orphaned unpublished assignment behind since that flow shipped.
--
-- THE POLICY IS DELIBERATELY NARROW. A coach may delete an assignment only
-- when all three of these are true:
--
--   it belongs to a member she is actively coaching, which is the same
--   predicate her other three policies use;
--
--   its visibility is 'draft', so a program a member has been given is
--   never reachable by this policy;
--
--   published_at is null, which is the same fact said a second way, and is
--   the column coach_assigned_workouts' own member_read_own policy gates
--   on. Requiring both means a row that is half-published in either
--   direction cannot be deleted by a coach.
--
-- A published program is still deleted by nobody. It is superseded,
-- cancelled or completed, and it keeps its history. That rule is unchanged
-- and this policy cannot reach it.
--
-- The app is fixed in the same commit, and independently: discardBlueprintDraft
-- now reads back what it deleted and refuses to report success when rows
-- remain. Either half alone would have prevented this; both are here
-- because "no error" must never be read as "it worked".
-- ============================================================================

create policy coach_delete_own_draft_program_assignments on public.coach_program_assignments
  for delete using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and visibility = 'draft'
    and published_at is null
  );

-- ============================================================================
-- Assertions.
-- ============================================================================
do $$
declare
  v_delete_policies int;
begin
  select count(*) into v_delete_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'coach_program_assignments'
    and cmd = 'DELETE';
  if v_delete_policies <> 1 then
    raise exception 'Expected exactly 1 DELETE policy on coach_program_assignments, found %', v_delete_policies;
  end if;

  -- The policy names the three conditions. A future edit that drops any one
  -- of them fails here rather than reaching a published program.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_program_assignments'
      and cmd = 'DELETE'
      and qual like '%is_active_coach_for%'
      and qual like '%draft%'
      and qual like '%published_at IS NULL%'
  ) then
    raise exception 'The coach delete policy no longer restricts to an unpublished draft for her own client';
  end if;

  -- Nothing published became deletable.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_program_assignments'
      and cmd = 'DELETE'
      and qual not like '%published_at IS NULL%'
  ) then
    raise exception 'A DELETE policy on coach_program_assignments does not require published_at to be null';
  end if;
end $$;
