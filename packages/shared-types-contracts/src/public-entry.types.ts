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
  /** The lead row this arrival produced, when she left an email. Null otherwise, which is most arrivals. */
  capturedLeadId: string | null;
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
  /**
   * HOW she was joined to this arrival, which is a weaker or a stronger
   * statement depending on which it is, and is therefore stored rather than
   * flattened (migration 207).
   *
   *   'browser_token'  Her own browser handed over the visitor token it
   *                    minted when she took the quiz. The strongest join
   *                    there is, and the only one that existed before
   *                    migration 207.
   *   'signup_link'    She tapped the create-account button on her own
   *                    finished result, and the signup server redeemed the
   *                    one-time reference that button carried, in the same
   *                    request that created her account. A statement about
   *                    a device, like the token, and the only route that
   *                    does not depend on which browser is signed in later.
   *   'email_match'    No browser carried anything, and the address she
   *                    left on a finished quiz is exactly the address she
   *                    created her account with. A real join, and the
   *                    weakest of the three: a lead email is self-entered
   *                    and unverified.
   */
  bindMethod: PublicEntryBindMethod;
}

/** The three ways a member can be joined to a public arrival, strongest first. See MemberPublicEntryOrigin.bindMethod. */
export const PUBLIC_ENTRY_BIND_METHODS = ['browser_token', 'signup_link', 'email_match'] as const;

export type PublicEntryBindMethod = (typeof PUBLIC_ENTRY_BIND_METHODS)[number];

export function isPublicEntryBindMethod(value: unknown): value is PublicEntryBindMethod {
  return typeof value === 'string' && (PUBLIC_ENTRY_BIND_METHODS as readonly string[]).includes(value);
}
