/**
 * Prescription Intelligence Engine — shared types for prescription_snapshots,
 * prescription_blocks, prescription_block_exercises, and
 * prescription_constraints
 * (supabase/migrations/00000000000083_prescription_intelligence_engine.sql).
 * Same convention as every other *.types.ts file here: hand-authored,
 * row/type contracts only — decision logic lives in
 * apps/consumer-web-app/lib/prescription-intelligence/.
 *
 * PrescriptionBlockType reuses MovementSessionSection (movement.types.ts)
 * rather than defining its own taxonomy — see that file's header for why
 * there is exactly one Program Section / block taxonomy in this codebase.
 *
 * See the migration's own header for the core invariant: a snapshot and its
 * blocks/exercises/constraints are editable only while status is
 * 'pending_coach_review'; once approved, rejected, or blocked, the whole
 * tree is frozen — a later re-run creates a new snapshot, this one is never
 * mutated to reflect it. Members never read any of these four tables; they
 * only ever see the resulting coach_assigned_workout once a coach approves
 * and publishes it.
 */

import type { MovementSessionSection } from './movement.types';
import type { HealthTimelineEvidenceRef } from './timeline.types';
import type { ExerciseLibraryProvider } from './exercise-library.types';

export type PrescriptionBlockType = MovementSessionSection;

export type PrescriptionTriggerSource = 'coach_manual' | 'member_request';

export type PrescriptionSnapshotStatus =
  'pending_coach_review' | 'approved' | 'rejected' | 'blocked';

export type PrescriptionBlockReason =
  | 'red_flag'
  | 'missing_baseline_assessment'
  | 'missing_movement_assessment'
  | 'extremely_poor_readiness'
  | 'insufficient_data';

export type PrescriptionRecommendedAlternative =
  | 'recovery_session'
  | 'mobility_session'
  | 'breathing_session'
  | 'coach_review'
  | 'medical_follow_up';

export type PrescriptionConfidenceLevel = 'building' | 'low' | 'moderate' | 'high';

/** One line of "why" — always traces to a real fact, never a canned sentence. Same shape as MovementSelectionFactor (movement.types.ts), independently declared per this codebase's established convention. */
export interface PrescriptionConfidenceReason {
  label: string;
  detail: string;
}

/** Frozen copy of the Movement Profile fields Layer 1 actually read at generation time — shape mirrors MemberMovementProfile's own field groups, not a full row copy. */
export interface PrescriptionMovementProfileSnapshot {
  goals: string[];
  equipmentAccess: string[];
  movementLimitations: string[];
  exerciseRestrictions: string[];
  contraindications: string[];
  medicalRestrictions: string[];
  correctivePriorities: string[];
  mobilityPriorities: string[];
  stabilityPriorities: string[];
  strengthPriorities: string[];
}

/** Frozen copy of the Layer 2 "how are they today" signal — today's check-in plus wearable snapshot, both already-normalized shapes reused from lib/wearables/snapshot.ts and DailyCheckin. */
export interface PrescriptionReadinessSnapshot {
  localDate: string | null;
  painLevel: number | null;
  stressLevel: number | null;
  sleepQuality: number | null;
  sleepDuration: string | null;
  energyLevel: number | null;
  newOrWorseningConcern: boolean | null;
  wearableRecoveryScore: number | null;
  wearableReadinessScore: number | null;
  wearableHrvMs: number | null;
  wearableRestingHeartRate: number | null;
}

/** Frozen copy of the active posture/movement/breathing findings Layer 1 read from the Universal Registry at generation time. */
export interface PrescriptionAssessmentFinding {
  code: string;
  label: string;
  domain: string;
  severity: string | null;
}
export interface PrescriptionAssessmentSnapshot {
  activeFindings: PrescriptionAssessmentFinding[];
  hasBaselineAssessment: boolean;
  hasMovementAssessment: boolean;
}

/** One coach edit applied to a snapshot before approval — the human-readable audit trail; the underlying row is also mutated directly (see prescription_block_exercises.is_coach_modified). */
export interface PrescriptionCoachModification {
  action: 'accepted' | 'replaced' | 'locked' | 'removed' | 'reordered' | 'edited';
  targetType: 'block' | 'exercise';
  targetId: string;
  detail: string;
  at: string;
}

export interface PrescriptionSnapshot {
  id: string;
  member_id: string;
  coach_id: string;

  trigger_source: PrescriptionTriggerSource;
  requested_by: string;

  generated_at: string;

  movement_profile_snapshot: PrescriptionMovementProfileSnapshot;
  readiness_snapshot: PrescriptionReadinessSnapshot;
  assessment_snapshot: PrescriptionAssessmentSnapshot;

  corrective_priorities: string[];
  goals: string[];
  equipment: string[];
  time_available_minutes: number | null;

  strategy_summary: string | null;

  confidence: number;
  confidence_level: PrescriptionConfidenceLevel;
  confidence_reasons: PrescriptionConfidenceReason[];

  status: PrescriptionSnapshotStatus;
  block_reason: PrescriptionBlockReason | null;
  recommended_alternative: PrescriptionRecommendedAlternative | null;

  coach_modifications: PrescriptionCoachModification[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;

  resulting_template_id: string | null;
  resulting_assignment_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface PrescriptionBlock {
  id: string;
  snapshot_id: string;
  member_id: string;
  coach_id: string;

  block_type: PrescriptionBlockType;
  sequence_index: number;

  primary_objective: string;
  secondary_objective: string | null;
  required_movement_tags: string[];
  preferred_movement_tags: string[];
  excluded_tags: string[];
  equipment: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  movement_pattern: string | null;
  time_allocation_seconds: number | null;
  exercise_category: string | null;

  block_reasoning: string;

  created_at: string;
}

export interface PrescriptionBlockExercise {
  id: string;
  block_id: string;
  snapshot_id: string;
  member_id: string;
  coach_id: string;

  provider: ExerciseLibraryProvider;
  external_id: string;
  exercise_name: string;
  sequence_index: number;

  sets: number | null;
  reps: string | null;
  rep_range_low: number | null;
  rep_range_high: number | null;
  time_seconds: number | null;
  rest_seconds: number | null;
  tempo: string | null;
  hold_duration_seconds: number | null;
  side: 'left' | 'right' | 'both' | 'alternating' | null;
  unilateral: boolean;

  selection_reasoning: string;
  corrective_purpose: string | null;
  confidence: number;

  is_locked: boolean;
  is_coach_modified: boolean;
  original_provider: string | null;
  original_external_id: string | null;
  original_exercise_name: string | null;
  substitution_reason: string | null;

  created_at: string;
}

export type PrescriptionConstraintType =
  | 'poor_breathing'
  | 'limited_mobility'
  | 'poor_recovery'
  | 'pain'
  | 'movement_dysfunction'
  | 'high_stress'
  | 'sleep_deprivation'
  | 'red_flag'
  | 'missing_assessment';

export type PrescriptionConstraintSeverity = 'low' | 'moderate' | 'high' | 'blocking';

export interface PrescriptionConstraint {
  id: string;
  snapshot_id: string;
  member_id: string;
  coach_id: string;

  constraint_type: PrescriptionConstraintType;
  description: string;
  severity: PrescriptionConstraintSeverity;
  evidence_refs: HealthTimelineEvidenceRef[];
  addressed_by_block_id: string | null;

  created_at: string;
}

/** The full hydrated shape the coach review UI renders — one snapshot with its ordered blocks, each block with its ordered exercises, and the constraints identified before any block was built. */
export interface PrescriptionSnapshotWithContent extends PrescriptionSnapshot {
  blocks: (PrescriptionBlock & { exercises: PrescriptionBlockExercise[] })[];
  constraints: PrescriptionConstraint[];
}
