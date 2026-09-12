-- ONE MORE SENTENCE: what a finished assessment says while a newer sitting
-- is still out.
--
-- WHAT CHANGED ON THE SCREEN. A client who has finished an assessment and
-- been sent it again is two true facts at once, and until now the open
-- sitting simply won: the finished one left Completed, taking its View
-- results link with it, on the very screen a coach opens to compare the
-- two. The finished sitting now keeps its own row in Completed while the
-- new one waits in Assigned, Waiting.
--
-- WHY THAT ROW NEEDS A WORD OF ITS OWN. It cannot offer to send anything.
-- A client may hold exactly one open sitting of one assessment, which is
-- migration 144's partial unique index, so a second Assign control on the
-- same assessment could only ever write nothing and report success. The
-- row says why instead, quietly, where the control would have been.
--
-- IT IS A ROW AND NOT A LITERAL, like every other word in that form
-- (migration 229), so rewording it is an update rather than a deploy. The
-- app's fallback in lib/coach-assign/copy.ts is byte for byte this value,
-- and tests/coach-assign-copy.test.ts fails if the two ever disagree.
--
-- NO EM DASH. IT CHANGES NO INSTRUMENT and reads no member table.

insert into coach_assign_copy (copy_key, value, note) values
  ('assign.row_already_waiting', 'Already assigned, waiting', 'Stands where the send control would be, on a finished row whose assessment has a newer sitting still open. Carries no token.')
on conflict (copy_key) do nothing;
