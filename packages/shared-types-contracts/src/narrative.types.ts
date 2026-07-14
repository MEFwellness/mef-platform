/**
 * Member Health Narrative — shared types for narrative_items
 * (supabase/migrations/00000000000029_member_narrative.sql). Same
 * convention as ai.types.ts/safety.types.ts: hand-authored, kept in sync
 * with the migration by hand, row/type contracts only (logic lives in
 * apps/consumer-web-app/lib/narrative/).
 */

export type NarrativeCategory =
  | 'current_goals'
  | 'primary_priorities'
  | 'four_doctors_balance'
  | 'recurring_patterns'
  | 'recent_changes'
  | 'life_events'
  | 'barriers_to_adherence'
  | 'successful_interventions'
  | 'unsuccessful_interventions'
  | 'coaching_preferences'
  | 'learning_preferences'
  | 'motivation_patterns'
  | 'member_reported_context'
  | 'coach_verified_observations'
  | 'unresolved_concerns'
  | 'active_restrictions'
  | 'recent_wins'
  | 'progress_trends';

export type NarrativeProvenance =
  'member_reported' | 'coach_entered' | 'system_observed' | 'inferred' | 'confirmed_recurring';

export type NarrativeStatus = 'active' | 'historical' | 'outdated' | 'resolved';

export type NarrativeActorType = 'member' | 'coach' | 'system';

export interface NarrativeSourceRef {
  type: string;
  id: string;
  note?: string;
}

export interface NarrativeItem {
  id: string;
  member_id: string;
  category: NarrativeCategory;
  title: string;
  summary: string;
  provenance: NarrativeProvenance;
  confidence: number | null;
  status: NarrativeStatus;
  is_pinned: boolean;
  pinned_by: string | null;
  pinned_at: string | null;
  coach_protected: boolean;
  member_visible: boolean;
  source_refs: NarrativeSourceRef[];
  supersedes_id: string | null;
  superseded_by_id: string | null;
  created_by_actor_type: NarrativeActorType;
  created_by_actor_id: string | null;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}
