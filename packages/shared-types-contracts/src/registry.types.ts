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

/**
 * Longitudinal read on one (member, domain, code) finding chain, computed
 * at write time by comparing a new entry against the active entry it
 * supersedes (see lib/registry/trendStatus.ts) — distinct from `status`,
 * which is a lifecycle/audit state (active/resolved/superseded/dismissed).
 * `trend_status` is the Pattern Timeline's per-finding trend read (Prompt
 * 6's "new / improving / stable / worsening / resolved"). Null on every
 * entry written before this concept existed, and on any producer that
 * doesn't yet compute it — never backfilled/guessed.
 */
export type FindingTrendStatus = 'new' | 'improving' | 'stable' | 'worsening' | 'resolved';

/** Nine real producers now — body assessment and coach intelligence from the original milestone, wearable_daily_metric (see lib/registry/adapters/wearables.ts), food_lens_pattern_comparison (see lib/registry/adapters/foodLens.ts), movement_session_completed (see lib/registry/adapters/movement.ts), food_analysis_result, and the three Universal Assessment Intelligence Engine adapters (questionnaire_category_finding, onboarding_baseline_finding, primal_pattern_classification — see lib/registry/adapters/{questionnaireEngine,onboarding,primalPattern}.ts). Extend alongside the migration's check constraint as future adapters land. */
export type RegistrySourceFeature =
  | 'body_assessment_finding'
  | 'assessment_ai_observation'
  | 'wearable_daily_metric'
  | 'food_lens_pattern_comparison'
  | 'movement_session_completed'
  | 'food_analysis_result'
  | 'questionnaire_category_finding'
  | 'onboarding_baseline_finding'
  | 'primal_pattern_classification';

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
  trend_status: FindingTrendStatus | null;
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
