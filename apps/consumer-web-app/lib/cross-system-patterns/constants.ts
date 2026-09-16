/**
 * The matching engine, named once, and the exact sentences it is allowed
 * to print.
 *
 * IT IS THE THIRD PART OF THE SAME FEATURE as lib/cross-system-signals/
 * (what a body said) and lib/cross-system-relationships/ (what the coach
 * knows). It carries the same cross_system prefix for the same reason:
 * this app already holds the Rooted Reset Whole-Body Signal Assessment
 * and the older Whole-Body Check-In, and this is neither.
 *
 * THIS IS NOT A DIAGNOSTIC ENGINE. It reads stored signals against
 * definitions a coach wrote, counts them, and surfaces the ones that meet
 * her own thresholds so she can review them. It never states a cause, a
 * condition, a diagnosis or a confirmation, and the copy lint in
 * tests/cross-system-pattern-copy.test.ts holds every shipped string in
 * this feature to the Relationship Library's own banned list.
 *
 * EVERY SENTENCE A COACH READS LIVES IN ./copy.ts, NOT HERE, and that
 * split is load bearing rather than tidiness. The evaluation half of this
 * feature is reachable from a MEMBER'S own submit, because ingesting her
 * finished sitting is the first of the three re-evaluation triggers. This
 * file, the matcher and the ledger are on that side of the line, so none
 * of them may hold a word about a pattern. The card, its headings, its two
 * display lines and the safety prompt are on the other side, reachable
 * only from a coach surface, which is asserted file by file in
 * tests/cross-system-pattern-fence.test.ts.
 */

/*
  The section's coach facing NAME is in ./copy.ts with every other word a
  coach reads. What is here is its address: two DOM ids, which are not
  sentences and are the same string whoever is looking at the page.
*/

/** The collapsible section's DOM anchor on the client detail page. */
export const WHOLE_BODY_PATTERNS_SECTION_ID = 'detail-section-whole-body-patterns';

/** The card's DOM anchor inside that section. */
export const WHOLE_BODY_PATTERNS_CARD_ID = 'detail-card-whole-body-patterns';

/**
 * The two strengths, as the engine means them.
 *
 * THEY ARE NOT LEVEL KEYS. A coach may call her levels anything, rename
 * them, delete one or add a third, so the engine never looks at a level's
 * NAME to decide which line to print. It looks at the level's PLACE in her
 * own ladder: the lowest band she defined is the emerging one, and
 * anything above it is a stronger one. See levelStrength in ./match.ts.
 */
export type PatternStrength = 'emerging' | 'stronger';


/**
 * Where a contributing signal's own sitting is read on this page.
 *
 * "LINKED BACK TO THE SITTING WHERE APPLICABLE" means this: the
 * questionnaire card that already renders that sitting, on the screen the
 * coach is already on. A coach entered signal has no sitting at all and
 * therefore gets no link, which is the honest answer rather than a link
 * that lands nowhere.
 */
export const SOURCE_CARD_ANCHORS: Record<string, string> = {
  body_systems_survey: 'detail-card-body-systems',
  whole_body_signal: 'detail-card-whole-body-signal',
  breathing_pattern_check_in: 'detail-card-breathing-check-in',
  body_assessment: 'detail-card-body-assessment',
  daily_check_in: 'detail-card-checkin-history',
};

/**
 * The named reasons an evaluation ran, matching migration 245's check
 * constraint. A re-evaluation that cannot say what triggered it is not
 * auditable.
 */
export type EvaluationReason =
  | 'sitting_ingested'
  | 'coach_signal_added'
  | 'relationship_changed'
  | 'backfill';

/**
 * The most members one relationship change re-evaluates in a single pass.
 *
 * A saved edit re-evaluates the members who actually hold one of the
 * signals that definition names, which is already a small set. The cap is
 * here so a definition written against a body system half the membership
 * reports cannot turn one button press into an unbounded sweep. The card
 * is computed live on every read, so a member past the cap still reads
 * correctly; only her ledger row waits for her next signal.
 */
export const MAX_MEMBERS_PER_RELATIONSHIP_PASS = 200;

/** How many dated entries a per signal trajectory prints. */
export const TRAJECTORY_MAX_POINTS = 4;
