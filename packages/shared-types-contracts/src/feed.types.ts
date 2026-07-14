/**
 * Daily Coaching Feed — shared types for mef_content_items,
 * daily_feed_items, and daily_feed_events
 * (supabase/migrations/00000000000030_content_library_and_feed.sql). Same
 * convention as ai.types.ts/safety.types.ts/narrative.types.ts:
 * hand-authored, kept in sync with the migration by hand, row/type
 * contracts only (logic lives in apps/consumer-web-app/lib/feed/).
 */

export type FourDoctorsCategory =
  'doctor_diet' | 'doctor_quiet' | 'doctor_movement' | 'doctor_happiness';

export type ContentSafetyClassification =
  'standard_coaching' | 'coaching_with_caution' | 'medical_evaluation_recommended';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type ContentFormat = 'lesson' | 'tip' | 'reflection_prompt' | 'practice';

export type ContentDifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ContentEvidenceSource {
  title: string;
  url: string;
}

export interface ContentEligibilityRules {
  priorityMetric?: string;
  [key: string]: unknown;
}

export interface MefContentItem {
  id: string;
  content_key: string;
  title: string;
  summary: string;
  body: string;
  estimated_reading_minutes: number;
  four_doctors_category: FourDoctorsCategory;
  topics: string[];
  symptoms_or_concerns: string[];
  goals: string[];
  safety_classification: ContentSafetyClassification;
  contraindication_tags: string[];
  evidence_sources: ContentEvidenceSource[];
  author: string;
  reviewer: string | null;
  status: ContentStatus;
  version: number;
  publication_date: string | null;
  last_reviewed_date: string | null;
  content_format: ContentFormat;
  difficulty_level: ContentDifficultyLevel;
  eligibility_rules: ContentEligibilityRules;
  suggested_action: string;
  reflection_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface DailyFeedItem {
  id: string;
  member_id: string;
  local_date: string;
  content_item_id: string;
  focus_text: string;
  why_text: string;
  selection_reasons: Record<string, unknown>;
  safety_classification_id: string | null;
  coach_assigned_by: string | null;
  coach_note: string | null;
  replaced_content_item_id: string | null;
  completed_at: string | null;
  saved_at: string | null;
  dismissed_at: string | null;
  reflection_response: string | null;
  reflection_submitted_at: string | null;
  helpful: boolean | null;
  created_at: string;
  updated_at: string;
}

export type DailyFeedEventType =
  | 'impression'
  | 'opened'
  | 'completed'
  | 'saved'
  | 'dismissed'
  | 'action_completed'
  | 'reflection_submitted'
  | 'helpful'
  | 'not_helpful'
  | 'content_repeated'
  | 'coach_replacement';

export interface DailyFeedEvent {
  id: string;
  feed_item_id: string;
  member_id: string;
  event_type: DailyFeedEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}
