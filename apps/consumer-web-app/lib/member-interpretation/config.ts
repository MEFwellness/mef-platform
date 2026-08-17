/**
 * Member Interpretation Layer — every tunable number, in one file.
 *
 * The audit found nine systems each deciding independently how much
 * evidence was "enough", with no two of them agreeing. This file is the
 * one place those numbers live now, so they can be tuned without touching
 * any logic, any copy, or any screen.
 *
 * Every constant below has a comment saying what it means and why it is
 * the value it is. Nothing here is a magic number.
 */

/**
 * How many DISTINCT member-provided evidence events a finding needs before
 * it stops being a single observation and becomes an emerging one.
 *
 * Two, because two is the smallest number that can be a repeat at all. The
 * existing three-tier language module (lib/longitudinal-intelligence/copy.ts)
 * already draws its own first line at exactly this point ("You mentioned
 * this once" -> "This has shown up more than once"), and two systems that
 * disagree about what a repeat is would put two different sentences about
 * the same signal on two different screens.
 */
export const EVENTS_FOR_EMERGING_PATTERN = 2;

/**
 * How many DISTINCT days the member has logged a check-in touching this
 * signal before it may be described as established.
 *
 * Five. The label itself says "repeated check-ins", so the count is of
 * check-in days specifically, not of any evidence: five assessments in one
 * afternoon is not five days of living with something. Five is also
 * comfortably below the seven-day trend floor below, which is deliberate:
 * a signal can be treated as real slightly before the app is willing to
 * draw a direction through it.
 */
export const CHECKIN_DAYS_FOR_SUPPORTED = 5;

/**
 * The data floor. Below this many distinct member-logged days, the app may
 * not call anything a strength or a problem, for the member as a whole or
 * for any one domain.
 *
 * Seven, because seven is the number this app already tells members is
 * enough. The Trends panel on Progress says, in its own words, "Your trend
 * and typical-day view appear once you have 7." A verdict elsewhere built
 * on three days would contradict a sentence the member can read on another
 * screen the same morning.
 *
 * This is the specific guard against the audit's sharpest example: "Your
 * recovery is a real strength" printed from three check-ins over a
 * recovery score of 50 out of 100.
 */
export const MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM = 7;

/**
 * The minimum distinct logged days behind a domain before the layer will
 * describe that domain's state at all, rather than saying it is early.
 *
 * Three. Lower than the strength/problem floor on purpose: "here is what
 * you have logged so far" is a much weaker claim than "this is a strength",
 * and holding both to the same bar would leave a member two weeks in with a
 * blank map. Below three, the domain says it is early, in the Case View
 * voice.
 */
export const MIN_LOGGED_DAYS_FOR_DOMAIN_STATE = 3;

/**
 * How many days back the layer counts member-logged evidence.
 *
 * Twenty-one, matching lib/root-map/coverage.ts's COVERAGE_WINDOW_DAYS
 * exactly, so a Root Map card reading "4 of 21 days logged" and a tier
 * computed from those same days can never be counting different windows.
 */
export const EVIDENCE_WINDOW_DAYS = 21;

/**
 * The four tier labels, exactly as a member reads them. There are four and
 * there will only ever be four; adding a fifth means changing what the app
 * promises about its own certainty, which is not a config change.
 */
export const TIER_LABEL = {
  early_indication: 'Early indication',
  emerging_pattern: 'Emerging pattern',
  supported_by_checkins: 'Supported by repeated check-ins',
  coach_verified: 'Coach verified',
} as const;

/**
 * One plain sentence per tier, for a member who taps the label and wants to
 * know what it means. No percentages, no scores, no formula.
 */
export const TIER_MEANING = {
  early_indication:
    'This comes from a single answer or a few days of data. It points in a direction, it is not a conclusion.',
  emerging_pattern: 'This has come up more than once. Not enough yet to lean on.',
  supported_by_checkins:
    'This has come up across enough of your logged days to be treated as real.',
  coach_verified: 'Your coach has looked at this and confirmed it.',
} as const;
