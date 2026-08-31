/**
 * The public entry experience (migration 197): the acquisition surface an
 * anonymous visitor reaches before any account exists, and the funnel that
 * measures it.
 *
 * THE RULE THESE TYPES CARRY. A `PublicEntryAnswer` is a preliminary public
 * impression given by a stranger. It is never an assessment answer, never a
 * prerequisite, and never an input to a scoring engine. Nothing here shares
 * a type with `OnboardingAnswerInput`, `DailyCheckinInput` or
 * `UnifiedAssessmentAnswer` on purpose: two shapes that never unify cannot
 * be passed to each other's functions by accident.
 */

/** The only experience that exists today. A second topic would add a key here and its own question set. */
export type PublicEntryExperienceKey = 'energy_map';

/** How a source reaches us. One row per individual partner, so two partners on the same channel stay tellable apart. */
export type PublicEntrySourceChannel =
  | 'partner'
  | 'client'
  | 'network'
  | 'social'
  | 'corporate'
  | 'direct'
  | 'qa';

export interface PublicEntrySource {
  code: string;
  label: string;
  channel: PublicEntrySourceChannel;
  isTest: boolean;
  active: boolean;
  notes: string | null;
}

/**
 * The observational pattern vocabulary, deliberately the SAME set the lead
 * capture agent has used since migration 123 (`LeadPatternName`). A lead
 * that arrives through the chat widget and a lead that arrives through this
 * experience name the same thing the same way on a coach's screen, and the
 * database check constraint on `public_entry_sessions.pattern_key` is the
 * same list.
 */
export type PublicEntryPatternKey =
  | 'recovery_deficit'
  | 'compensation_pattern'
  | 'overload_pattern'
  | 'fuel_timing_pattern'
  | 'depletion_pattern'
  | 'wind_down_deficit'
  | 'rhythm_disruption'
  | 'stress_loading_pattern';

/**
 * One answer. Both halves are short slugs from the question's own fixed
 * option list, matching the database's own regex checks. There is no
 * free-text answer anywhere in this experience, so a stranger cannot type a
 * health disclosure into a table with no session and no clinical review
 * behind it.
 */
export interface PublicEntryAnswer {
  questionKey: string;
  answerValue: string;
}

/** The anonymous half of the funnel. Behavioral only; `detail` is a short neutral slug or nothing. */
export type PublicEntryEventType =
  | 'entry_viewed'
  | 'experience_started'
  | 'chapter_completed'
  | 'experience_completed'
  | 'result_engaged'
  | 'notes_unlocked'
  | 'app_clicked';

export interface PublicEntrySessionRecord {
  id: string;
  visitorToken: string;
  experienceKey: PublicEntryExperienceKey;
  sourceCode: string | null;
  sourceRaw: string | null;
  landingPath: string | null;
  referrerHost: string | null;
  firstSeenAt: string;
  startedAt: string | null;
  completedAt: string | null;
  patternKey: PublicEntryPatternKey | null;
  leadEmail: string | null;
  leadCapturedAt: string | null;
}

/**
 * What a member's account knows about where she came from.
 *
 * `origin` and `preliminary` are check-constrained to single values in the
 * database (see migration 197), so this shape can only ever describe a
 * preliminary public impression. Root may honestly say "this is what you
 * told us when you first arrived". Nothing may present it as a completed
 * in-app assessment.
 */
export interface MemberPublicEntryOrigin {
  memberId: string;
  sessionId: string;
  experienceKey: PublicEntryExperienceKey;
  sourceCode: string | null;
  sourceRaw: string | null;
  patternKey: PublicEntryPatternKey | null;
  enteredAt: string;
  claimedAt: string;
  origin: 'public_acquisition';
  preliminary: true;
}
