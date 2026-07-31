-- Adds an explicit "the coach picked this outside the slot's engine-
-- qualified candidates" flag to program-template exercises. Additive only.
--
-- The Corrective Programs coach review screen defaults its swap/add picker
-- to only exercises that satisfy lib/corrective-engine/blockQualification.ts's
-- qualifiesForBlock() for that block/blueprint combination (same rules
-- sessionBuilder.ts enforces during generation). A "show full library"
-- toggle lets the coach pick anything else — every pick made through that
-- override path is flagged here so the draft (and, if ever surfaced later,
-- the assigned workout) can visibly mark it as a coach override rather
-- than silently blending it in with the engine's own qualified picks.
--
-- Defaults to false: every pre-existing row (every template a coach has
-- ever built by hand, and every corrective-engine-generated exercise
-- already saved) is simply "not an override," which is correct — the
-- engine only ever selects qualified exercises in the first place.
alter table coach_program_template_exercises
  add column is_coach_override boolean not null default false;

comment on column coach_program_template_exercises.is_coach_override is
  'True only when a coach explicitly chose this exercise via the corrective-review "show full library" override picker instead of the slot''s engine-qualified default candidates.';
