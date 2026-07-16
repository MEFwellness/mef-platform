/**
 * Coach Intelligence Workspace — shared types for the four tables added in
 * supabase/migrations/00000000000039_coach_intelligence_workspace.sql. Same
 * convention as body-assessment.types.ts: hand-authored, row/type contracts
 * only, kept in sync with the migration by hand.
 *
 * Generic by design: `source_feature`/`source_record_id` is a polymorphic
 * pointer (same convention as SafetyClassification.source_feature) rather
 * than a hard FK to body_assessments, so a future assessment type (gait,
 * nutrition, sleep, ...) plugs in by adding one source_feature value — no
 * schema change to these tables.
 */

export type AssessmentAiSourceFeature = 'body_assessment';

export type AssessmentAiProviderStatus = 'not_configured' | 'pending' | 'completed' | 'failed';

export type AssessmentAiAnalysisStatus =
  'pending_coach_review' | 'draft_saved' | 'published' | 'archived';

export interface AssessmentAiAnalysis {
  id: string;
  source_feature: AssessmentAiSourceFeature;
  source_record_id: string;
  member_id: string;

  provider_name: string | null;
  provider_status: AssessmentAiProviderStatus;
  provider_error: string | null;

  status: AssessmentAiAnalysisStatus;

  ai_summary: string | null;
  coach_summary: string | null;
  overall_confidence: number | null;
  coach_personal_notes: string | null;
  voice_message_url: string | null;

  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  published_by: string | null;
  published_at: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * All seven spec sections (key observations, movement compensations, Four
 * Doctors considerations, education topics, corrective exercise categories,
 * coach questions, red flags) collapse into this one discriminated shape —
 * they're structurally identical: AI text + optional confidence/severity +
 * coach accept/reject/edit.
 */
export type AiObservationCategory =
  | 'observation'
  | 'compensation'
  | 'four_doctors_consideration'
  | 'education_topic'
  | 'corrective_exercise_category'
  | 'coach_question'
  | 'red_flag';

export type AiObservationStatus = 'pending_review' | 'accepted' | 'rejected';

/** Same shape as FindingEvidenceRef (body-assessment.types.ts) — not imported directly to keep this module independent of the body-assessment-specific one. */
export interface AiObservationEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface AssessmentAiObservation {
  id: string;
  analysis_id: string;
  member_id: string;

  category: AiObservationCategory;
  ai_text: string;
  coach_text: string | null;
  confidence: number | null;
  severity: 'none' | 'mild' | 'moderate' | 'significant' | 'unknown' | null;
  evidence: AiObservationEvidenceRef[];
  status: AiObservationStatus;
  sort_order: number;

  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;

  created_at: string;
  updated_at: string;
}

/** Coach-authored specific exercises — distinct from the AI's suggested exercise *categories* (an AiObservationCategory value). */
export interface AssessmentReportExercise {
  id: string;
  analysis_id: string;
  member_id: string;

  name: string;
  description: string | null;
  category: string | null;
  sort_order: number;

  added_by: string;
  created_at: string;
}

/**
 * 'proactive_coach_message' is the Proactive AI Coach's delivery channel
 * (lib/ai/agents/proactive-coach.ts) — reuses this same generic in-app
 * notification table rather than a second one. 'morning_brief_ready' and
 * 'weekly_summary' are the Root Proactive Coaching Engine's own two
 * additions (lib/coaching-engine/, app/api/cron/daily-coaching-scan) —
 * same table, same reasoning.
 */
export type NotificationType =
  | 'assessment_report_published'
  | 'proactive_coach_message'
  | 'morning_brief_ready'
  | 'weekly_summary';

export interface Notification {
  id: string;
  member_id: string;

  type: NotificationType;
  title: string;
  body: string | null;
  source_feature: string | null;
  source_record_id: string | null;

  read_at: string | null;
  created_at: string;
}
