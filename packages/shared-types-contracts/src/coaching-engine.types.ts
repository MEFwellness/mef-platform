/**
 * Root Proactive Coaching Engine — shared types for coach_morning_briefs
 * (supabase/migrations/00000000000053_proactive_coaching_engine.sql).
 * Same convention as every other *.types.ts file here: hand-authored,
 * row/type contract only. The actual composition logic lives in
 * apps/consumer-web-app/lib/coaching-engine/.
 */

/** Same {type, id, note?} shape every other evidence-ref type in this codebase already uses, independently declared per established convention. */
export interface MorningBriefEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface MorningBrief {
  id: string;
  member_id: string;
  local_date: string;

  greeting_name: string;
  focus_area: string;
  focus_label: string;

  recovery_summary: string | null;
  sleep_summary: string | null;
  stress_summary: string | null;

  habit_to_prioritize: string | null;
  coaching_recommendation: string;
  encouraging_message: string;

  /** A real, longitudinal wellness_insights trend (e.g. digestion/movement/mood/hydration) not already covered by sleep_summary/stress_summary/recovery_summary above — null when nothing meaningful is active. */
  notable_pattern_title: string | null;
  notable_pattern_summary: string | null;
  /** A specific saved-but-not-completed lesson, same text Today's "A Note from Root" shows (lib/feed/continuity.ts's buildContinuitySentence) — null when there is none. */
  incomplete_recommendation: string | null;

  evidence_refs: MorningBriefEvidenceRef[];

  generated_at: string;
  created_at: string;
}
