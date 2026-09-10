/**
 * The four uncertainty labels, and the one that this assessment can never
 * produce.
 *
 * Every coach facing statement in this feature carries exactly one of
 * these, rendered visibly beside it, because a coach reading decision
 * support has to be able to tell what the member reported from what the
 * responses are doing together from what that pattern may overlap with.
 *
 * 'confirmed' IS RESERVED, AND THE TYPE SAYS SO. `AssessmentUncertainty`
 * is the set of labels anything in this feature is allowed to emit, and it
 * does not include 'confirmed'. So a builder that tried to attach it would
 * not compile, rather than needing a test to notice.
 * tests/body-systems-coach-layer.test.ts asserts it anyway, over every
 * statement the coach view actually produces, because the compiler only
 * checks the code that exists today.
 *
 * The WORDS come from body_systems_copy, like every other word here. This
 * file holds the identities, not the labels.
 */

/** The four, as identities. */
export type UncertaintyLevel = 'observed' | 'pattern' | 'possible' | 'confirmed';

/** The three this assessment may emit. 'confirmed' is deliberately absent. */
export type AssessmentUncertainty = Exclude<UncertaintyLevel, 'confirmed'>;

/** The copy key holding each label's words. */
export const UNCERTAINTY_COPY_KEY: Readonly<Record<UncertaintyLevel, string>> = {
  observed: 'coach.label_observed',
  pattern: 'coach.label_pattern',
  possible: 'coach.label_possible',
  confirmed: 'coach.label_confirmed',
};

/** Every level this assessment may emit, so a test can enumerate them without guessing. */
export const ASSESSMENT_UNCERTAINTY_LEVELS: readonly AssessmentUncertainty[] = [
  'observed',
  'pattern',
  'possible',
];
