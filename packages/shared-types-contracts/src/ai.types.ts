/**
 * AI Coaching Engine Foundation — shared types for the nine tables in
 * supabase/migrations/00000000000027_ai_infrastructure.sql. Lives here
 * (not app-local) for the same reason database.types.ts does: the
 * knowledge-engine-api and pattern-prioritization-engine service scaffolds
 * (services/*, currently unimplemented) are meant to consume these same
 * row shapes with zero drift once they're built out, exactly like
 * consumer-web-app already does for every other table in this package.
 *
 * These are row/type contracts only — no logic. The actual agent
 * implementations, rules engine, and dispatcher live in
 * apps/consumer-web-app/lib/ai/, which imports from here the same way
 * lib/wellness imports DailyCheckin from database.types.ts.
 */

export type AgentKey =
  | 'member_engagement'
  | 'wellness_analysis'
  | 'coach_assistant'
  | 'education'
  | 'accountability'
  | 'body_assessment'
  | 'proactive_coach';

/**
 * 'wearable_synced', 'hrv_declining', 'recovery_excellent', and
 * 'activity_declined' are the only genuinely new triggers the Wearables +
 * Proactive AI Coach milestone needs — every other wearable-observable
 * condition (declining sleep, rising/falling stress, reduced pain, streak
 * milestones, missed check-ins, reassessment/body-assessment completion)
 * already has an event type above; the wearable sync path
 * (app/actions/wearables.ts) reuses those directly rather than inventing
 * parallel ones. See lib/ai/agents/proactive-coach.ts.
 */
export type AiEventType =
  | 'member_completed_onboarding'
  | 'member_completed_checkin'
  | 'member_missed_checkin'
  | 'reassessment_completed'
  | 'pain_increased'
  | 'pain_decreased'
  | 'stress_increased'
  | 'stress_decreased'
  | 'sleep_declined'
  | 'movement_improved'
  | 'digestion_worsened'
  | 'coach_added_notes'
  | 'coach_completed_session'
  | 'member_inactive'
  | 'habit_streak_achieved'
  | 'wellness_index_changed_significantly'
  | 'body_assessment_completed'
  | 'assessment_submitted_for_coach_review'
  | 'wearable_synced'
  | 'hrv_declining'
  | 'recovery_excellent'
  | 'activity_declined'
  | 'movement_session_completed';

export type AiEventSource = 'member' | 'coach' | 'system';

export type AiActionType =
  | 'daily_coaching_insight'
  | 'todays_priority'
  | 'todays_action'
  | 'coach_notification'
  | 'member_encouragement'
  | 'reminder_recommendation'
  | 'educational_recommendation'
  | 'reassessment_recommendation'
  | 'progress_milestone'
  | 'risk_alert'
  | 'follow_up_recommendation';

export type AiRecommendationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AiRecommendationStatus = 'pending' | 'active' | 'dismissed' | 'completed' | 'expired';
export type AiActionStatus =
  'pending' | 'delivered' | 'approved' | 'rejected' | 'expired' | 'completed';
export type AiHistoryMemoryType =
  | 'recommendation_given'
  | 'insight_delivered'
  | 'education_delivered'
  | 'member_response'
  | 'coach_override';
export type AiActorType = 'member' | 'coach' | 'system';
export type AiLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AiAgentRecord {
  id: string;
  agent_key: AgentKey;
  name: string;
  category: string;
  description: string;
  responsibilities: string[];
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AiEvent {
  id: string;
  event_type: AiEventType;
  member_id: string;
  source: AiEventSource;
  payload: Record<string, unknown>;
  occurred_at: string;
  processed_at: string | null;
  created_at: string;
}

export interface AiRule {
  id: string;
  rule_key: string;
  agent_key: AgentKey;
  name: string;
  description: string;
  trigger_event_types: AiEventType[];
  conditions: unknown;
  produces: unknown;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiInsight {
  id: string;
  agent_key: AgentKey;
  member_id: string;
  source_event_id: string | null;
  source_rule_key: string | null;
  insight_type: string;
  title: string;
  description: string;
  supporting_data: Record<string, unknown>;
  confidence: number;
  created_at: string;
}

export interface AiRecommendation {
  id: string;
  agent_key: AgentKey;
  member_id: string;
  source_insight_id: string | null;
  recommendation_type: string;
  title: string;
  description: string;
  supporting_data: Record<string, unknown>;
  confidence: number;
  priority: AiRecommendationPriority;
  status: AiRecommendationStatus;
  created_at: string;
  expires_at: string | null;
}

export interface AiAction {
  id: string;
  agent_key: AgentKey;
  member_id: string;
  source_recommendation_id: string | null;
  action_type: AiActionType;
  reason: string;
  supporting_data: Record<string, unknown>;
  confidence: number;
  status: AiActionStatus;
  requires_coach_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface AiHistoryEntry {
  id: string;
  member_id: string;
  agent_key: AgentKey;
  source_action_id: string | null;
  memory_type: AiHistoryMemoryType;
  actor_type: AiActorType;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AiLogEntry {
  id: string;
  level: AiLogLevel;
  agent_key: AgentKey | null;
  member_id: string | null;
  source_event_id: string | null;
  message: string;
  context: Record<string, unknown>;
  created_at: string;
}

export interface AiPromptTemplate {
  id: string;
  template_key: string;
  agent_key: AgentKey;
  name: string;
  description: string;
  provider: string | null;
  version: number;
  content: string;
  variables: unknown[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
