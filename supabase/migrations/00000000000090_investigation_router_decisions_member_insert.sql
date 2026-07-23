-- Investigation Router decisions — member self-insert (Prompt 10).
--
-- Migration 89 deliberately shipped this table with no member insert
-- policy: at that point recordRouterDecision() had no caller anywhere in
-- the codebase, so a member-authenticated write was still hypothetical.
-- Prompt 10 gives it its first real caller — getMyTakeAssessmentState
-- (app/actions/assessments.ts) logs what the Root Router recommended
-- versus what the member actually chose to start, under the member's own
-- session, the exact "member agency" honesty check Method §7 step 4 calls
-- for. That write runs as the member, not a coach or admin, so it needs
-- its own insert policy — this migration adds exactly that, nothing else.
create policy member_insert_own_investigation_router_decisions on investigation_router_decisions
  for insert
  with check (member_id = auth.uid());
