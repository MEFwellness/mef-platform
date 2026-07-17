/**
 * Personal Health Timeline architecture — shared types for
 * health_timeline_events
 * (supabase/migrations/00000000000042_health_timeline.sql). Same
 * convention as every other *.types.ts file here: hand-authored, row/type
 * contract only. No UI reads this yet — see
 * apps/consumer-web-app/lib/timeline/data.ts's listTimelineEvents, exported
 * and unused by design so a future timeline page can import it unchanged.
 */

export type HealthTimelineEventType =
  | 'onboarding_completed'
  | 'reassessment_completed'
  | 'checkin_submitted'
  | 'assessment_published'
  | 'wearable_synced'
  | 'streak_milestone'
  | 'trend_improving'
  | 'trend_declining'
  | 'wearable_connected'
  | 'movement_session_completed';

/** Same {type, id, note?} shape every other evidence-ref type in this codebase already uses, independently declared per established convention. */
export interface HealthTimelineEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface HealthTimelineEvent {
  id: string;
  member_id: string;
  event_type: HealthTimelineEventType;
  local_date: string;
  occurred_at: string;
  title: string;
  detail: string | null;
  source_feature: string | null;
  source_record_id: string | null;
  evidence_refs: HealthTimelineEvidenceRef[];
  member_visible: boolean;
  created_at: string;
}
