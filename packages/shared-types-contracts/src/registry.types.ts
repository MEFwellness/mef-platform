/**
 * Universal Metric & Finding Registry — shared types for registry_entries
 * (supabase/migrations/00000000000040_universal_health_registry.sql). Same
 * convention as every other *.types.ts file here: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only — the draft
 * type recorded before an id/status exists lives in
 * apps/consumer-web-app/lib/registry/types.ts, not here.
 *
 * This is the one common contract every current and future assessment
 * type (body assessment posture findings today; sleep/stress/nutrition/
 * wearable/lab/hormone tomorrow) registers findings and metrics through —
 * see that migration's own header for why this exists and what it does
 * NOT replace.
 */

export type RegistryEntryKind = 'finding' | 'metric';

export type RegistryDomain =
  | 'posture'
  | 'movement'
  | 'breathing'
  | 'questionnaire'
  | 'sleep'
  | 'stress'
  | 'nutrition'
  | 'wearable'
  | 'lab'
  | 'hormone';

export type RegistryEntrySeverity = 'none' | 'mild' | 'moderate' | 'significant' | 'unknown';

export type RegistryEntryStatus = 'active' | 'resolved' | 'superseded' | 'dismissed';

/** Four real producers now — body assessment and coach intelligence from the original milestone, wearable_daily_metric (see lib/registry/adapters/wearables.ts), and food_lens_pattern_comparison (see lib/registry/adapters/foodLens.ts). Extend alongside the migration's check constraint as future adapters land. */
export type RegistrySourceFeature =
  | 'body_assessment_finding'
  | 'assessment_ai_observation'
  | 'wearable_daily_metric'
  | 'food_lens_pattern_comparison';

/** Same {type, id, note?} shape every other engine's evidence-ref type already uses, independently declared per this codebase's established convention. */
export interface RegistryEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface RegistryEntry {
  id: string;
  member_id: string;
  entry_kind: RegistryEntryKind;
  domain: RegistryDomain;
  code: string;
  label: string;
  severity: RegistryEntrySeverity | null;
  numeric_value: number | null;
  unit: string | null;
  confidence: number;
  narrative: string | null;
  evidence_refs: RegistryEvidenceRef[];
  source_feature: RegistrySourceFeature;
  source_record_id: string;
  status: RegistryEntryStatus;
  member_visible: boolean;
  coach_context: string | null;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}
