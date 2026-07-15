/**
 * Estimated postural measurements computed from a single validated,
 * standing capture's pose landmarks — the on-device "provider" for the
 * AI Body Assessment Framework's finding model (see
 * lib/body-assessment/providers/types.ts and providers/registry.ts, which
 * already reserve the name 'mediapipe'). This is NOT wired through
 * BodyAssessmentProvider.analyzeAssessment(): that interface assumes a
 * server-callable vision API fetching an already-uploaded image by signed
 * URL, but MediaPipe Tasks Vision is a browser/WASM library with no
 * practical Node/serverless story. Instead, CameraCapture.tsx already has
 * live landmarks for the exact frame it captures (the one that passed
 * every validatePoseFrame check and held stable) — this module turns
 * THOSE landmarks into estimates at capture time, and
 * app/actions/body-assessment.ts's recordLandmarkSetAction/
 * recordPostureFindingsAction persist them under the member's own RLS
 * session, same as any other member-authored write in this app.
 *
 * ============================================================
 * CLINICAL BOUNDARY — read before changing any wording in this file
 * ============================================================
 * This is a wellness/posture-SCREENING tool, not a diagnostic system. A
 * phone camera cannot see individual vertebrae, cannot calculate a true
 * Cobb angle, and cannot directly measure cervical/thoracic/lumbar
 * spinal curvature. Every estimate below:
 *   - is computed from EXTERNAL 2D landmark positions only (no depth
 *     sensing, no anatomical reference markers, no calibration object),
 *   - is labeled a "screening indicator" / "estimate" / "possible X",
 *     never a diagnosis or a named clinical condition,
 *   - is rejected (returns null, not a low-confidence guess) when the
 *     landmarks it needs aren't confidently visible,
 *   - uses THRESHOLDS chosen as coarse, adjustable screening bounds for
 *     product purposes — NONE are derived from peer-reviewed clinical
 *     literature, and every one is called out as such at its definition.
 *     A practitioner should calibrate these for their own population
 *     before treating them as meaningful, not assume they're validated.
 *
 * Never write member-or-practitioner-facing text that names a medical
 * condition (scoliosis, lower-crossed syndrome, kyphosis-as-diagnosis,
 * Trendelenburg sign, a spinal disorder) as something the member HAS.
 * The allowed vocabulary is: "screening indicator", "estimated",
 * "possible asymmetry", "requires practitioner review", "not a
 * diagnosis". See the narrative string in each compute* function below —
 * that wording is the actual product surface, not a formality.
 *
 * ============================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT COMPUTE (and why)
 * ============================================================
 * - Anterior/posterior PELVIC TILT (rotation of the pelvis in the
 *   sagittal plane): needs pelvis-orientation landmarks (ASIS/PSIS/iliac
 *   crest) that BlazePose's 33-point topology does not provide — only
 *   hip JOINT CENTER position, which cannot reveal pelvis rotation. Not
 *   computed; documented as a hard landmark limitation, not approximated.
 * - Per-region cervical/thoracic/lumbar CURVATURE: there is no
 *   individual C7/T-spine/L-spine landmark to anchor a region boundary
 *   to. What IS computed (see computeSagittalTrunkPosture) is a single
 *   combined head/neck + trunk inclination estimate — explicitly not
 *   presented as three separate spinal region measurements.
 * - Scapular-height asymmetry, ribcage-to-pelvis relationship, waist-
 *   triangle asymmetry, trunk-rotation-from-segmentation: all need
 *   landmarks (scapula, ribcage) or image segmentation this pose model
 *   doesn't supply. Not computed.
 * - Any physical unit (centimeters/inches): with no calibration
 *   reference object or known camera distance, every value here stays in
 *   normalized image-space ratios or degrees — never presented as a
 *   physical measurement. See lib/body-assessment/calibration.ts.
 */

import type {
  BodyAssessmentCaptureType,
  FindingSeverity,
  FindingSide,
  PostureFindingType,
} from '@mef/shared-types-contracts';
import type { CorePoseLandmarks } from './poseTypes';
import { computePoseMetrics, angleFromHorizontal, type PoseMetrics } from './poseMetrics';

export type PostureEstimate = {
  findingType: PostureFindingType;
  side: FindingSide;
  /** The objective geometric computation — degrees or a dimensionless ratio, per `unit`. This number is never itself the diagnosis; the narrative below is the only member/practitioner-facing claim. */
  value: number;
  unit: 'degrees' | 'ratio';
  /** Landmark-visibility-derived, 0-1 — how much to trust `value`, not how severe the finding is. */
  confidence: number;
  severity: FindingSeverity;
  narrative: string;
  /** Landmark keys this estimate was computed from — the practitioner dashboard's evidence trail. */
  landmarksUsed: string[];
};

/** Below this, we don't even attempt an estimate — "reject the measurement" per the product requirement, not report a guess with a low confidence score attached. */
const MIN_CONFIDENCE_TO_ESTIMATE = 0.45;

function visOf(v: number | undefined): number {
  return v ?? 1;
}

/**
 * The weakest required landmark, not an average — "reject the
 * measurement when the ear, shoulder, or required reference landmarks
 * are not confidently visible" means every one of them must clear the
 * bar independently. Averaging would let one highly-confident landmark
 * (e.g. the shoulder) mask another barely-visible one (e.g. the ear) and
 * still produce a number we'd report.
 */
function confidenceFrom(visibilities: number[]): number {
  return Math.min(...visibilities);
}

/**
 * A. Forward-head posture — estimated craniovertebral angle.
 *
 * Landmarks: the ear and shoulder on whichever side is more confidently
 * visible (a side-view capture only ever shows one side well).
 * Formula: angle between the horizontal and the line from the shoulder
 * (an external proxy for the C7/cervicothoracic junction — this pose
 * model has no C7 landmark, so this is an approximation of the clinical
 * CVA protocol, which uses palpated C7, not a shoulder landmark) to the
 * ear (a proxy for the tragus). Smaller angles are the direction
 * associated with more forward head carriage in photographic posture
 * screening protocols generally; the exact numeric flag threshold below
 * is a coarse product screening bound, NOT a cited clinical cutoff — see
 * this file's docblock.
 */
export function computeForwardHeadEstimate(
  core: CorePoseLandmarks,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'left_side' && captureType !== 'right_side') return null;

  const useLeft = visOf(core.leftEar.visibility) >= visOf(core.rightEar.visibility);
  const ear = useLeft ? core.leftEar : core.rightEar;
  const shoulder = useLeft ? core.leftShoulder : core.rightShoulder;
  const side: FindingSide = useLeft ? 'left' : 'right';

  const confidence = confidenceFrom([visOf(ear.visibility), visOf(shoulder.visibility)]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const angle = angleFromHorizontal(shoulder, ear);
  // Screening-only bound, not a clinical cutoff — see docblock.
  const FORWARD_HEAD_SCREENING_THRESHOLD_DEGREES = 50;
  const possible = angle < FORWARD_HEAD_SCREENING_THRESHOLD_DEGREES;

  return {
    findingType: 'forward_head',
    side,
    value: Math.round(angle * 10) / 10,
    unit: 'degrees',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Estimated craniovertebral angle (photographic estimate, ear-to-shoulder line vs. horizontal): ${angle.toFixed(1)}°. This is a screening indicator of possible forward-head posture, not a diagnosis — requires practitioner review.`
      : `Estimated craniovertebral angle (photographic estimate): ${angle.toFixed(1)}°. No forward-head screening indicator flagged at this angle.`,
    landmarksUsed: [useLeft ? 'left_ear' : 'right_ear', useLeft ? 'left_shoulder' : 'right_shoulder'],
  };
}

/**
 * B. Shoulder alignment — front/back views.
 * Landmarks: left/right shoulder (height difference, line angle vs.
 * horizontal); left/right shoulder z (rotation), only when the pose
 * model supplies depth. Scapular-height asymmetry is NOT computed — this
 * pose model has no scapula landmark.
 */
export function computeShoulderAlignment(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'front' && captureType !== 'back') return null;

  const confidence = confidenceFrom([
    visOf(core.leftShoulder.visibility),
    visOf(core.rightShoulder.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  // Screening-only bound, not a clinical cutoff — see docblock.
  const SHOULDER_HEIGHT_DIFF_SCREENING_THRESHOLD = 0.08;
  const possible = metrics.shoulderHeightDiffRatio > SHOULDER_HEIGHT_DIFF_SCREENING_THRESHOLD;
  const higherSide: FindingSide = core.leftShoulder.y < core.rightShoulder.y ? 'left' : 'right';

  const rotationNote =
    metrics.shoulderDepthDiffRatio !== null
      ? ` Estimated shoulder rotation (depth-based): ${(metrics.shoulderDepthDiffRatio * 100).toFixed(0)}% of shoulder width.`
      : '';

  return {
    findingType: 'elevated_shoulder',
    side: possible ? higherSide : 'bilateral',
    value: Math.round(metrics.shoulderHeightDiffRatio * 1000) / 1000,
    unit: 'ratio',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Possible shoulder-height asymmetry — screening indicator, not a diagnosis. Shoulder line angle vs. horizontal: ${metrics.shoulderLineAngle.toFixed(1)}°.${rotationNote} Requires practitioner review.`
      : `No shoulder-height asymmetry screening indicator flagged. Shoulder line angle vs. horizontal: ${metrics.shoulderLineAngle.toFixed(1)}°.${rotationNote}`,
    landmarksUsed: ['left_shoulder', 'right_shoulder'],
  };
}

/**
 * C. Pelvic/hip alignment — front/back views only (see docblock for why
 * anterior/posterior pelvic ORIENTATION from the side view is not
 * computed: no pelvis-rotation landmarks exist in this pose model).
 * Landmarks: left/right hip (height difference, line angle, lateral
 * shift relative to the ankle midpoint as a base-of-support reference).
 */
export function computeHipAlignment(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'front' && captureType !== 'back') return null;

  const confidence = confidenceFrom([visOf(core.leftHip.visibility), visOf(core.rightHip.visibility)]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  // Screening-only bounds, not clinical cutoffs — see docblock.
  const HIP_HEIGHT_DIFF_SCREENING_THRESHOLD = 0.08;
  const LATERAL_SHIFT_SCREENING_THRESHOLD = 0.06;

  const heightPossible = metrics.hipHeightDiffRatio > HIP_HEIGHT_DIFF_SCREENING_THRESHOLD;
  const lateralShiftRatio =
    metrics.hipWidth > 1e-4 ? (metrics.hipMid.x - metrics.ankleMid.x) / metrics.hipWidth : 0;
  const shiftPossible = Math.abs(lateralShiftRatio) > LATERAL_SHIFT_SCREENING_THRESHOLD;
  const possible = heightPossible || shiftPossible;
  const lowerSide: FindingSide = core.leftHip.y > core.rightHip.y ? 'left' : 'right';

  return {
    findingType: 'hip_asymmetry',
    side: possible ? lowerSide : 'bilateral',
    value: Math.round(metrics.hipHeightDiffRatio * 1000) / 1000,
    unit: 'ratio',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Possible hip alignment asymmetry — screening indicator, not a diagnosis (possible pelvic drop and/or lateral pelvic shift). Hip line angle vs. horizontal: ${metrics.hipLineAngle.toFixed(1)}°, lateral shift estimate: ${(lateralShiftRatio * 100).toFixed(0)}% of hip width. Requires practitioner review.`
      : `No hip alignment asymmetry screening indicator flagged. Hip line angle vs. horizontal: ${metrics.hipLineAngle.toFixed(1)}°.`,
    landmarksUsed: ['left_hip', 'right_hip', 'left_ankle', 'right_ankle'],
  };
}

/**
 * E. Lateral trunk asymmetry screening indicator — front/back views.
 * A composite of shoulder-height, hip-height, torso-midline offset, and
 * head-to-pelvis lateral displacement. Deliberately does NOT compute a
 * Cobb angle and never names scoliosis — see docblock. Waist-triangle
 * asymmetry and trunk-rotation-from-segmentation are NOT included: both
 * need image segmentation this pose model doesn't provide.
 */
export function computeLateralTrunkAsymmetry(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'front' && captureType !== 'back') return null;

  const confidence = confidenceFrom([
    visOf(core.leftShoulder.visibility),
    visOf(core.rightShoulder.visibility),
    visOf(core.leftHip.visibility),
    visOf(core.rightHip.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const torsoMidlineOffsetRatio =
    metrics.shoulderWidth > 1e-4
      ? Math.abs(metrics.shoulderMid.x - metrics.hipMid.x) / metrics.shoulderWidth
      : 0;
  const headToPelvisOffsetRatio =
    metrics.shoulderWidth > 1e-4 ? Math.abs(core.nose.x - metrics.hipMid.x) / metrics.shoulderWidth : 0;

  // Screening-only bounds, not clinical cutoffs — see docblock. Any one
  // signal exceeding its bound is enough to flag "visible asymmetry" —
  // this is intentionally a sensitive (not specific) screen: false
  // positives get filtered out by practitioner review, false negatives
  // would mean missing something worth a second look.
  const signals = [
    metrics.shoulderHeightDiffRatio > 0.08,
    metrics.hipHeightDiffRatio > 0.08,
    torsoMidlineOffsetRatio > 0.15,
    headToPelvisOffsetRatio > 0.2,
  ];
  const flagCount = signals.filter(Boolean).length;
  const possible = flagCount > 0;

  return {
    findingType: 'lateral_trunk_asymmetry',
    side: 'bilateral',
    value: flagCount,
    unit: 'ratio',
    confidence,
    severity: flagCount >= 2 ? 'moderate' : possible ? 'mild' : 'none',
    narrative: possible
      ? `Visible asymmetry detected across ${flagCount} of 4 external signals (shoulder height, hip height, trunk midline offset, head-to-pelvis offset). This is a screening indicator only — not a measurement of spinal curvature and not a diagnosis. Practitioner review recommended.`
      : 'No visible lateral trunk asymmetry screening indicator flagged across the external signals checked.',
    landmarksUsed: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'nose'],
  };
}

/**
 * F. Lower-crossed posture screening indicators — side views only.
 * Computes what IS measurable externally: hip position relative to the
 * ankle (forward hip translation), knee angle, and forward trunk
 * displacement relative to the ankle. Anterior pelvic ORIENTATION and
 * ribcage-to-pelvis relationship are NOT computed (no pelvis-rotation or
 * ribcage landmarks) — see docblock.
 */
export function computeLowerCrossedIndicators(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'left_side' && captureType !== 'right_side') return null;

  const confidence = confidenceFrom([
    visOf(core.leftHip.visibility),
    visOf(core.rightHip.visibility),
    visOf(core.leftKnee.visibility),
    visOf(core.rightKnee.visibility),
    visOf(core.leftAnkle.visibility),
    visOf(core.rightAnkle.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const bodyScale = Math.max(metrics.bodySpan, 1e-4);
  const hipForwardOffsetRatio = (metrics.hipMid.x - metrics.ankleMid.x) / bodyScale;
  const trunkForwardOffsetRatio = (metrics.shoulderMid.x - metrics.ankleMid.x) / bodyScale;
  const avgKneeAngle = (metrics.leftKneeAngle + metrics.rightKneeAngle) / 2;

  // Screening-only bounds, not clinical cutoffs — see docblock.
  const signals = [
    Math.abs(hipForwardOffsetRatio) > 0.08,
    Math.abs(trunkForwardOffsetRatio) > 0.1,
    avgKneeAngle < 170,
  ];
  const flagCount = signals.filter(Boolean).length;
  const possible = flagCount >= 2;

  return {
    findingType: 'lower_crossed_pattern',
    side: 'not_applicable',
    value: flagCount,
    unit: 'ratio',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Possible lower-crossed postural pattern — practitioner review required. Contributing visible signals: hip position relative to ankle, forward trunk displacement, and knee position (${flagCount} of 3 checked). Not a diagnosis of lower-crossed syndrome; anterior pelvic tilt itself is not measured (requires pelvis-orientation landmarks this pose model does not provide).`
      : 'No lower-crossed postural pattern screening indicator flagged across the external signals checked.',
    landmarksUsed: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  };
}

/**
 * G. Sagittal trunk posture — side views only. A SINGLE combined
 * head/neck + trunk inclination estimate, deliberately not split into
 * per-region cervical/thoracic/lumbar numbers (no landmark anchors that
 * region boundary) — see docblock.
 */
export function computeSagittalTrunkPosture(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'left_side' && captureType !== 'right_side') return null;

  const useLeft = visOf(core.leftEar.visibility) >= visOf(core.rightEar.visibility);
  const ear = useLeft ? core.leftEar : core.rightEar;
  const shoulder = useLeft ? core.leftShoulder : core.rightShoulder;

  const confidence = confidenceFrom([visOf(ear.visibility), visOf(shoulder.visibility)]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const neckInclination = angleFromHorizontal(shoulder, ear);
  const trunkInclination = metrics.torsoAngleFromVertical;

  return {
    findingType: 'sagittal_trunk_posture',
    side: 'not_applicable',
    value: Math.round(trunkInclination * 10) / 10,
    unit: 'degrees',
    confidence,
    severity: 'unknown',
    narrative:
      `External posture estimate (not a spinal curvature measurement): neck inclination ` +
      `${neckInclination.toFixed(1)}° from horizontal, trunk inclination ${trunkInclination.toFixed(1)}° ` +
      `from vertical. This pose model cannot separate cervical, thoracic, and lumbar curvature ` +
      `individually from external landmarks — reported as one combined sagittal alignment ` +
      `estimate for practitioner review, not per-region spinal measurements.`,
    landmarksUsed: [useLeft ? 'left_ear' : 'right_ear', useLeft ? 'left_shoulder' : 'right_shoulder', 'left_hip', 'right_hip'],
  };
}

/** Runs every applicable estimate for one capture and returns only the ones with enough landmark confidence to report — never a partially-filled guess. */
export function computePostureEstimates(
  points: CorePoseLandmarks,
  captureType: BodyAssessmentCaptureType
): PostureEstimate[] {
  const metrics = computePoseMetrics(points);
  const candidates = [
    computeForwardHeadEstimate(points, captureType),
    computeShoulderAlignment(points, metrics, captureType),
    computeHipAlignment(points, metrics, captureType),
    computeLateralTrunkAsymmetry(points, metrics, captureType),
    computeLowerCrossedIndicators(points, metrics, captureType),
    computeSagittalTrunkPosture(points, metrics, captureType),
  ];
  return candidates.filter((c): c is PostureEstimate => c !== null);
}
