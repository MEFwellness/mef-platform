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
  | 'purchase_completed';

export type MemberWellnessEventType = MemberWellnessOnlyEventType | ProductAnalyticsEventType;

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
}

export type MemberWellnessEventPayload =
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
