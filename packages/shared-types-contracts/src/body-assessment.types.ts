/**
 * AI Body Assessment Framework — shared types for the six body_* tables in
 * supabase/migrations/00000000000037_body_assessment.sql. Same convention
 * as every other *.types.ts file here: hand-authored, kept in sync with
 * the migration by hand, row/type contracts only — no logic (that lives
 * in apps/consumer-web-app/lib/body-assessment/).
 *
 * IMPORTANT: this file does not model any actual computer-vision output.
 * BodyLandmarkPoint/BodyAssessmentFinding are the STRUCTURE a future
 * dedicated posture/movement analysis provider will populate — see
 * lib/body-assessment/providers/types.ts for the provider boundary itself.
 * Every "confidence"/"severity" field exists so no finding is ever
 * presented as a certainty.
 */

export type BodyAssessmentType =
  | 'static_posture'
  | 'walking_gait'
  | 'breathing_observation'
  | 'shoulder_mobility'
  | 'hip_hinge'
  | 'squat'
  | 'single_leg_balance'
  | 'reach'
  | 'rotation'
  | 'custom';

export type BodyAssessmentStatus =
  | 'in_progress'
  | 'submitted'
  | 'not_configured'
  | 'analyzing'
  | 'analyzed'
  | 'coach_reviewed'
  | 'archived';

export type BodyAssessmentProviderStatus = 'not_configured' | 'pending' | 'completed' | 'failed';

export interface BodyAssessment {
  id: string;
  member_id: string;
  assessment_type: BodyAssessmentType;
  status: BodyAssessmentStatus;
  timezone: string;
  local_date: string;
  started_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  provider_name: string | null;
  provider_status: BodyAssessmentProviderStatus;
  provider_error: string | null;
  member_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BodyAssessmentCaptureType =
  'front' | 'left_side' | 'right_side' | 'back' | 'walking' | 'movement' | 'custom';

export type BodyAssessmentMediaType = 'image' | 'video';

export interface BodyAssessmentCapture {
  id: string;
  assessment_id: string;
  member_id: string;
  capture_type: BodyAssessmentCaptureType;
  sequence_index: number;
  media_type: BodyAssessmentMediaType;
  storage_bucket: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  captured_at: string;
  created_at: string;
}

/**
 * Every point the internal body model is capable of storing — grouped by
 * region purely for UI/config convenience (lib/body-assessment/landmarks.ts
 * owns the grouping + display labels). Nothing generates these from an
 * image today; see body_landmark_sets' migration docblock.
 */
export type BodyLandmarkKey =
  | 'head'
  | 'left_eye'
  | 'right_eye'
  | 'left_ear'
  | 'right_ear'
  | 'cervical_spine'
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_scapula'
  | 'right_scapula'
  | 'thorax'
  | 'rib_cage'
  | 'thoracic_spine'
  | 'lumbar_spine'
  | 'pelvis'
  | 'left_hip'
  | 'right_hip'
  | 'left_elbow'
  | 'right_elbow'
  | 'left_wrist'
  | 'right_wrist'
  | 'left_hand'
  | 'right_hand'
  | 'left_knee'
  | 'right_knee'
  | 'left_ankle'
  | 'right_ankle'
  | 'left_foot'
  | 'right_foot';

export type BodyLandmarkVisibility = 'visible' | 'occluded' | 'estimated';

export interface BodyLandmarkPoint {
  key: BodyLandmarkKey;
  /** Normalized [0,1] image-space coordinates — origin top-left, same convention MoveNet/MediaPipe/most vision APIs already use, so a future provider's raw output maps in with no transform. */
  x: number;
  y: number;
  /** Optional relative depth a 3D-capable provider may supply; absent for 2D-only providers. */
  z?: number;
  confidence: number;
  visibility: BodyLandmarkVisibility;
}

export interface BodyLandmarkSet {
  id: string;
  assessment_id: string;
  capture_id: string;
  member_id: string;
  provider_name: string | null;
  model_version: string | null;
  landmarks: BodyLandmarkPoint[];
  detected_at: string | null;
  created_at: string;
}

export type PostureFindingType =
  | 'forward_head'
  | 'rounded_shoulders'
  | 'elevated_shoulder'
  | 'pelvic_tilt'
  | 'thoracic_kyphosis'
  | 'lumbar_posture'
  | 'knee_valgus'
  | 'foot_turnout'
  | 'weight_shift'
  | 'breathing_pattern'
  | 'hip_asymmetry'
  // Added for the on-device MediaPipe screening provider
  // (lib/body-assessment/postureMeasurements.ts) — each is a composite of
  // several external landmark signals that doesn't map onto any single
  // finding type above without either mislabeling it (e.g. calling a
  // general trunk-inclination estimate "thoracic_kyphosis" would imply
  // thoracic curvature was actually measured, which it wasn't) or losing
  // the distinction coaches need between "one shoulder/hip is higher"
  // (already covered above) and "several signals together suggest a
  // broader visible pattern." See that file's docblock for exactly which
  // landmarks/formula feed each one and the screening-only wording rules.
  | 'lateral_trunk_asymmetry'
  | 'lower_crossed_pattern'
  | 'sagittal_trunk_posture'
  | 'pelvic_drop_screening'
  | 'custom';

export type FindingSide = 'left' | 'right' | 'bilateral' | 'not_applicable';
export type FindingSeverity = 'none' | 'mild' | 'moderate' | 'significant' | 'unknown';
export type FindingStatus =
  'draft' | 'pending_review' | 'confirmed' | 'coach_overridden' | 'dismissed' | 'superseded';

export interface FindingEvidenceRef {
  type: 'capture' | 'landmark_set' | 'angle_measurement' | 'coach_observation' | string;
  id: string;
  note?: string;
}

export interface BodyAssessmentFinding {
  id: string;
  assessment_id: string;
  member_id: string;
  finding_type: PostureFindingType;
  side: FindingSide;
  severity: FindingSeverity;
  confidence: number;
  narrative: string | null;
  evidence: FindingEvidenceRef[];
  provider_name: string | null;
  status: FindingStatus;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  coach_override_notes: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ComparisonTrend = 'improved' | 'stable' | 'declined' | 'unknown';

export interface BodyAssessmentComparison {
  id: string;
  member_id: string;
  assessment_a_id: string;
  assessment_b_id: string;
  /** A PostureFindingType, or 'overall' for the whole-assessment rollup. */
  dimension: PostureFindingType | 'overall';
  trend: ComparisonTrend;
  confidence: number;
  summary: string;
  details: unknown[];
  created_at: string;
}

export type BodyAssessmentReviewStatus =
  'in_review' | 'approved' | 'changes_requested' | 'completed';

export interface BodyAssessmentCoachReview {
  id: string;
  assessment_id: string;
  member_id: string;
  coach_id: string;
  review_status: BodyAssessmentReviewStatus;
  observations: string | null;
  recommendations: string | null;
  findings_approved: boolean;
  reassessment_marked_complete: boolean;
  created_at: string;
}

/**
 * Coach Review Dashboard support types — see
 * supabase/migrations/00000000000038_body_assessment_review_workspace.sql.
 */

/** A freeform, autosaved scratchpad note per assessment — NOT append-only, unlike BodyAssessmentCoachReview. Coach-only. */
export interface BodyAssessmentNote {
  id: string;
  assessment_id: string;
  member_id: string;
  content: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnotationShapeType = 'line' | 'arrow' | 'circle' | 'text' | 'freedraw';

/** Normalized [0,1] image-space coordinates — same convention as BodyLandmarkPoint, so shapes stay correct across zoom levels and a future angle-measurement tool can read them directly. */
export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationShape {
  id: string;
  type: AnnotationShapeType;
  /** line/arrow: [start, end]. circle: [center, edge]. text: [anchor]. freedraw: the full sampled path. */
  points: AnnotationPoint[];
  color: string;
  strokeWidth: number;
  text?: string;
  /** Populated by a future angle-measurement tool — nothing computes this yet. */
  measurement?: {
    angleDegrees: number;
    label?: string;
  };
}

/** One row per capture — a whole-array upsert of every shape drawn on that capture. */
export interface BodyAssessmentAnnotationSet {
  id: string;
  capture_id: string;
  assessment_id: string;
  member_id: string;
  shapes: AnnotationShape[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
