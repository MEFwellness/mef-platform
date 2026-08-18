-- A REVIEW MAY RECOMMEND NOTHING.
--
-- The coach's review of the load rules rejected one behaviour outright: an
-- unreviewed pain report used to make the engine recommend "rotate
-- exercises". That is a whole-phase answer to what may be one movement on
-- one day, and it quietly rewrote a member's program because something hurt.
--
-- The engine now recommends NOTHING while a pain report is unread. It names
-- the reports, says "Coach review required", and stops. That state has to be
-- storable, because program_phase_reviews.recommended_outcome is frozen at
-- the moment the review opened and has to stay readable months later beside
-- the numbers it was made from.
--
-- THIS IS NOT A SEVENTH OUTCOME. chosen_outcome's check constraint is
-- untouched below and still allows exactly the six locked period-end
-- decisions: a coach cannot choose 'coach_review_required', and no draft is
-- ever built from it. Only the ENGINE's own recommendation may say it.
--
-- No em dashes, per the house rule.

alter table public.program_phase_reviews
  drop constraint if exists program_phase_reviews_recommended_outcome_check;

alter table public.program_phase_reviews
  add constraint program_phase_reviews_recommended_outcome_check
  check (recommended_outcome in (
    'progress_next_phase', 'rotate_exercises', 'repeat_phase',
    'recovery_week', 'different_program', 'complete_and_archive',
    'coach_review_required'
  ));

comment on column public.program_phase_reviews.recommended_outcome is
  'What the engine recommended when this review opened: one of the six locked outcomes, or coach_review_required when an unreviewed pain report meant it deliberately recommended nothing. chosen_outcome still allows only the six.';
