/**
 * Coaching Safety, Scope, and Human Oversight — shared types for the five
 * tables in supabase/migrations/00000000000028_coaching_safety.sql. Same
 * convention as ai.types.ts: hand-authored, kept in sync with migrations
 * by hand, row/type contracts only (no logic — that lives in
 * apps/consumer-web-app/lib/safety/).
 */

export type SafetyClassificationLevel =
  | 'standard_coaching'
  | 'coaching_with_caution'
  | 'medical_evaluation_recommended'
  | 'coach_review_required'
  | 'safety_response_only';

export type SafetyUrgency = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type SafetySourceFeature =
  | 'daily_checkin'
  | 'coach_note'
  | 'ai_recommendation'
  | 'daily_feed'
  | 'dynamic_coaching'
  | 'wellness_intelligence'
  | 'conversation_coach'
  | 'body_assessment';

export type SafetyEscalationAction =
  'none' | 'notify_coach' | 'coach_review_queue' | 'urgent_follow_up';

export type SafetyAcknowledgmentStatus = 'pending' | 'acknowledged' | 'dismissed';

export type SafetyReviewStatus =
  | 'new'
  | 'reviewing'
  | 'approved_for_limited_coaching'
  | 'referred_out'
  | 'urgent_follow_up'
  | 'closed';

export type SafetyAuditEventType =
  | 'classification_created'
  | 'message_shown'
  | 'acknowledgment_recorded'
  | 'review_created'
  | 'review_updated'
  | 'restriction_added'
  | 'restriction_removed'
  | 'review_resolved';

export type SafetyActorType = 'member' | 'coach' | 'system';

export interface SafetyMessageTemplate {
  id: string;
  template_key: string;
  classification_level: SafetyClassificationLevel;
  concern_category: string | null;
  version: number;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafetyCoachingRestrictions {
  restrictedTopics?: string[];
  allowedTopics?: string[];
  [key: string]: unknown;
}

export interface SafetyClassification {
  id: string;
  member_id: string;
  source_feature: SafetySourceFeature;
  source_record_type: string | null;
  source_record_id: string | null;
  source_event_id: string | null;
  input_excerpt: string | null;
  classification_level: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  concern_categories: string[];
  reasoning_codes: string[];
  coaching_allowed: boolean;
  coaching_restrictions: SafetyCoachingRestrictions;
  restricted_topics: string[];
  coach_review_required: boolean;
  acknowledgment_required: boolean;
  escalation_action: SafetyEscalationAction;
  message_template_id: string | null;
  member_message_shown: string | null;
  policy_version: string;
  created_at: string;
}

export interface SafetyAcknowledgment {
  id: string;
  classification_id: string;
  member_id: string;
  message_shown: string;
  message_version: string;
  classification_level: SafetyClassificationLevel;
  status: SafetyAcknowledgmentStatus;
  acknowledged_at: string | null;
  created_at: string;
}

export interface SafetyReviewQueueEntry {
  id: string;
  member_id: string;
  assigned_coach_id: string | null;
  classification_id: string;
  source_feature: string;
  source_record_type: string | null;
  source_record_id: string | null;
  member_input_excerpt: string | null;
  concern_categories: string[];
  classification_level: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  restrictions_applied: SafetyCoachingRestrictions;
  status: SafetyReviewStatus;
  coach_notes: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyAuditLogEntry {
  id: string;
  member_id: string;
  classification_id: string | null;
  review_id: string | null;
  event_type: SafetyAuditEventType;
  actor_type: SafetyActorType;
  actor_id: string | null;
  policy_version: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
