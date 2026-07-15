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
 * - Waist-triangle / torso-contour / body-outline measurements: these
 *   need image SEGMENTATION (a pixel-level body mask), not point
 *   landmarks — BlazePose gives 33 discrete points, not a contour. This
 *   file is architected so a future segmentation-based provider could
 *   slot in as additional compute* functions following the same
 *   reject-rather-than-fabricate discipline (gated confidence, screening-
 *   only language, no clinical claims) — but no such provider exists yet,
 *   so nothing here fakes a contour measurement from landmark points.
 *
 * ============================================================
 * MEASUREMENT REGISTRY (see MEASUREMENT_REGISTRY below)
 * ============================================================
 * Every measurement this engine produces — the six original single-frame
 * estimates plus the frontal-plane/whole-body ones added afterward — is
 * also declared in the MEASUREMENT_REGISTRY export as plain data (id,
 * category, landmarks used, required view(s), min confidence, unit,
 * result type). That registry is for INTROSPECTION only (e.g. a future
 * "what can this engine measure" practitioner screen) — it does not
 * drive any of the compute logic below, which remains the source of
 * truth. Keep the registry in sync by hand when adding/removing a
 * compute* function.
 */

import type {
  BodyAssessmentCaptureType,
  FindingSeverity,
  FindingSide,
  PostureFindingType,
} from '@mef/shared-types-contracts';
import type { CorePoseLandmarks, RawPoseLandmark } from './poseTypes';
import { POSE_LANDMARK_INDEX } from './poseTypes';
import {
  computePoseMetrics,
  angleFromHorizontal,
  angleFromVertical,
  type PoseMetrics,
  type Point,
} from './poseMetrics';

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

/**
 * Linear interpolation helper for knee-alignment: the x-coordinate a
 * straight line from `a` to `b` would pass through at a given `y`. This
 * is plain linear algebra (no trigonometry), specific to the knee-line
 * formula below — not a general primitive, so it lives here rather than
 * in poseMetrics.ts.
 */
function lineXAtY(a: Point, b: Point, y: number): number {
  if (Math.abs(b.y - a.y) < 1e-6) return a.x;
  const t = (y - a.y) / (b.y - a.y);
  return a.x + t * (b.x - a.x);
}

/**
 * H. Frontal-plane knee alignment ("knee valgus/varus") — front/back
 * views only. A 2D screening proxy, computed per side as how far the
 * knee sits, horizontally, from the straight hip-to-ankle line at the
 * knee's height — normalized by hip width so it's scale-independent.
 * Positive = the knee sits MEDIAL to that line (toward the body midline
 * — the "knock-knee"/valgus direction); negative = LATERAL (the "bow-
 * leg"/varus direction). The database finding_type constraint only has
 * `knee_valgus` (no separate `knee_varus` value — see this file's final
 * implementation report for the exact migration that would add one) so
 * both directions are reported under `knee_valgus`, disambiguated in the
 * narrative and by the sign of `value`.
 *
 * This is explicitly NOT a true frontal-plane knee-valgus measurement:
 * from a single 2D camera, a knee that is genuinely deviated medially
 * looks identical to a knee that is simply rotated (tibial/femoral
 * rotation), or to an artifact of stance width or camera angle/parallax.
 * Screening indicator only.
 */
export function computeKneeAlignmentEstimate(
  core: CorePoseLandmarks,
  metrics: PoseMetrics,
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'front' && captureType !== 'back') return null;

  const confidence = confidenceFrom([
    visOf(core.leftHip.visibility),
    visOf(core.rightHip.visibility),
    visOf(core.leftKnee.visibility),
    visOf(core.rightKnee.visibility),
    visOf(core.leftAnkle.visibility),
    visOf(core.rightAnkle.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const referenceWidth = Math.max(metrics.hipWidth, 1e-4);

  // Direction "toward the midline" differs per side, so compute a
  // per-side sign from where the midline (hip midpoint) sits relative to
  // that side's own hip, rather than assuming a fixed left/right convention.
  const leftMedialSign = Math.sign(metrics.hipMid.x - core.leftHip.x) || 1;
  const rightMedialSign = Math.sign(metrics.hipMid.x - core.rightHip.x) || -1;

  const leftLineX = lineXAtY(core.leftHip, core.leftAnkle, core.leftKnee.y);
  const rightLineX = lineXAtY(core.rightHip, core.rightAnkle, core.rightKnee.y);

  const leftRatio = ((core.leftKnee.x - leftLineX) * leftMedialSign) / referenceWidth;
  const rightRatio = ((core.rightKnee.x - rightLineX) * rightMedialSign) / referenceWidth;

  // Screening-only bound, not a clinical cutoff — see docblock.
  const KNEE_ALIGNMENT_SCREENING_THRESHOLD = 0.12;
  const leftPossible = Math.abs(leftRatio) > KNEE_ALIGNMENT_SCREENING_THRESHOLD;
  const rightPossible = Math.abs(rightRatio) > KNEE_ALIGNMENT_SCREENING_THRESHOLD;
  const possible = leftPossible || rightPossible;

  let side: FindingSide = 'bilateral';
  if (leftPossible && !rightPossible) side = 'left';
  else if (rightPossible && !leftPossible) side = 'right';

  const directionLabel = (ratio: number): string =>
    ratio > 0 ? 'valgus/medial (knee drifting inward)' : 'varus/lateral (knee drifting outward)';

  const flaggedRatio = Math.abs(leftRatio) >= Math.abs(rightRatio) ? leftRatio : rightRatio;

  return {
    findingType: 'knee_valgus',
    side,
    value: Math.round(flaggedRatio * 1000) / 1000,
    unit: 'ratio',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Possible frontal-plane knee deviation — screening indicator, not a diagnosis. Left knee offset from the hip-ankle line: ${(leftRatio * 100).toFixed(0)}% of hip width (${directionLabel(leftRatio)}); right: ${(rightRatio * 100).toFixed(0)}% (${directionLabel(rightRatio)}). This 2D estimate cannot distinguish true valgus/varus from foot rotation, stance width, or camera-angle artifacts. Requires practitioner review.`
      : `No frontal-plane knee deviation screening indicator flagged. Left knee offset: ${(leftRatio * 100).toFixed(0)}% of hip width, right: ${(rightRatio * 100).toFixed(0)}%.`,
    landmarksUsed: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  };
}

/**
 * I. Foot turnout — front/back views only. Needs heel + foot-index
 * landmarks that CorePoseLandmarks (13 points) deliberately does not
 * include (see poseTypes.ts), so this function takes the raw 33-point
 * `RawPoseLandmark[]` array directly — the same shape landmarkMapping.ts
 * consumes — rather than the narrower CorePoseLandmarks, and pulls the
 * indices it needs via POSE_LANDMARK_INDEX (read-only import from
 * poseTypes.ts, not a modification of it).
 *
 * Formula, per foot: the image-plane angle of the heel-to-toe vector
 * from vertical (reusing poseMetrics.ts's angleFromVertical — never
 * recomputing raw trig here). In a front/back capture with feet pointing
 * straight ahead (neutral), the toe sits roughly directly above/below
 * the heel in the image (near-0° from vertical); as a foot turns outward
 * or inward, the toe swings sideways, increasing that angle. Sign
 * indicates direction: positive = turned outward (away from the body
 * midline), negative = turned inward — computed relative to each foot's
 * own side, same per-side-midline-sign approach as the knee estimate
 * above.
 *
 * This is a coarse 2D proxy, not a true transverse-plane foot-progression
 * angle: it cannot separate genuine foot rotation from stance width or
 * camera perspective, and is NOT corrected for camera angle. If either
 * foot's heel/foot-index landmarks aren't confidently visible, the whole
 * estimate is suppressed rather than guessed for the occluded foot.
 */
export function computeFootTurnoutEstimate(
  rawLandmarks: RawPoseLandmark[],
  captureType: BodyAssessmentCaptureType
): PostureEstimate | null {
  if (captureType !== 'front' && captureType !== 'back') return null;

  const idx = POSE_LANDMARK_INDEX;
  const leftHip = rawLandmarks[idx.leftHip];
  const rightHip = rawLandmarks[idx.rightHip];
  const leftHeel = rawLandmarks[idx.leftHeel];
  const rightHeel = rawLandmarks[idx.rightHeel];
  const leftFootIndex = rawLandmarks[idx.leftFootIndex];
  const rightFootIndex = rawLandmarks[idx.rightFootIndex];
  if (!leftHip || !rightHip || !leftHeel || !rightHeel || !leftFootIndex || !rightFootIndex) {
    return null;
  }

  const confidence = confidenceFrom([
    visOf(leftHeel.visibility),
    visOf(rightHeel.visibility),
    visOf(leftFootIndex.visibility),
    visOf(rightFootIndex.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const midlineX = (leftHip.x + rightHip.x) / 2;
  const leftLateralSign = Math.sign(leftHip.x - midlineX) || 1;
  const rightLateralSign = Math.sign(rightHip.x - midlineX) || -1;

  const leftAngleMagnitude = angleFromVertical(leftHeel, leftFootIndex);
  const rightAngleMagnitude = angleFromVertical(rightHeel, rightFootIndex);
  const leftTurnoutSign = Math.sign(leftFootIndex.x - leftHeel.x) * leftLateralSign || 1;
  const rightTurnoutSign = Math.sign(rightFootIndex.x - rightHeel.x) * rightLateralSign || 1;
  const leftSignedAngle = leftAngleMagnitude * leftTurnoutSign;
  const rightSignedAngle = rightAngleMagnitude * rightTurnoutSign;

  // Screening-only bound, not a clinical cutoff — see docblock.
  const FOOT_TURNOUT_SCREENING_THRESHOLD_DEGREES = 30;
  const leftPossible = Math.abs(leftSignedAngle) > FOOT_TURNOUT_SCREENING_THRESHOLD_DEGREES;
  const rightPossible = Math.abs(rightSignedAngle) > FOOT_TURNOUT_SCREENING_THRESHOLD_DEGREES;
  const possible = leftPossible || rightPossible;

  let side: FindingSide = 'bilateral';
  if (leftPossible && !rightPossible) side = 'left';
  else if (rightPossible && !leftPossible) side = 'right';

  const describeDirection = (angle: number): string =>
    angle > 0 ? 'turned outward' : angle < 0 ? 'turned inward' : 'neutral';

  const flaggedAngle = Math.abs(leftSignedAngle) >= Math.abs(rightSignedAngle) ? leftSignedAngle : rightSignedAngle;

  return {
    findingType: 'foot_turnout',
    side,
    value: Math.round(flaggedAngle * 10) / 10,
    unit: 'degrees',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Estimated foot-direction angle (heel-to-toe line vs. vertical, 2D image-plane proxy): left ${leftSignedAngle.toFixed(1)}° (${describeDirection(leftSignedAngle)}), right ${rightSignedAngle.toFixed(1)}° (${describeDirection(rightSignedAngle)}). This is a screening indicator only — it cannot separate true foot rotation from stance width or camera-angle artifacts, and is not a diagnosis. Requires practitioner review.`
      : `No foot-turnout screening indicator flagged. Estimated foot-direction angle: left ${leftSignedAngle.toFixed(1)}°, right ${rightSignedAngle.toFixed(1)}°.`,
    landmarksUsed: ['left_heel', 'right_heel', 'left_foot_index', 'right_foot_index', 'left_hip', 'right_hip'],
  };
}

/**
 * J. Weight shift / center-of-mass proxy — front/back views only.
 *
 * Centroid choice: the midpoint of shoulderMid and hipMid (a "visible-
 * mass centroid," roughly the torso's midpoint), NOT hipMid alone. This
 * is deliberate: computeHipAlignment already reports hipMid's lateral
 * shift relative to the ankle midpoint as part of possible hip
 * asymmetry — reusing that exact same quantity here would just be
 * hip_asymmetry restated under a different finding_type. Averaging in
 * shoulderMid captures trunk lean as well as pelvis position, which is
 * closer to what "weight shift" means as an externally visible pattern
 * (a member visibly leaning/loading through one leg involves the whole
 * trunk, not just the pelvis). This is explicitly NOT a true center of
 * mass (that requires segment-mass-weighted 3D modeling this app has no
 * data for) — it is a 2D image-plane proxy, documented as such in the
 * narrative.
 *
 * Base of support: the midpoint between the two ankles (ankleMid),
 * normalized by the ankle-to-ankle span (the actual stance width — a
 * more physically appropriate "base of support" scale reference than
 * hip width for this specific measurement).
 */
export function computeWeightShiftEstimate(
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
    visOf(core.leftAnkle.visibility),
    visOf(core.rightAnkle.visibility),
  ]);
  if (confidence < MIN_CONFIDENCE_TO_ESTIMATE) return null;

  const centroidProxy: Point = {
    x: (metrics.shoulderMid.x + metrics.hipMid.x) / 2,
    y: (metrics.shoulderMid.y + metrics.hipMid.y) / 2,
  };
  const stanceWidth = Math.max(Math.abs(core.leftAnkle.x - core.rightAnkle.x), 1e-4);
  const lateralOffsetRatio = (centroidProxy.x - metrics.ankleMid.x) / stanceWidth;

  // Screening-only bound, not a clinical cutoff — see docblock.
  const WEIGHT_SHIFT_SCREENING_THRESHOLD = 0.15;
  const possible = Math.abs(lateralOffsetRatio) > WEIGHT_SHIFT_SCREENING_THRESHOLD;

  const towardLeft =
    Math.abs(centroidProxy.x - core.leftAnkle.x) < Math.abs(centroidProxy.x - core.rightAnkle.x);
  const side: FindingSide = possible ? (towardLeft ? 'left' : 'right') : 'bilateral';

  return {
    findingType: 'weight_shift',
    side,
    value: Math.round(lateralOffsetRatio * 1000) / 1000,
    unit: 'ratio',
    confidence,
    severity: possible ? 'mild' : 'none',
    narrative: possible
      ? `Possible weight-shift screening indicator — a 2D visible-mass centroid (midpoint of the shoulder and hip midpoints) sits ${(Math.abs(lateralOffsetRatio) * 100).toFixed(0)}% of stance width toward the ${towardLeft ? 'left' : 'right'} side, relative to the midpoint between both ankles. This is NOT a true center-of-mass or force-plate weight-distribution measurement, only a 2D image-plane proxy — not a diagnosis. Requires practitioner review.`
      : `No weight-shift screening indicator flagged. Visible-mass centroid offset from the base of support: ${(lateralOffsetRatio * 100).toFixed(0)}% of stance width.`,
    landmarksUsed: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle'],
  };
}

/**
 * ============================================================
 * WHOLE-BODY COMPOSITE SCORES
 * ============================================================
 * These are principled AGGREGATIONS of the estimates above — no new
 * landmark math, no new claims about anatomy. They intentionally are
 * NOT persisted as `body_assessment_findings` rows / a new
 * PostureFindingType: none of `overall_frontal_symmetry_score`,
 * `overall_sagittal_posture_score`, `overall_alignment_confidence_score`,
 * `overall_capture_quality_score`, `overall_posture_screening_score`, or
 * `measurement_reliability_score` exist in the
 * body_assessment_findings_finding_type_check constraint (see
 * supabase/migrations/00000000000037_body_assessment.sql and
 * .../00000000000050_body_assessment_finding_types_screening.sql — both
 * read to confirm). Adding them there would need a new migration, and
 * supabase/migrations/ is owned by a different concurrent workstream, so
 * this file instead exposes them as pure derived/UI-facing summary
 * functions computed on demand from already-computed PostureEstimate[]
 * arrays — nothing to persist, nothing to migrate, no drift risk between
 * a stored row and the estimates it was supposedly summarizing.
 *
 * Convention: every composite score is a 0-1 ratio, 1 = best (no
 * concerning signals / fully confident / fully covered), 0 = worst —
 * matching the existing `confidence` field's 0-1 convention in
 * PostureEstimate, for consistency within this file.
 *
 * Scope — deliberately split in two, because "how much of this one photo
 * can we trust" and "how did this whole assessment screen" are different
 * questions with different audiences:
 *   - computeCaptureCompositeScores is PER CAPTURE: it summarizes the
 *     PostureEstimate[] produced for ONE capture (one view). Its
 *     `overallCaptureQualityScore` is a CAPTURE-TECHNIQUE signal (did
 *     this photo yield enough confidently-visible landmarks?), not a
 *     posture signal — a low score here means "retake the photo," not
 *     "concerning posture."
 *   - computeAssessmentCompositeScores is PER ASSESSMENT, across every
 *     capture's estimates: it answers "how did this whole screening
 *     assessment turn out" and "how much should we trust it overall."
 * pelvic_drop_screening (lib/body-assessment/pelvicDropScreening.ts) is
 * deliberately NOT folded into either composite: it's a different,
 * time-series-shaped measurement from a different assessment type
 * (single_leg_balance), gated by its own confidence model, not
 * MIN_CONFIDENCE_TO_ESTIMATE — mixing its confidence into these ratios
 * would blur what each composite is actually summarizing.
 */

function severityPenalty(severity: FindingSeverity): number {
  switch (severity) {
    case 'none':
      return 0;
    case 'mild':
      return 0.2;
    case 'moderate':
      return 0.45;
    case 'significant':
      return 0.75;
    case 'unknown':
      // A small, non-zero penalty for an inconclusive read (e.g.
      // computeSagittalTrunkPosture, which always reports 'unknown'
      // severity by design) — not itself a flagged concern, but not
      // "confirmed clean" either.
      return 0.1;
    default:
      return 0.1;
  }
}

const FRONTAL_SYMMETRY_FINDING_TYPES: PostureFindingType[] = [
  'elevated_shoulder',
  'hip_asymmetry',
  'lateral_trunk_asymmetry',
  'knee_valgus',
  'foot_turnout',
  'weight_shift',
];

const SAGITTAL_POSTURE_FINDING_TYPES: PostureFindingType[] = [
  'forward_head',
  'sagittal_trunk_posture',
  'lower_crossed_pattern',
];

/** Severity+confidence weighted: 1.0 when nothing in `types` was flagged (or nothing applicable was even produced), decreasing as more/worse-severity findings appear, each weighted by how confident that particular finding was. */
function planeScore(estimates: PostureEstimate[], types: PostureFindingType[]): number {
  const relevant = estimates.filter((e) => types.includes(e.findingType));
  if (relevant.length === 0) return 1;
  const totalPenalty = relevant.reduce((sum, e) => sum + severityPenalty(e.severity) * e.confidence, 0);
  const avgPenalty = totalPenalty / relevant.length;
  return Math.max(0, Math.min(1, 1 - avgPenalty));
}

export type CaptureCompositeScores = {
  captureType: BodyAssessmentCaptureType;
  /** 0-1 — proportion of the single-frame measurements applicable to this view (per MEASUREMENT_REGISTRY) that were confidently producible for this capture, not suppressed for low landmark visibility. A capture-TECHNIQUE signal, not a posture signal. */
  overallCaptureQualityScore: number;
  /** 0-1 — mean confidence of the estimates that WERE produced for this capture (excludes suppressed ones entirely). Distinct from overallCaptureQualityScore: this is "how much to trust what came back," not "how much came back." */
  overallAlignmentConfidenceScore: number;
  /** 0-1, 1 = no visible frontal-plane asymmetry signals flagged. Only computed for front/back captures — null for side captures, where it isn't a meaningful question. */
  overallFrontalSymmetryScore: number | null;
  /** 0-1, 1 = no visible sagittal-plane posture signals flagged. Only computed for side captures — null for front/back. */
  overallSagittalPostureScore: number | null;
};

export function computeCaptureCompositeScores(
  estimates: PostureEstimate[],
  captureType: BodyAssessmentCaptureType
): CaptureCompositeScores {
  const applicableCount = MEASUREMENT_REGISTRY.filter(
    (m) => m.resultType !== 'composite' && m.requiredViews.includes(captureType)
  ).length;
  const overallCaptureQualityScore =
    applicableCount > 0 ? Math.max(0, Math.min(1, estimates.length / applicableCount)) : 0;

  const overallAlignmentConfidenceScore =
    estimates.length > 0
      ? estimates.reduce((sum, e) => sum + e.confidence, 0) / estimates.length
      : 0;

  const isFrontal = captureType === 'front' || captureType === 'back';
  const isSagittal = captureType === 'left_side' || captureType === 'right_side';

  return {
    captureType,
    overallCaptureQualityScore: Math.round(overallCaptureQualityScore * 1000) / 1000,
    overallAlignmentConfidenceScore: Math.round(overallAlignmentConfidenceScore * 1000) / 1000,
    overallFrontalSymmetryScore: isFrontal
      ? Math.round(planeScore(estimates, FRONTAL_SYMMETRY_FINDING_TYPES) * 1000) / 1000
      : null,
    overallSagittalPostureScore: isSagittal
      ? Math.round(planeScore(estimates, SAGITTAL_POSTURE_FINDING_TYPES) * 1000) / 1000
      : null,
  };
}

export type AssessmentCompositeScores = {
  /** 0-1, 1 = no concerning screening signals across any capture in the assessment. Severity+confidence weighted across every single-frame estimate produced by every capture. */
  overallPostureScreeningScore: number;
  /** 0-1 — how much to trust this assessment's measurements overall: the average, across every capture, of that capture's (overallCaptureQualityScore + overallAlignmentConfidenceScore) / 2. Low when photos were retaken/occluded/low-visibility OR when the estimates that did come back were low-confidence. */
  measurementReliabilityScore: number;
  captureCount: number;
  estimateCount: number;
};

/** Per-assessment: pass every capture's produced PostureEstimate[] for the whole assessment (all views), each tagged with its captureType. */
export function computeAssessmentCompositeScores(
  estimatesByCaptureType: { captureType: BodyAssessmentCaptureType; estimates: PostureEstimate[] }[]
): AssessmentCompositeScores {
  const allEstimates = estimatesByCaptureType.flatMap((c) => c.estimates);
  const captureScores = estimatesByCaptureType.map((c) =>
    computeCaptureCompositeScores(c.estimates, c.captureType)
  );

  const overallPostureScreeningScore =
    allEstimates.length > 0
      ? Math.max(
          0,
          Math.min(
            1,
            1 -
              allEstimates.reduce((sum, e) => sum + severityPenalty(e.severity) * e.confidence, 0) /
                allEstimates.length
          )
        )
      : 1;

  const measurementReliabilityScore =
    captureScores.length > 0
      ? captureScores.reduce(
          (sum, c) => sum + (c.overallCaptureQualityScore + c.overallAlignmentConfidenceScore) / 2,
          0
        ) / captureScores.length
      : 0;

  return {
    overallPostureScreeningScore: Math.round(overallPostureScreeningScore * 1000) / 1000,
    measurementReliabilityScore: Math.round(measurementReliabilityScore * 1000) / 1000,
    captureCount: estimatesByCaptureType.length,
    estimateCount: allEstimates.length,
  };
}

/**
 * ============================================================
 * MEASUREMENT_REGISTRY — declarative introspection data
 * ============================================================
 * Plain data, not a class, for a future practitioner-facing "what can
 * this engine measure" screen or any other code that needs to enumerate
 * this engine's capabilities without importing every compute* function.
 * `resultType`:
 *   - 'derived'   — a direct geometric computation from landmark
 *                   positions (e.g. shoulder height difference) with no
 *                   claim of standing in for an unmeasurable quantity.
 *   - 'estimated' — an explicit 2D proxy for something this pose model
 *                   cannot directly observe (e.g. forward-head CVA,
 *                   knee valgus, foot turnout) — see each function's
 *                   docblock for exactly what the proxy cannot capture.
 *   - 'composite' — aggregated FROM other entries in this registry
 *                   (the whole-body scores), not from raw landmarks.
 *   - 'direct'    — reserved for a future landmark-position-only entry
 *                   (none of the current measurements qualify — even
 *                   the "derived" ones combine two-plus landmarks).
 * pelvic_drop_screening (pelvicDropScreening.ts) is deliberately NOT
 * listed here: different module, different time-series input shape, own
 * confidence model — see that file's docblock.
 */
export type MeasurementCategory =
  | 'head_neck'
  | 'shoulders'
  | 'trunk'
  | 'pelvis_hips'
  | 'lower_extremity'
  | 'whole_body';

export type MeasurementResultType = 'direct' | 'derived' | 'estimated' | 'composite';

export type MeasurementRegistryEntry = {
  /** A PostureFindingType for finding-backed measurements, or a UI-facing composite-score id (not a DB finding_type — see the composite-scores docblock above) for the whole-body scores. */
  id: string;
  label: string;
  category: MeasurementCategory;
  landmarksUsed: string[];
  requiredViews: BodyAssessmentCaptureType[];
  /** 0-1. For composite entries this is 0 — they aren't gated the same reject-or-report way; their value directly reflects the confidence/coverage of the estimates they aggregate. */
  minConfidence: number;
  unit: 'degrees' | 'ratio' | 'score_0_1';
  resultType: MeasurementResultType;
  scope: 'per_capture' | 'per_assessment';
  notes: string;
};

/** Bump whenever a screening threshold constant in this file changes meaning (not on every edit — only when a value that could change an existing finding's severity/pass-fail changes). Stored on each finding (migration 51's threshold_config_version) so a finding can be traced back to the exact formula generation that produced it once these constants are later retuned. */
export const POSTURE_THRESHOLDS_VERSION = 'v1';

export const MEASUREMENT_REGISTRY: MeasurementRegistryEntry[] = [
  {
    id: 'forward_head',
    label: 'Forward head posture (estimated craniovertebral angle)',
    category: 'head_neck',
    landmarksUsed: ['left_ear', 'right_ear', 'left_shoulder', 'right_shoulder'],
    requiredViews: ['left_side', 'right_side'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'degrees',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Shoulder-to-ear line vs. horizontal, a proxy for the clinical CVA protocol (which uses palpated C7, unavailable here).',
  },
  {
    id: 'elevated_shoulder',
    label: 'Shoulder height/line alignment',
    category: 'shoulders',
    landmarksUsed: ['left_shoulder', 'right_shoulder'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'derived',
    scope: 'per_capture',
    notes: 'Direct shoulder-height difference, normalized by shoulder width; depth-based rotation note when z is available.',
  },
  {
    id: 'hip_asymmetry',
    label: 'Hip/pelvic alignment',
    category: 'pelvis_hips',
    landmarksUsed: ['left_hip', 'right_hip', 'left_ankle', 'right_ankle'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'derived',
    scope: 'per_capture',
    notes: 'Hip-height difference and lateral hip-to-ankle shift. Does not measure pelvis rotation/tilt (no ASIS/PSIS landmarks).',
  },
  {
    id: 'lateral_trunk_asymmetry',
    label: 'Lateral trunk asymmetry (composite external signal)',
    category: 'trunk',
    landmarksUsed: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'nose'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Count of 4 external asymmetry signals flagged. Not a Cobb angle or scoliosis measurement.',
  },
  {
    id: 'lower_crossed_pattern',
    label: 'Lower-crossed postural pattern (external signals)',
    category: 'pelvis_hips',
    landmarksUsed: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
    requiredViews: ['left_side', 'right_side'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Hip-forward offset, trunk-forward offset, knee angle — does not measure anterior pelvic tilt itself (no pelvis-orientation landmarks).',
  },
  {
    id: 'sagittal_trunk_posture',
    label: 'Sagittal trunk posture (combined external estimate)',
    category: 'trunk',
    landmarksUsed: ['left_ear', 'right_ear', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
    requiredViews: ['left_side', 'right_side'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'degrees',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'One combined neck+trunk inclination estimate — deliberately not split into cervical/thoracic/lumbar (no region-boundary landmarks).',
  },
  {
    id: 'knee_valgus',
    label: 'Frontal-plane knee alignment (valgus/varus screening proxy)',
    category: 'lower_extremity',
    landmarksUsed: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Knee offset from the hip-ankle line, normalized by hip width. Both valgus (positive) and varus (negative) reported under this one finding_type — DB constraint has no separate knee_varus value.',
  },
  {
    id: 'foot_turnout',
    label: 'Foot turnout/turn-in (2D direction proxy)',
    category: 'lower_extremity',
    landmarksUsed: ['left_heel', 'right_heel', 'left_foot_index', 'right_foot_index', 'left_hip', 'right_hip'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'degrees',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Heel-to-toe line vs. vertical. Requires raw 33-point landmarks (heel/foot-index are outside CorePoseLandmarks) — see computeFootTurnoutEstimate.',
  },
  {
    id: 'weight_shift',
    label: 'Weight shift (2D visible-mass centroid proxy)',
    category: 'whole_body',
    landmarksUsed: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle'],
    requiredViews: ['front', 'back'],
    minConfidence: MIN_CONFIDENCE_TO_ESTIMATE,
    unit: 'ratio',
    resultType: 'estimated',
    scope: 'per_capture',
    notes: 'Midpoint of shoulderMid/hipMid vs. ankle midpoint, normalized by stance width. Not a true center of mass.',
  },
  {
    id: 'overall_capture_quality_score',
    label: 'Capture quality score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['front', 'left_side', 'right_side', 'back'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_capture',
    notes: 'Proportion of applicable measurements confidently producible for one capture — a photo-retake signal, not a posture signal. See computeCaptureCompositeScores.',
  },
  {
    id: 'overall_alignment_confidence_score',
    label: 'Alignment confidence score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['front', 'left_side', 'right_side', 'back'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_capture',
    notes: 'Mean confidence of the estimates actually produced for one capture. See computeCaptureCompositeScores.',
  },
  {
    id: 'overall_frontal_symmetry_score',
    label: 'Frontal symmetry score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['front', 'back'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_capture',
    notes: 'Severity+confidence-weighted aggregation of frontal-plane findings for one front/back capture. See computeCaptureCompositeScores.',
  },
  {
    id: 'overall_sagittal_posture_score',
    label: 'Sagittal posture score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['left_side', 'right_side'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_capture',
    notes: 'Severity+confidence-weighted aggregation of sagittal-plane findings for one side capture. See computeCaptureCompositeScores.',
  },
  {
    id: 'overall_posture_screening_score',
    label: 'Overall posture screening score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['front', 'left_side', 'right_side', 'back'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_assessment',
    notes: 'Severity+confidence-weighted aggregation across every capture in the whole assessment. See computeAssessmentCompositeScores.',
  },
  {
    id: 'measurement_reliability_score',
    label: 'Measurement reliability score',
    category: 'whole_body',
    landmarksUsed: [],
    requiredViews: ['front', 'left_side', 'right_side', 'back'],
    minConfidence: 0,
    unit: 'score_0_1',
    resultType: 'composite',
    scope: 'per_assessment',
    notes: 'Average, across every capture, of that capture’s quality+confidence scores. How much to trust this assessment’s numbers overall. See computeAssessmentCompositeScores.',
  },
];

/** Runs every applicable estimate for one capture and returns only the ones with enough landmark confidence to report — never a partially-filled guess. */
export function computePostureEstimates(
  points: CorePoseLandmarks,
  captureType: BodyAssessmentCaptureType,
  /**
   * Optional raw 33-point landmark array (the same shape
   * landmarkMapping.ts consumes, e.g. CameraCapture.tsx's
   * `finalValidation.rawPoints`). Only computeFootTurnoutEstimate needs
   * it (heel/foot-index landmarks aren't in CorePoseLandmarks — see its
   * docblock). Omitting it simply omits the foot-turnout estimate from
   * the result, the same as any other suppressed-for-low-confidence
   * estimate — never a guess.
   */
  rawLandmarks?: RawPoseLandmark[]
): PostureEstimate[] {
  const metrics = computePoseMetrics(points);
  const candidates = [
    computeForwardHeadEstimate(points, captureType),
    computeShoulderAlignment(points, metrics, captureType),
    computeHipAlignment(points, metrics, captureType),
    computeLateralTrunkAsymmetry(points, metrics, captureType),
    computeLowerCrossedIndicators(points, metrics, captureType),
    computeSagittalTrunkPosture(points, metrics, captureType),
    computeKneeAlignmentEstimate(points, metrics, captureType),
    computeWeightShiftEstimate(points, metrics, captureType),
    rawLandmarks ? computeFootTurnoutEstimate(rawLandmarks, captureType) : null,
  ];
  return candidates.filter((c): c is PostureEstimate => c !== null);
}
