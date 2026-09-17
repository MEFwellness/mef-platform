-- =====================================================================
-- 261. ROOT NOTICED: RESTORE, THE UNDO FOR A BRIEFING REVIEW CHOICE.
--
-- A coach who marked a card Reviewed or Not relevant can Restore it to the
-- briefing. A restore is one more row in the append only review table
-- (coach, client, card, action, time, and the evidence state it was taken
-- at), so the card's history keeps the review and the restore both. No
-- earlier row is updated or deleted, and no coach ever needs a database
-- cleanup to undo a tap.
--
-- ONE CHANGE: the action check allows 'restored'. No policy changes: a
-- coach still reads and appends her own rows only, still has no update and
-- no delete policy, and a member still has no policy of any kind. Nothing
-- in Root, the Association Map, the survey mapping or the ranking reads
-- this table.
-- =====================================================================

-- The check was declared inline in 260, so Postgres named it. Every check
-- on this table that reads the action column is dropped by what it says,
-- not by a guessed name, then the one below replaces it.
do $$
declare
  existing record;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.cross_system_root_briefing_reviews'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.cross_system_root_briefing_reviews drop constraint %I', existing.conname);
  end loop;
end
$$;

alter table cross_system_root_briefing_reviews
  add constraint cross_system_root_briefing_reviews_action_check
  check (action in ('discuss_next_session', 'reviewed', 'not_relevant', 'restored'));

comment on table cross_system_root_briefing_reviews is
  'Root Noticed coach briefing: one row per review action (discuss next session, reviewed, not relevant) or restore, with the evidence state it was taken at. Append only: a restore is a new row, never a deletion. COACH ONLY: no member policy exists and none may be added.';
