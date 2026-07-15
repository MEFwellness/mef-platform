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
 * Checks run in order of "how fundamental is this problem" — no point
 * telling someone to square their shoulders when we can't see their feet
 * yet. Each returns the first failing check; `ready` means every check
 * this step requires has passed for this single frame (CameraCapture is
 * what additionally requires this to hold stably for ~1.5-2s before
 * capturing).
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
  | 'wrong_orientation'
  | 'head_rotated'
  | 'shoulders_rotated'
  | 'not_standing'
  | 'crouching_or_bending'
  | 'excessive_lean'
  | 'ready';

export type PoseValidationResult = {
  status: PoseValidationStatus;
  /** True only when every check passed and this frame is eligible to count toward the stability window. */
  ok: boolean;
  /** Short, speakable correction — the exact string CameraCapture hands to the voice guidance queue. */
  message: string;
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

function ready(metrics: PoseMetrics, core: CorePoseLandmarks, rawPoints: RawPoseLandmark[]): PoseValidationResult {
  return { status: 'ready', ok: true, message: '', metrics, core, rawPoints };
}

function fail(
  status: PoseValidationStatus,
  message: string,
  metrics: PoseMetrics | null,
  core: CorePoseLandmarks | null,
  rawPoints: RawPoseLandmark[] | null
): PoseValidationResult {
  return { status, ok: false, message, metrics, core, rawPoints };
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
  if (!options.requiresStanding) return { status: 'ready', ok: true, message: '', metrics: null, core: null, rawPoints: null };

  if (posesRaw.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.", null, null, null);
  }

  const cores = posesRaw
    .map((points) => ({ points, core: toCoreLandmarks(points) }))
    .filter((p): p is { points: RawPoseLandmark[]; core: CorePoseLandmarks } => p.core !== null);

  if (cores.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.", null, null, null);
  }

  // Pick the most confident detection as the subject; anyone else
  // confident enough to plausibly be a second person fails the frame
  // outright rather than silently ignoring them. A same-frame swap (the
  // original member steps out as someone else steps in, both confident,
  // never overlapping) can't be caught here — that's the subject-position
  // continuity check below, once metrics are computed.
  const scored = cores
    .map((c) => ({ ...c, score: coreVisibilityScore(c.core) }))
    .sort((a, b) => b.score - a.score);
  const subject = scored[0]!;

  const others = scored.slice(1);
  if (others.some((o) => o.score >= MULTI_PERSON_CONFIDENCE_THRESHOLD)) {
    return fail(
      'multiple_people',
      'Only one person can be in the assessment area.',
      computePoseMetrics(subject.core),
      subject.core,
      subject.points
    );
  }

  if (subject.score < CONFIDENCE_THRESHOLD) {
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
      return fail('subject_changed', 'Please hold still — make sure only you are in the frame.', metrics, core, subject.points);
    }
  }

  // Full-body framing: knees/ankles must be visible and not clipped at the frame edge.
  const lowerBodyVisibility = averageVisibility([core.leftKnee, core.rightKnee, core.leftAnkle, core.rightAnkle]);
  const headTop = Math.min(core.nose.y, core.leftEye.y, core.rightEye.y);
  if (lowerBodyVisibility < CONFIDENCE_THRESHOLD || metrics.ankleMid.y > 0.97) {
    return fail('not_full_body', "We can't see your entire body. Please take one step backward.", metrics, core, subject.points);
  }
  if (headTop < 0.04) {
    return fail('not_full_body', 'Step back so your head is fully visible.', metrics, core, subject.points);
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
    return fail('too_far', 'Move a little closer.', metrics, core, subject.points);
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

  // Orientation: front/back need a wide shoulder line; side views need a narrow one.
  const faceVisibility = averageVisibility([core.nose, core.leftEye, core.rightEye, core.leftEar, core.rightEar]);

  if (options.captureType === 'left_side' || options.captureType === 'right_side') {
    if (metrics.frontalRatioShoulders >= FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Turn so your side faces the camera.', metrics, core, subject.points);
    }
  } else if (options.captureType === 'front') {
    if (metrics.frontalRatioShoulders < FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Please face the camera directly.', metrics, core, subject.points);
    }
    if (faceVisibility < CONFIDENCE_THRESHOLD) {
      return fail('wrong_orientation', 'Please turn to face the camera.', metrics, core, subject.points);
    }
    if (metrics.earVisibilityRatio < HEAD_ROTATION_EAR_RATIO_MAX ||
        Math.abs(metrics.noseOffsetRatio) > HEAD_ROTATION_NOSE_OFFSET_MAX) {
      return fail('head_rotated', 'Please face straight ahead.', metrics, core, subject.points);
    }
    if (
      metrics.shoulderDepthDiffRatio !== null &&
      metrics.shoulderDepthDiffRatio > SHOULDER_ROTATION_DEPTH_RATIO_MAX
    ) {
      return fail('shoulders_rotated', 'Please square your shoulders to the camera.', metrics, core, subject.points);
    }
  } else if (options.captureType === 'back') {
    if (metrics.frontalRatioShoulders < FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Please turn your back to the camera.', metrics, core, subject.points);
    }
    if (faceVisibility >= CONFIDENCE_THRESHOLD) {
      return fail('wrong_orientation', 'Please turn your back to the camera.', metrics, core, subject.points);
    }
    if (
      metrics.shoulderDepthDiffRatio !== null &&
      metrics.shoulderDepthDiffRatio > SHOULDER_ROTATION_DEPTH_RATIO_MAX
    ) {
      return fail('shoulders_rotated', 'Please square your shoulders to the camera.', metrics, core, subject.points);
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
    return fail('crouching_or_bending', 'Please stand up straight without bending your knees.', metrics, core, subject.points);
  }

  // Excessive lean: torso meaningfully off vertical without being extreme enough to be lying down.
  if (metrics.torsoAngleFromVertical > EXCESSIVE_LEAN_ANGLE_MIN) {
    return fail('excessive_lean', 'Please stand up straight without leaning.', metrics, core, subject.points);
  }

  return ready(metrics, core, subject.points);
}
