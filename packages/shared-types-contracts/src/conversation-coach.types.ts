/**
 * MEF Conversation Coach (Milestone 7) — shared types for the four
 * conversation_* tables in
 * supabase/migrations/00000000000033_conversation_coach.sql. Same
 * convention as safety.types.ts/narrative.types.ts: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only (logic lives in
 * apps/consumer-web-app/lib/conversation-coach/).
 */

export type ConversationEntryPoint =
  | 'nav'
  | 'today_focus'
  | 'today_easier_option'
  | 'today_why'
  | 'today_completed'
  | 'progress_pattern'
  | 'progress_improved'
  | 'progress_focus'
  | 'checkin_explain'
  | 'checkin_feeling'
  // Floating "Ask Your MEF Coach" launcher (accessibility milestone) —
  // Today/Check-in/Progress already had contextual entry points above;
  // these three cover the launcher's remaining page categories.
  | 'dashboard'
  | 'profile'
  | 'assessment'
  // AI Body Assessment Framework — a member launching a conversation from
  // a body assessment result page (distinct from the onboarding/
  // reassessment 'assessment' entry point above).
  | 'body_assessment'
  // Food Lens — a member launching a conversation from a meal scan result.
  | 'food_lens'
  // Movement Intelligence — a member launching a conversation from the
  // Movement Dashboard or an active session.
  | 'movement';

export type ConversationSessionStatus = 'active' | 'restricted' | 'archived';

export type ConversationMessageRole = 'member' | 'coach_ai' | 'system';

export type ConversationMemoryType =
  | 'barrier'
  | 'preference'
  | 'life_event'
  | 'action_chosen'
  | 'successful_strategy'
  | 'unresolved_concern'
  | 'coach_follow_up_request';

export type ConversationHandoffUrgency = 'low' | 'medium' | 'high';

export type ConversationHandoffStatus = 'pending' | 'acknowledged' | 'resolved';

export interface ConversationSession {
  id: string;
  member_id: string;
  entry_point: ConversationEntryPoint;
  status: ConversationSessionStatus;
  title: string | null;
  started_at: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  member_id: string;
  role: ConversationMessageRole;
  content: string;
  source_page: string | null;
  prompt_version: string | null;
  safety_classification_id: string | null;
  related_brain_focus: string | null;
  related_insight_id: string | null;
  member_visible: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface ConversationMemoryItem {
  id: string;
  member_id: string;
  session_id: string;
  memory_type: ConversationMemoryType;
  content: string;
  source_message_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationHandoff {
  id: string;
  session_id: string;
  member_id: string;
  assigned_coach_id: string | null;
  member_note: string | null;
  urgency: ConversationHandoffUrgency;
  status: ConversationHandoffStatus;
  coach_response_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
