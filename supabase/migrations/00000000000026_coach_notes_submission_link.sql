-- Lets a coach note be optionally tied to a specific assessment (baseline
-- or reassessment) instead of only ever being a general client note.
-- Nullable and on delete set null: every existing note and every general
-- note going forward has no submission link at all, and the coach_notes
-- RLS policies (migration 23) already authorize by coach_id/client_id —
-- this column doesn't need its own policy, it's just additional context
-- on a row that's already correctly gated.
alter table coach_notes
  add column onboarding_submission_id uuid references onboarding_submissions(id) on delete set null;

create index coach_notes_submission_idx on coach_notes (onboarding_submission_id);
