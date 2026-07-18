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

export type MemberWellnessEventType =
  | 'morning_readiness_recorded'
  | 'hydration_logged'
  | 'movement_logged'
  | 'concern_flagged'
  | 'evening_reflection_recorded';

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

export type MemberWellnessEventPayload =
  | HydrationLoggedPayload
  | MovementLoggedPayload
  | ConcernFlaggedPayload
  | MorningReadinessRecordedPayload
  | EveningReflectionRecordedPayload
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
}

export interface EveningReflection extends EveningReflectionInput {
  id: string;
  member_id: string;
  occurred_at: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}
