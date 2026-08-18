/**
 * Member Wellness Event Stream — shared types for member_wellness_events
 * and evening_reflections
 * (supabase/migrations/00000000000063_wellness_event_stream.sql).
 *
 * occurred_at vs. recorded_at is the load-bearing distinction of this
 * whole feature: occurred_at is when the thing actually happened (member-
 * suppliable, defaults to now()) and is the ONLY field any ordering,
 * timeline, scoring, or pattern-analysis code may sort or filter by.
 * recorded_at is server write time — an audit fact, never used to order
 * the member's day. See the migration's header comment for the full
 * rationale.
 */

/**
 * The original five wellness event types (migration 63). These carry real
 * member health content and are deliberately NOT analytics events, see
 * ProductAnalyticsEventType below and the hard rule in
 * lib/analytics/track.ts.
 */
export type MemberWellnessOnlyEventType =
  | 'morning_readiness_recorded'
  | 'hydration_logged'
  | 'movement_logged'
  | 'concern_flagged'
  | 'evening_reflection_recorded';

/**
 * Product analytics event types (migration 146), behavioral only. These
 * share the one member_wellness_events pipeline rather than adding a
 * second tracking system, per the same "widen the constraint, never add a
 * second events table" rule the original migration set out.
 *
 * Payloads here are neutral metadata only: a surface name, a feature key,
 * a method, a tier. Never a check-in answer, pain location, sleep number,
 * or questionnaire response.
 */
export type ProductAnalyticsEventType =
  | 'signup_completed'
  | 'session_started'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'surface_viewed'
  | 'daily_reset_started'
  | 'daily_reset_completed'
  | 'food_scan_performed'
  | 'food_entry_logged'
  | 'feature_engaged'
  | 'paywall_viewed'
  | 'membership_tier_changed'
  | 'purchase_completed'
  /**
   * Priority Card (migration 147). Behavioral only: which hierarchy rule
   * won, which of the three buttons was tapped, and that a re-entry
   * opening was shown. Never the priority's own text, never the reason
   * line, never any driver, finding, or check-in content behind it.
   */
  | 'priority_shown'
  | 'priority_action'
  | 're_entry_shown'
  /**
   * Adaptive Coaching Direction (migration 150). Behavioral only: which
   * rule the decision engine chose, what kind of action it was, and which
   * of the card's three buttons she used. Never the action's own text,
   * never its reason line, never the evidence behind it, and never
   * anything about a safety concern beyond the fact that the safety rule
   * was the one that fired.
   */
  | 'coaching_action_delivered'
  | 'coaching_action_acted'
  | 'coaching_action_dismissed'
  /**
   * The Weekly Root Review (migration 151). Behavioral only: that a review
   * was composed and delivered, that it reached her screen, that she
   * acknowledged it, and that she answered one of its at-most-two questions.
   *
   * weekly_review_question_answered carries the QUESTION KEY and never the
   * answer. Which of three fixed options she chose is behavioral context
   * that belongs on her own review row, not in an analytics rollup, and the
   * separation is enforced by there being no payload field it could travel
   * in.
   */
  | 'weekly_review_delivered'
  | 'weekly_review_viewed'
  | 'weekly_review_completed'
  | 'weekly_review_question_answered'
  /**
   * Adaptive Coaching Direction Part 3 (migration 152). Behavioral only.
   *
   * coaching_thread_escalated fires on the transition Part 1 already
   * guards, so it is one per escalation and not one per day a thread stays
   * escalated. coaching_escalation_resolved is written when a coach clears
   * one. coaching_grades_computed carries COUNTS ONLY: how many grades a
   * pass produced and how many of them were landing or dead. Never a
   * thread key, never an action's own text, never the evidence behind it.
   */
  | 'coaching_thread_escalated'
  | 'coaching_escalation_resolved'
  | 'coaching_grades_computed'
  /**
   * Root Movement Level 1 (migration 153). Behavioral only: which of the
   * six fixed sessions she opened, started and finished, and which
   * catalog exercise she skipped.
   *
   * There is deliberately no event for leaving a session part way
   * through, and no payload field for WHY anything was skipped. The
   * first is a fact this product has decided not to make her answer for;
   * the second would be health content.
   */
  | 'movement_session_viewed'
  | 'movement_session_started'
  | 'movement_session_completed'
  | 'movement_exercise_skipped';

/**
 * Program lifecycle (migration 172). Operational facts about one assigned
 * program moving through its weeks, written by the daily movement
 * lifecycle job and by a coach's own pause/resume/replace.
 *
 * Deliberately neither of the two families above. Not health content: the
 * payload carries a week number, a duration and a status, never an
 * exercise, a finding, a pain location or a check-in answer. And not
 * product analytics either — `is_product_analytics_event_type` in the
 * database was left alone on purpose, so these never reach the product
 * analytics view and never dilute a funnel with something no member did.
 */
export type ProgramLifecycleEventType =
  | 'program_started'
  | 'program_week_advanced'
  | 'program_completed'
  | 'program_paused'
  | 'program_resumed'
  | 'program_replaced';

export type MemberWellnessEventType =
  | MemberWellnessOnlyEventType
  | ProductAnalyticsEventType
  | ProgramLifecycleEventType;

export type MemberWellnessEventSource = 'member' | 'coach' | 'system';

export interface HydrationLoggedPayload {
  delta: number;
  totalAfter: number;
}

export interface MovementLoggedPayload {
  movementType: 'walk' | 'stretch' | 'workout' | 'other';
  note?: string | null;
}

export interface ConcernFlaggedPayload {
  text: string;
}

export interface MorningReadinessRecordedPayload {
  checkinId: string;
}

export interface EveningReflectionRecordedPayload {
  reflectionId: string;
}

/**
 * Every analytics payload shape. Deliberately narrow: only these keys may
 * ever appear on an analytics event, and every value is a bounded, neutral
 * string or number. Adding a free-text or health-content field here is the
 * thing tests/product-analytics-payload-safety.test.ts exists to stop.
 */
export interface ProductAnalyticsPayload {
  /** surface_viewed, which major screen was opened. */
  surface?: string;
  /** feature_engaged / paywall_viewed, which feature the event is about. */
  feature?: string;
  /** feature_engaged, what the member did, from a fixed allowlist. */
  action?: string;
  /** session_started, how the member signed in. */
  method?: string;
  /** onboarding_completed, baseline vs reassessment. */
  assessmentType?: string;
  /** food_scan_performed, which kind of scan. */
  scanType?: string;
  /** food_scan_performed, analyzed, failed, not_configured. */
  status?: string;
  /** food_entry_logged, which logging path produced the entry. */
  entryType?: string;
  /** paywall_viewed, why the surface was locked. */
  lockReason?: string;
  /** membership_tier_changed / purchase_completed, tier keys. */
  fromTier?: string | null;
  toTier?: string | null;
  /** purchase_completed, billing term, when a billing system can emit it. */
  term?: string;
  /**
   * priority_shown / priority_action, which selection-hierarchy rule won.
   * A fixed slug from lib/analytics/surfaces.ts's PRIORITY_RULES, never
   * the priority's own wording. priority_action reuses `action` above for
   * which button was tapped.
   */
  rule?: string;
  /**
   * priority_shown, whether the priority reached her as the Root pop-up on
   * open or as the inline card. A fixed slug from
   * lib/analytics/surfaces.ts's PRIORITY_PRESENTATIONS.
   */
  presentation?: string;
  /**
   * coaching_action_*, what KIND of thing the delivered action asked for.
   * A fixed slug from lib/coaching-direction/types.ts's
   * COACHING_ACTION_TYPES. Says nothing about the member, only about the
   * shape of the suggestion.
   */
  actionType?: string;
  /**
   * weekly_review_*, whether the review was the full or the thin shape. A
   * fixed slug from lib/analytics/surfaces.ts's WEEKLY_REVIEW_SHAPES. Says
   * how much Root had to work with, never what it observed.
   */
  shape?: string;
  /**
   * weekly_review_question_answered, WHICH question was answered. A fixed
   * slug from lib/weekly-review/questions.ts's QUESTION_KEYS.
   *
   * There is deliberately no field for the ANSWER. The answer is behavioral
   * context stored on the member's own review row; putting it here would
   * make an analytics rollup able to reconstruct what she said about her
   * week, which is precisely what this payload shape exists to prevent.
   */
  questionKey?: string;
  /**
   * coaching_grades_computed, three COUNTS from one grading pass: how many
   * grades it produced, and how many of those were landing or dead.
   *
   * Typed as strings because every value on this payload is a short slug
   * and the sanitizer keeps strings only, which is the rule that makes a
   * sentence unable to reach an event row. A count is written as its own
   * digits by lib/coaching-direction/gradesService.ts's `countValue`
   * rather than widening that rule for three numbers.
   *
   * There is deliberately no field here for WHICH action type was graded
   * or which thread it was about. A rollup of how well coaching is landing
   * across the product needs the counts; it does not need to be able to
   * name one member's threads.
   */
  gradeCount?: string;
  landingCount?: string;
  deadCount?: string;
  /**
   * movement_session_*, WHICH of the six ready-made sessions. A
   * session_key from movement_session_templates (migration 153), which is
   * a closed set of six values validated server-side against the table
   * itself before anything is written.
   */
  sessionKey?: string;
  /**
   * movement_exercise_skipped, WHICH exercise was skipped. A Your Move
   * catalog external id, validated server-side to be one of the slots of
   * the session it is reported against.
   *
   * A catalog id names a movement, not a person. It says she skipped the
   * side plank; it does not say her shoulder hurt, and there is no field
   * here in which that could ever be recorded.
   */
  exerciseId?: string;
  /**
   * movement_session_viewed, how many exercises the session she opened
   * contains. movement_session_completed, how many of them she skipped.
   *
   * Both written as their own digits, for the same reason gradeCount
   * above is: the sanitizer keeps short strings only, and that rule is
   * what stops a sentence ever reaching an event row.
   */
  exerciseCount?: string;
  skipCount?: string;
}

/**
 * Program lifecycle events (migration 172). Numbers only: which week of
 * how many, and the two statuses of the transition. Never the program's
 * name, never an exercise, never anything about why a coach paused or
 * replaced it. `assignmentId` travels on the event row's own
 * source_record_id, not here.
 */
export interface ProgramLifecyclePayload {
  fromStatus?: string;
  toStatus?: string;
  /** Written as digits, same convention as gradeCount/exerciseCount above. */
  week?: string;
  durationWeeks?: string;
}

export type MemberWellnessEventPayload =
  | ProgramLifecyclePayload
  | HydrationLoggedPayload
  | MovementLoggedPayload
  | ConcernFlaggedPayload
  | MorningReadinessRecordedPayload
  | EveningReflectionRecordedPayload
  | ProductAnalyticsPayload
  | Record<string, never>;

export interface MemberWellnessEvent {
  id: string;
  member_id: string;
  event_type: MemberWellnessEventType;
  occurred_at: string;
  recorded_at: string;
  timezone: string;
  local_date: string;
  payload: MemberWellnessEventPayload;
  source: MemberWellnessEventSource;
  source_record_id: string | null;
  created_at: string;
}

export type EnergyPattern = 'steady' | 'dipped' | 'crashed' | 'improved';

export interface EveningReflectionInput {
  timezone: string;
  local_date: string;
  overall_day_rating: number | null;
  daytime_stress: number | null;
  energy_pattern: EnergyPattern | null;
  symptoms_or_changes: string | null;
  recovery: number | null;
  /** Elapsed seconds from the wizard's first screen render to submission. Null/undefined on a draft (exit-triggered) save or any row predating this column. Optional so existing test fixtures elsewhere that build an EveningReflection literal don't all need updating. */
  completion_seconds?: number | null;
}

export interface EveningReflection extends EveningReflectionInput {
  id: string;
  member_id: string;
  occurred_at: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}
