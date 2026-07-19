/**
 * Per-frame pose validation for guided posture photo capture. Pure
 * functions only (no browser/mediapipe APIs) so every check is
 * unit-testable with plain fixture landmarks — hooks/usePoseLandmarker.ts
 * owns turning camera frames into RawPoseLandmark[], CameraCapture.tsx
 * owns turning a sequence of these results into a stability timer /
 * auto-capture decision + voice guidance, and lib/body-assessment/
 * poseMetrics.ts owns the actual angle/ratio geometry shared with the
 * live overlay and the stored posture measurements.
 *
 * Checks run in order of "how fundamental is this problem, and how
 * SPECIFIC/actionable is the resulting message" — no point telling
 * someone to square their shoulders when we can't see their feet yet, and
 * no point telling them to move to better lighting when we can already
 * tell them exactly which direction to step. Each returns the first
 * failing check; `ready` means every check this step requires has passed
 * for this single frame (CameraCapture is what additionally requires this
 * to hold stably for ~1.5-2s before capturing).
 *
 * IMPORTANT ordering note: overall landmark confidence (`low_confidence`)
 * is deliberately the LAST-RESORT check, not an early one. An earlier
 * version bailed out on marginal-but-real confidence (subject.score just
 * under CONFIDENCE_THRESHOLD — common in ordinary indoor lighting at a
 * six-foot capture distance) before any of the specific framing/distance/
 * orientation checks below ever ran, which meant the member heard "we
 * can't see you clearly, move somewhere brighter" on repeat regardless of
 * what was actually wrong (too far, off-center, not fully framed, etc).
 * Only a genuinely unusable frame (MIN_TRUSTABLE_CONFIDENCE, far below
 * CONFIDENCE_THRESHOLD) short-circuits early now; everything else runs
 * the full geometric pipeline on whatever landmarks are available and
 * only falls back to the generic confidence message if literally nothing
 * more specific was wrong. See frameQuality.ts for the separate,
 * pixel-based lighting/blur check — that one only fires on genuinely
 * measured luminance/sharpness, never as a proxy for landmark confidence.
 *
 * Every numeric threshold below is a UX/engineering screening bound
 * chosen for "reject when it's clearly wrong, don't nag over normal
 * standing variation" — NONE of them are derived from clinical
 * measurement literature, and none should be read as a diagnostic cutoff.
 * See postureMeasurements.ts's docblock for the same caveat applied to
 * the estimates this app actually stores/reports.
 */

import { toCoreLandmarks, type CorePoseLandmarks, type RawPoseLandmark } from './poseTypes';
import { computePoseMetrics, type Point, type PoseMetrics } from './poseMetrics';

export type PoseValidationStatus =
  | 'no_person'
  | 'multiple_people'
  | 'low_confidence'
  | 'subject_changed'
  | 'not_full_body'
  | 'too_close'
  | 'too_far'
  | 'off_center'
  | 'camera_position'
  | 'wrong_orientation'
  | 'head_rotated'
  | 'shoulders_rotated'
  | 'not_standing'
  | 'crouching_or_bending'
  | 'excessive_lean'
  | 'ready';

/** The spec's "unified validation pipeline" buckets — grouping the (finer-grained) PoseValidationStatus values above into the categories a practitioner dashboard or a headless consumer of this pipeline would want to filter/report on. */
export type ValidationCategory =
  | 'person_detection'
  | 'multi_person'
  | 'landmark_confidence'
  | 'subject_continuity'
  | 'framing'
  | 'camera_geometry'
  | 'orientation'
  | 'head_position'
  | 'shoulder_torso_rotation'
  | 'posture_state'
  | 'measurement_readiness';

export type ValidationSeverity = 'info' | 'mild' | 'moderate' | 'blocking';

/** Which body region (if any) the live overlay should visually emphasize while this result is active — the "primary correction indicator" the overlay draws attention to, distinct from framing/camera problems that have no single joint to highlight. */
export type CorrectionTarget = 'head' | 'shoulders' | 'hips' | 'torso' | 'knees' | 'frame' | null;

type StatusMeta = {
  category: ValidationCategory;
  severity: ValidationSeverity;
  /** Whether this result, while active, prevents the frame from counting toward the stability hold / auto-capture. `ready` is the only status where this is false. */
  blocksCapture: boolean;
  /** Whether this result, when it newly appears mid-hold, should reset the accumulated stability timer (vs. e.g. CameraCapture.tsx's own short grace-window absorption of a single blip). Mirrors blocksCapture for every status today — kept as a distinct field because a future status (e.g. a very transient one) could reasonably block capture without resetting an in-progress hold. */
  resetsStabilityHold: boolean;
  /** Whether a capture completed despite (or shortly after) this condition is worth flagging for practitioner review — true for continuity/confidence problems a coach would want to know about even if the member ultimately got a passing frame, false for ordinary positioning corrections everyone hits routinely. */
  practitionerReviewRecommended: boolean;
  correctionTarget: CorrectionTarget;
};

const STATUS_META: Record<PoseValidationStatus, StatusMeta> = {
  no_person: {
    category: 'person_detection',
    severity: 'blocking',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  multiple_people: {
    category: 'multi_person',
    severity: 'blocking',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: true,
    correctionTarget: 'frame',
  },
  low_confidence: {
    category: 'landmark_confidence',
    severity: 'blocking',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: true,
    correctionTarget: null,
  },
  subject_changed: {
    category: 'subject_continuity',
    severity: 'blocking',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: true,
    correctionTarget: 'frame',
  },
  not_full_body: {
    category: 'framing',
    severity: 'blocking',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  too_close: {
    category: 'framing',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  too_far: {
    category: 'framing',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  off_center: {
    category: 'framing',
    severity: 'mild',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  camera_position: {
    category: 'camera_geometry',
    severity: 'mild',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
  },
  wrong_orientation: {
    category: 'orientation',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'torso',
  },
  head_rotated: {
    category: 'head_position',
    severity: 'mild',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'head',
  },
  shoulders_rotated: {
    category: 'shoulder_torso_rotation',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'shoulders',
  },
  not_standing: {
    category: 'posture_state',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'torso',
  },
  crouching_or_bending: {
    category: 'posture_state',
    severity: 'moderate',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'knees',
  },
  excessive_lean: {
    category: 'posture_state',
    severity: 'mild',
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'torso',
  },
  ready: {
    category: 'measurement_readiness',
    severity: 'info',
    blocksCapture: false,
    resetsStabilityHold: false,
    practitionerReviewRecommended: false,
    correctionTarget: null,
  },
};

export type PoseValidationResult = {
  /** Machine-readable reason code — the specific check that failed (or 'ready'). */
  status: PoseValidationStatus;
  /** Which validation-pipeline bucket this status belongs to (person detection, framing, orientation, etc). */
  category: ValidationCategory;
  /** True only when every check passed and this frame is eligible to count toward the stability window. */
  ok: boolean;
  /** Short, user-facing correction text — the exact string CameraCapture displays on screen. */
  message: string;
  /** The spoken coaching instruction CameraCapture hands to the voice guidance queue. Deliberately identical to `message` today — every message in this file is already hand-written to be speakable — but kept as a distinct field so a future UI-only or voice-only wording divergence doesn't require a type change. */
  spokenMessage: string;
  /** Mild/moderate/blocking (or 'info' for a passing frame) — how serious this condition is, independent of whether it blocks capture (nearly everything here blocks capture; severity communicates HOW MUCH of a problem it is, e.g. for status-chip styling or practitioner triage). */
  severity: ValidationSeverity;
  /** This frame's landmark-confidence score (0-1) — the same value `low_confidence` gates on, exposed on every result (not just failing ones) so a caller can inspect confidence without re-deriving it. 0 when no landmarks were resolved. */
  confidence: number;
  /** Whether this result, while active, prevents the frame from counting toward the stability hold / auto-capture. */
  blocksCapture: boolean;
  /** Whether this result should reset an in-progress stability hold (vs. being absorbed as a brief blip by the caller's own grace-window logic). */
  resetsStabilityHold: boolean;
  /** Whether a coach reviewing this assessment should be flagged about this condition, independent of whether it ultimately blocked capture. */
  practitionerReviewRecommended: boolean;
  /** Which body region (if any) the live overlay should visually emphasize as the primary correction target. */
  correctionTarget: CorrectionTarget;
  /** Present whenever landmarks were confidently resolved — the live overlay renders from this even on a failing frame (so the member can see WHY it's failing), and a valid captured frame's metrics feed postureMeasurements.ts. */
  metrics: PoseMetrics | null;
  /** The same resolved subject landmarks `metrics` was computed from — PoseOverlay.tsx needs the raw points (not just derived angles) to draw dots/skeleton lines, and a valid captured frame's landmarks are what gets persisted to body_landmark_sets. */
  core: CorePoseLandmarks | null;
  /** The full 33-point raw frame `core` was reduced from — landmarkMapping.ts needs points (elbows, wrists, heels, foot index) that CorePoseLandmarks doesn't carry, and this is the one unambiguous reference to "exactly which detection was the validated subject." */
  rawPoints: RawPoseLandmark[] | null;
};

export type PoseValidationOptions = {
  /** Image capture steps that need a standing, framed body (front/left_side/right_side/back). Movement/video steps don't gate on this validator at all — except single_leg_stance, added specifically for the guided pelvic-drop screening (see singleLegStanceValidation.ts). */
  requiresStanding: boolean;
  captureType: 'front' | 'left_side' | 'right_side' | 'back' | 'walking' | 'movement' | 'custom';
  /**
   * The subject's hip-midpoint from the most recent frame that was part of
   * an in-progress stability hold (CameraCapture.tsx only supplies this
   * once `readySinceRef` is set — i.e. mid-hold — and clears it whenever
   * the hold resets). Closes the one gap this file's docblock used to
   * flag as unsolvable: someone swapping into frame while the camera was
   * mid-hold on a prior subject looked identical to "still one person"
   * checked frame-by-frame in isolation. A large, sudden jump in the
   * confident subject's position between two consecutive hold frames is
   * far more consistent with a person swap than with a standing person's
   * natural sway/breathing, so it resets the hold rather than letting it
   * complete on a different person than it started with.
   */
  previousSubjectCenter?: Point | null;
};

const CONFIDENCE_THRESHOLD = 0.5;
/** Below this, landmark data is treated as pure noise — nothing geometric is trustworthy enough to even attempt a specific diagnosis. Deliberately far below CONFIDENCE_THRESHOLD: ordinary indoor lighting / normal capture distance routinely lands in the 0.3-0.5 band, and that band should get a SPECIFIC framing/distance/orientation correction, not a generic bail-out. */
const MIN_TRUSTABLE_CONFIDENCE = 0.15;
const MULTI_PERSON_CONFIDENCE_THRESHOLD = 0.4;
const FRONTAL_MIN_RATIO = 0.15;

/** Below this, the thigh vector is close enough to horizontal (hip near knee height) to mean seated, not standing-with-bent-knees. */
const SITTING_THIGH_ANGLE_MAX = 50;
/** Below this, the hip-to-ankle vertical span is too small a share of total height for a standing leg — also a seated-posture signal. */
const SITTING_LEG_SPAN_RATIO_MIN = 0.32;
/** Knee/hip joint angle below this (out of 180 = fully straight) reads as a bent knee or hinged-forward hip — crouching/bending rather than sitting. */
const CROUCH_OR_BEND_ANGLE_MIN = 165;
/** Torso-vertical angle above this is treated as leaning (forward/back/sideways depending on view); above LYING_DOWN_ANGLE it's treated as lying down instead. */
const EXCESSIVE_LEAN_ANGLE_MIN = 15;
const LYING_DOWN_ANGLE_MIN = 50;
/** How much less visible one ear must be than the other before a front/back view is treated as "head turned away." */
const HEAD_ROTATION_EAR_RATIO_MAX = 0.4;
const HEAD_ROTATION_NOSE_OFFSET_MAX = 0.28;
/** Shoulder depth-difference ratio (see poseMetrics.ts) above which the shoulders read as twisted relative to the camera — deliberately generous, since the underlying z estimate is noisy. Only applied when the pose model actually supplied a z value for both shoulders. */
const SHOULDER_ROTATION_DEPTH_RATIO_MAX = 0.5;
/** How far the confident subject's hip midpoint may jump between two consecutive mid-hold frames, normalized by bodySpan, before it reads as a different person rather than natural sway — generous on purpose, since a real standing person's hips do drift a little frame to frame. */
const SUBJECT_JUMP_RATIO_MAX = 0.4;

function averageVisibility(points: RawPoseLandmark[]): number {
  const scores = points.map((p) => p.visibility ?? 1);
  return scores.reduce((sum, v) => sum + v, 0) / scores.length;
}

function coreVisibilityScore(core: CorePoseLandmarks): number {
  return averageVisibility([
    core.nose,
    core.leftShoulder,
    core.rightShoulder,
    core.leftHip,
    core.rightHip,
    core.leftKnee,
    core.rightKnee,
    core.leftAnkle,
    core.rightAnkle,
  ]);
}

function ready(
  metrics: PoseMetrics,
  core: CorePoseLandmarks,
  rawPoints: RawPoseLandmark[]
): PoseValidationResult {
  const meta = STATUS_META.ready;
  return {
    status: 'ready',
    category: meta.category,
    ok: true,
    message: '',
    spokenMessage: '',
    severity: meta.severity,
    confidence: coreVisibilityScore(core),
    blocksCapture: meta.blocksCapture,
    resetsStabilityHold: meta.resetsStabilityHold,
    practitionerReviewRecommended: meta.practitionerReviewRecommended,
    correctionTarget: meta.correctionTarget,
    metrics,
    core,
    rawPoints,
  };
}

/** `confidenceOverride` lets a call site supply a more precise confidence than `core` alone would give (e.g. the hard-floor low_confidence bail-out below, which already has `subject.score` in scope); every other call site gets confidence auto-derived from `core`'s own landmark visibility, so most fail() calls below don't need to change when a new status is added. */
function fail(
  status: PoseValidationStatus,
  message: string,
  metrics: PoseMetrics | null,
  core: CorePoseLandmarks | null,
  rawPoints: RawPoseLandmark[] | null,
  confidenceOverride?: number
): PoseValidationResult {
  const meta = STATUS_META[status];
  const confidence = confidenceOverride ?? (core ? coreVisibilityScore(core) : 0);
  return {
    status,
    category: meta.category,
    ok: false,
    message,
    spokenMessage: message,
    severity: meta.severity,
    confidence,
    blocksCapture: meta.blocksCapture,
    resetsStabilityHold: meta.resetsStabilityHold,
    practitionerReviewRecommended: meta.practitionerReviewRecommended,
    correctionTarget: meta.correctionTarget,
    metrics,
    core,
    rawPoints,
  };
}

/**
 * Evaluate one camera frame against the checks a standing posture photo
 * requires: a single confident person, fully framed, reasonably centered
 * and at a workable distance, facing the direction this step asks for
 * (with head and shoulders square to it, not just the torso), standing
 * upright without crouching, bending, or excessive lean. Returns the
 * first failing check or `ready` when everything passes.
 */
export function validatePoseFrame(
  posesRaw: RawPoseLandmark[][],
  options: PoseValidationOptions
): PoseValidationResult {
  if (!options.requiresStanding) {
    const meta = STATUS_META.ready;
    return {
      status: 'ready',
      category: meta.category,
      ok: true,
      message: '',
      spokenMessage: '',
      severity: meta.severity,
      confidence: 0,
      blocksCapture: meta.blocksCapture,
      resetsStabilityHold: meta.resetsStabilityHold,
      practitionerReviewRecommended: meta.practitionerReviewRecommended,
      correctionTarget: meta.correctionTarget,
      metrics: null,
      core: null,
      rawPoints: null,
    };
  }

  if (posesRaw.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.", null, null, null);
  }

  const cores = posesRaw
    .map((points) => ({ points, core: toCoreLandmarks(points) }))
    .filter((p): p is { points: RawPoseLandmark[]; core: CorePoseLandmarks } => p.core !== null);

  if (cores.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.", null, null, null);
  }

  // Pick the most confident detection as the subject and validate THEM —
  // deliberately no longer fails the whole frame just because a second
  // candidate detection exists here. Multi-pose models (this app runs
  // MediaPipe with numPoses:2) routinely emit a second, lower-quality
  // "ghost" detection for the SAME person — an overlapping duplicate
  // bounding box, a common artifact especially at the "lite" model tier
  // this app uses, not evidence of a second person. Whether a second
  // detection is spatially distinct enough to plausibly BE another person
  // is evaluateMultiPersonCandidate()'s job below, and even that is only
  // ever a single frame's opinion — CameraCapture.tsx is what turns a
  // sequence of those opinions into an actual (temporally-confirmed,
  // hysteresis-protected) warning. See that function's docblock.
  const scored = cores
    .map((c) => ({ ...c, score: coreVisibilityScore(c.core) }))
    .sort((a, b) => b.score - a.score);
  const subject = scored[0]!;

  // Hard floor only — a genuinely unusable frame (see MIN_TRUSTABLE_CONFIDENCE's
  // docblock). Anything above this proceeds to the specific geometric
  // checks below; the same subject.score is re-checked as a last resort
  // at the very end of this function, once every specific diagnosis has
  // already had a chance to fire.
  if (subject.score < MIN_TRUSTABLE_CONFIDENCE) {
    return fail(
      'low_confidence',
      "We can't see you clearly. Move somewhere brighter.",
      computePoseMetrics(subject.core),
      subject.core,
      subject.points
    );
  }

  const core = subject.core;
  const metrics = computePoseMetrics(core);

  // Subject continuity: if we're mid-hold (CameraCapture only supplies
  // previousSubjectCenter while a stability window is open), a confident
  // subject whose hips just jumped a large fraction of their own body
  // span is more likely a person swap than the same standing person.
  if (options.previousSubjectCenter && metrics.bodySpan > 1e-4) {
    const dx = metrics.hipMid.x - options.previousSubjectCenter.x;
    const dy = metrics.hipMid.y - options.previousSubjectCenter.y;
    const jumpRatio = Math.hypot(dx, dy) / metrics.bodySpan;
    if (jumpRatio > SUBJECT_JUMP_RATIO_MAX) {
      return fail(
        'subject_changed',
        'Please return to the center of the frame.',
        metrics,
        core,
        subject.points
      );
    }
  }

  // Full-body framing: knees/ankles must be visible and not clipped at the frame edge.
  const lowerBodyVisibility = averageVisibility([
    core.leftKnee,
    core.rightKnee,
    core.leftAnkle,
    core.rightAnkle,
  ]);
  const headTop = Math.min(core.nose.y, core.leftEye.y, core.rightEye.y);
  if (lowerBodyVisibility < CONFIDENCE_THRESHOLD || metrics.ankleMid.y > 0.97) {
    return fail(
      'not_full_body',
      'Step back until your entire body is visible.',
      metrics,
      core,
      subject.points
    );
  }
  if (headTop < 0.04) {
    return fail(
      'not_full_body',
      'Step back so your head is fully visible.',
      metrics,
      core,
      subject.points
    );
  }

  // Lying down collapses the body's vertical span, which would otherwise
  // read as "too far away" below — catch it first via torso angle alone,
  // since that signal doesn't depend on how much of the frame the body fills.
  if (metrics.torsoAngleFromVertical > LYING_DOWN_ANGLE_MIN) {
    return fail('not_standing', 'Please stand upright.', metrics, core, subject.points);
  }

  // Distance: how much of the frame height the body occupies.
  if (metrics.bodySpan > 0.92) {
    return fail('too_close', 'Step farther away.', metrics, core, subject.points);
  }
  if (metrics.bodySpan < 0.35) {
    return fail('too_far', 'Move closer.', metrics, core, subject.points);
  }

  // Centering: nudge left/right based on where the body's bounding box sits.
  // Coordinates are the camera's raw (unmirrored) frame; the preview is
  // CSS-mirrored for a natural selfie view, so telling the member to move
  // toward *their own* left/right (not the raw frame's) matches what they
  // see, the same way a bathroom mirror does.
  const centerX = (metrics.shoulderMid.x + metrics.hipMid.x) / 2;
  if (centerX < 0.35) {
    return fail('off_center', 'Move slightly to your left.', metrics, core, subject.points);
  }
  if (centerX > 0.65) {
    return fail('off_center', 'Move slightly to your right.', metrics, core, subject.points);
  }

  // Camera height: the body's vertical position within the frame, once
  // distance and horizontal centering already pass. A phone propped too
  // high (aimed down) crowds the body toward the top of the frame; too low
  // (aimed up) crowds it toward the bottom — distinct from off_center
  // (which is purely horizontal) and from not_full_body's hard edge-clip
  // bounds above, which only catch the extreme case.
  const verticalCenter = (headTop + metrics.ankleMid.y) / 2;
  if (verticalCenter > 0.62) {
    return fail('camera_position', 'Raise the phone a little.', metrics, core, subject.points);
  }
  if (verticalCenter < 0.38) {
    return fail('camera_position', 'Lower the phone slightly.', metrics, core, subject.points);
  }

  // Orientation: front/back need a wide shoulder line; side views need a narrow one.
  const faceVisibility = averageVisibility([
    core.nose,
    core.leftEye,
    core.rightEye,
    core.leftEar,
    core.rightEar,
  ]);

  if (options.captureType === 'left_side' || options.captureType === 'right_side') {
    if (metrics.frontalRatioShoulders >= FRONTAL_MIN_RATIO) {
      return fail(
        'wrong_orientation',
        'Turn so your side faces the camera.',
        metrics,
        core,
        subject.points
      );
    }
  } else if (options.captureType === 'front') {
    if (metrics.frontalRatioShoulders < FRONTAL_MIN_RATIO) {
      return fail(
        'wrong_orientation',
        'Face directly toward the camera.',
        metrics,
        core,
        subject.points
      );
    }
    if (faceVisibility < CONFIDENCE_THRESHOLD) {
      return fail(
        'wrong_orientation',
        'Turn to face the camera directly.',
        metrics,
        core,
        subject.points
      );
    }
    if (
      metrics.earVisibilityRatio < HEAD_ROTATION_EAR_RATIO_MAX ||
      Math.abs(metrics.noseOffsetRatio) > HEAD_ROTATION_NOSE_OFFSET_MAX
    ) {
      return fail('head_rotated', 'Turn your head forward.', metrics, core, subject.points);
    }
    if (
      metrics.shoulderDepthDiffRatio !== null &&
      metrics.shoulderDepthDiffRatio > SHOULDER_ROTATION_DEPTH_RATIO_MAX
    ) {
      return fail(
        'shoulders_rotated',
        'Please square your shoulders to the camera.',
        metrics,
        core,
        subject.points
      );
    }
  } else if (options.captureType === 'back') {
    if (metrics.frontalRatioShoulders < FRONTAL_MIN_RATIO) {
      return fail(
        'wrong_orientation',
        'Please turn your back to the camera.',
        metrics,
        core,
        subject.points
      );
    }
    if (faceVisibility >= CONFIDENCE_THRESHOLD) {
      return fail(
        'wrong_orientation',
        'Please turn your back to the camera.',
        metrics,
        core,
        subject.points
      );
    }
    if (
      metrics.shoulderDepthDiffRatio !== null &&
      metrics.shoulderDepthDiffRatio > SHOULDER_ROTATION_DEPTH_RATIO_MAX
    ) {
      return fail(
        'shoulders_rotated',
        'Please square your shoulders to the camera.',
        metrics,
        core,
        subject.points
      );
    }
  }

  // Sitting: hip drops close to knee/ankle height with a near-horizontal thigh.
  if (
    metrics.thighAngleFromVertical > SITTING_THIGH_ANGLE_MAX ||
    Math.abs(metrics.ankleMid.y - metrics.hipMid.y) / Math.abs(metrics.ankleMid.y - core.nose.y) <
      SITTING_LEG_SPAN_RATIO_MIN
  ) {
    return fail('not_standing', 'Please stand upright.', metrics, core, subject.points);
  }

  // Crouching/bending: bent knees while still upright-ish (not seated).
  // Deliberately knee-angle only, not hip-angle — the hip-vertex angle
  // (shoulder-hip-knee) is almost the mirror of torsoAngleFromVertical
  // whenever the knee stays roughly under the hip (hipAngle ≈ 180 -
  // torsoAngle in that case), so gating on it here would just re-flag the
  // same forward lean the next check already catches under a more
  // specific message. Knee angle is the separable, distinctive signal for
  // an actual crouch/squat.
  const avgKneeAngle = (metrics.leftKneeAngle + metrics.rightKneeAngle) / 2;
  if (avgKneeAngle < CROUCH_OR_BEND_ANGLE_MIN) {
    return fail('crouching_or_bending', 'Straighten your knees.', metrics, core, subject.points);
  }

  // Excessive lean: torso meaningfully off vertical without being extreme enough to be lying down.
  if (metrics.torsoAngleFromVertical > EXCESSIVE_LEAN_ANGLE_MIN) {
    return fail(
      'excessive_lean',
      'Please stand up straight without leaning.',
      metrics,
      core,
      subject.points
    );
  }

  // Last resort: every specific geometric check above already passed, but
  // overall landmark confidence is still marginal (between
  // MIN_TRUSTABLE_CONFIDENCE and CONFIDENCE_THRESHOLD) — nothing more
  // specific is wrong that we can identify, so this is the one case where
  // a general "get a clearer reading" message is genuinely the most
  // useful thing left to say.
  if (subject.score < CONFIDENCE_THRESHOLD) {
    return fail(
      'low_confidence',
      "We're having trouble getting a clear, steady reading. Try adjusting your lighting or position.",
      metrics,
      core,
      subject.points
    );
  }

  return ready(metrics, core, subject.points);
}

export type MultiPersonCandidateReason =
  /** No second detection at all, or every other detection was ruled out. */
  | 'none'
  /** A second detection exists but its hip-center is close enough to the subject's that it's almost certainly a duplicate/ghost detection of the SAME person, not a second one — never counted as evidence. */
  | 'same_person_duplicate'
  /** A second detection is spatially separated enough to be plausible, but its own confidence is too low to trust — logged, not acted on. */
  | 'low_confidence_other'
  /** Spatially distinct AND confident enough to be a genuine candidate for a second person this frame. Still only ONE frame's evidence — see this function's docblock. */
  | 'second_person_candidate';

export type MultiPersonCandidateResult = {
  candidateDetected: boolean;
  reason: MultiPersonCandidateReason;
  detail?: { score: number; separationRatio: number };
};

/** Another detection's hip-center within this fraction of the subject's bodySpan is treated as the same physical person detected twice (an overlapping duplicate/ghost candidate) — a known artifact of multi-pose models, especially the "lite" tier this app uses — never evidence of a second person, no matter how confident that duplicate reads. */
const SAME_PERSON_SEPARATION_MAX = 0.15;
/** Below this separation, a second detection is in an ambiguous middle zone — plausibly a second person standing close by, but also plausibly measurement noise on the same subject. Deliberately NOT treated as candidate evidence either way (better to under-warn on a close second person than over-warn on tracking noise); only logged for visibility. */
const SECOND_PERSON_SEPARATION_MIN = 0.45;

/**
 * Single-frame opinion on whether a second, spatially distinct, adequately
 * confident person is present — deliberately NOT a final verdict.
 * CameraCapture.tsx feeds this result into temporalSignal.ts's
 * confirm/release hysteresis every frame; only a CONFIRMED (persisted)
 * signal ever becomes the spoken "another person" warning. This function
 * only decides "does this one frame look like plausible evidence," using
 * spatial separation (not just visibility/confidence) specifically to
 * rule out the dominant real-world false-positive: MediaPipe emitting a
 * second, overlapping "ghost" detection of the SAME person during quick
 * movement, occlusion, or ordinary model instability.
 *
 * Known limitation, stated plainly rather than silently overclaimed: a
 * single 2D pose landmarker has no way to distinguish a real second
 * person from a person-shaped reflection (mirror, television) that is
 * genuinely spatially separate, sufficiently confident, AND persists for
 * multiple seconds — that would still pass every check here and in the
 * temporal layer above it. Solving that fully needs a different
 * technology (e.g. depth sensing or a dedicated person re-identification
 * model), not a threshold change; what's implemented here removes the
 * measurement-noise false positives, which is the failure mode this app
 * actually reproduced.
 */
export function evaluateMultiPersonCandidate(
  posesRaw: RawPoseLandmark[][],
  subjectCore: CorePoseLandmarks,
  subjectMetrics: PoseMetrics
): MultiPersonCandidateResult {
  if (posesRaw.length < 2) return { candidateDetected: false, reason: 'none' };

  let bestAmbiguous: MultiPersonCandidateResult = { candidateDetected: false, reason: 'none' };

  for (const points of posesRaw) {
    const core = toCoreLandmarks(points);
    if (!core) continue;

    const metrics = computePoseMetrics(core);
    const dx = metrics.hipMid.x - subjectMetrics.hipMid.x;
    const dy = metrics.hipMid.y - subjectMetrics.hipMid.y;
    const separationRatio = Math.hypot(dx, dy) / Math.max(subjectMetrics.bodySpan, 1e-4);

    // The subject's own detection (separation ~0) or a near-duplicate
    // ghost of them — never evidence of a second person.
    if (separationRatio < SAME_PERSON_SEPARATION_MAX) {
      if (separationRatio > 1e-4) {
        // Not literally the subject itself (that has separationRatio 0) —
        // a genuine near-duplicate ghost candidate, worth a distinct log
        // reason even though it's still never treated as evidence.
        bestAmbiguous = {
          candidateDetected: false,
          reason: 'same_person_duplicate',
          detail: { score: coreVisibilityScore(core), separationRatio },
        };
      }
      continue;
    }

    const score = coreVisibilityScore(core);

    if (
      separationRatio >= SECOND_PERSON_SEPARATION_MIN &&
      score >= MULTI_PERSON_CONFIDENCE_THRESHOLD
    ) {
      return {
        candidateDetected: true,
        reason: 'second_person_candidate',
        detail: { score, separationRatio },
      };
    }

    bestAmbiguous = {
      candidateDetected: false,
      reason: score < MULTI_PERSON_CONFIDENCE_THRESHOLD ? 'low_confidence_other' : 'none',
      detail: { score, separationRatio },
    };
  }

  return bestAmbiguous;
}
