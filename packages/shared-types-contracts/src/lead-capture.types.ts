/**
 * Lead Capture Agent — shared types for the three lead_* tables in
 * supabase/migrations/00000000000123_lead_capture_agent.sql. Same
 * convention as conversation-coach.types.ts: hand-authored, kept in sync
 * with the migration by hand, row/type contracts only (logic lives in
 * apps/consumer-web-app/lib/lead-capture/). Entirely separate from
 * ConversationSession/ConversationMessage — a lead is anonymous and never
 * touches the member-facing Conversation Coach's tables.
 */

export type LeadTopic = 'pain' | 'energy' | 'sleep' | 'stress' | 'weight' | 'general';

export type LeadConversationStage =
  | 'opening'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'follow_up_3'
  | 'follow_up_4'
  | 'insight_capture'
  | 'routed';

export type LeadConversationStatus = 'active' | 'completed' | 'abandoned';

export type LeadTemperature = 'hot' | 'warm';

export type LeadRoutingDestination = 'discovery_call' | 'quiz_guide';

export type LeadMessageRole = 'lead' | 'agent';

/**
 * A small, consistent set of observational (never diagnostic) pattern
 * labels assigned by lib/lead-capture/pattern.ts from the visitor's own
 * follow-up answers. Named and defined in docs/LEAD_AGENT_VOICE.md.
 */
export type LeadPatternName =
  | 'recovery_deficit'
  | 'compensation_pattern'
  | 'overload_pattern'
  | 'fuel_timing_pattern'
  | 'depletion_pattern'
  | 'wind_down_deficit'
  | 'rhythm_disruption'
  | 'stress_loading_pattern'
  | 'stress_storage_pattern'
  | 'metabolic_adaptation_pattern';

export interface LeadConversation {
  id: string;
  session_token: string;
  topic: LeadTopic | null;
  stage: LeadConversationStage;
  retry_count: number;
  lead_temperature: LeadTemperature | null;
  routed_to: LeadRoutingDestination | null;
  pattern_name: LeadPatternName | null;
  source_url: string | null;
  status: LeadConversationStatus;
  started_at: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeadMessage {
  id: string;
  conversation_id: string;
  role: LeadMessageRole;
  content: string;
  created_at: string;
}

export interface CapturedLead {
  id: string;
  conversation_id: string;
  first_name: string | null;
  email: string;
  topic: LeadTopic | null;
  lead_temperature: LeadTemperature | null;
  routed_to: LeadRoutingDestination | null;
  pattern_name: LeadPatternName | null;
  notified_at: string | null;
  created_at: string;
}
