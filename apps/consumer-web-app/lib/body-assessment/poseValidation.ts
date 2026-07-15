/**
 * Per-frame pose validation for guided posture photo capture. Pure
 * functions only (no browser/mediapipe APIs) so the standing-vs-sitting
 * and framing heuristics are unit-testable with plain fixture landmarks —
 * hooks/usePoseLandmarker.ts owns turning camera frames into
 * RawPoseLandmark[] and CameraCapture.tsx owns turning a sequence of these
 * results into a stability timer / auto-capture decision.
 *
 * The bug this exists to fix: the previous capture flow had no gate at
 * all — a member sitting in a chair could tap (or auto-)capture a photo
 * for an assessment step that required standing. Every check below
 * exists to catch one concrete way that could happen.
 */

import { toCoreLandmarks, type CorePoseLandmarks, type RawPoseLandmark } from './poseTypes';

export type PoseValidationStatus =
  | 'no_person'
  | 'multiple_people'
  | 'low_confidence'
  | 'not_full_body'
  | 'too_close'
  | 'too_far'
  | 'off_center'
  | 'wrong_orientation'
  | 'not_standing'
  | 'ready';

export type PoseValidationResult = {
  status: PoseValidationStatus;
  /** True only when every check passed and this frame is eligible to count toward the stability window. */
  ok: boolean;
  /** Short, speakable correction — the exact string CameraCapture hands to the voice queue. */
  message: string;
};

export type PoseValidationOptions = {
  /** Image capture steps that need a standing, framed body (front/left_side/right_side/back). Movement/video steps don't gate on this validator at all. */
  requiresStanding: boolean;
  captureType: 'front' | 'left_side' | 'right_side' | 'back' | 'walking' | 'movement' | 'custom';
};

const CONFIDENCE_THRESHOLD = 0.5;
const MULTI_PERSON_CONFIDENCE_THRESHOLD = 0.4;

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

function midpoint(a: RawPoseLandmark, b: RawPoseLandmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Degrees off vertical for a vector pointing from `from` to `to` (0 = perfectly vertical, 90 = horizontal). */
function angleFromVertical(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function ready(): PoseValidationResult {
  return { status: 'ready', ok: true, message: '' };
}

function fail(status: PoseValidationStatus, message: string): PoseValidationResult {
  return { status, ok: false, message };
}

/**
 * Standing vs. sitting/crouching/lying, from joint geometry alone — no
 * silhouette overlap involved. The signal: a standing person's thigh
 * (hip->knee) and torso (shoulder->hip) segments both run close to
 * vertical, and the hip-to-ankle vertical span is a large share of their
 * total visible height. Sitting collapses the thigh toward horizontal
 * (hip and knee land at nearly the same height); crouching and sitting
 * both compress the hip-to-ankle vertical span relative to standing;
 * lying down tips the torso itself toward horizontal. Any one strong
 * signal is enough to reject — this only needs to catch "not standing,"
 * not classify which alternative pose it is.
 */
function isStanding(core: CorePoseLandmarks): boolean {
  const shoulderMid = midpoint(core.leftShoulder, core.rightShoulder);
  const hipMid = midpoint(core.leftHip, core.rightHip);
  const kneeMid = midpoint(core.leftKnee, core.rightKnee);
  const ankleMid = midpoint(core.leftAnkle, core.rightAnkle);

  const torsoAngle = angleFromVertical(shoulderMid, hipMid);
  const thighAngle = angleFromVertical(hipMid, kneeMid);

  const totalHeight = Math.abs(ankleMid.y - core.nose.y);
  if (totalHeight < 1e-4) return false;
  const legSpanRatio = Math.abs(ankleMid.y - hipMid.y) / totalHeight;

  if (torsoAngle > 50) return false; // lying down or heavily slumped
  if (thighAngle > 50) return false; // thigh roughly horizontal — sitting or deep crouch
  if (legSpanRatio < 0.32) return false; // hips sitting nearly at knee/ankle height — sitting or crouching

  return true;
}

/**
 * Evaluate one camera frame against the checks a standing posture photo
 * requires: a single confident person, fully framed, reasonably centered
 * and at a workable distance, facing the direction this step asks for,
 * and standing. Returns the first failing check (order matters — no
 * point telling someone to "face the camera" when we can't see their feet
 * yet) or `ready` when everything passes.
 */
export function validatePoseFrame(
  posesRaw: RawPoseLandmark[][],
  options: PoseValidationOptions
): PoseValidationResult {
  if (!options.requiresStanding) return ready();

  if (posesRaw.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.");
  }

  const cores = posesRaw
    .map((points) => ({ points, core: toCoreLandmarks(points) }))
    .filter((p): p is { points: RawPoseLandmark[]; core: CorePoseLandmarks } => p.core !== null);

  if (cores.length === 0) {
    return fail('no_person', "We can't see you. Step into the frame.");
  }

  // Pick the most confident detection as the subject; anyone else confident enough to plausibly be a second person fails the frame outright.
  const scored = cores
    .map((c) => ({ ...c, score: coreVisibilityScore(c.core) }))
    .sort((a, b) => b.score - a.score);
  const subject = scored[0]!;

  const others = scored.slice(1);
  if (others.some((o) => o.score >= MULTI_PERSON_CONFIDENCE_THRESHOLD)) {
    return fail('multiple_people', 'Only one person should be in the frame.');
  }

  if (subject.score < CONFIDENCE_THRESHOLD) {
    return fail('low_confidence', "We can't see you clearly. Move somewhere brighter.");
  }

  const core = subject.core;

  // Full-body framing: knees/ankles must be visible and not clipped at the frame edge.
  const lowerBodyVisibility = averageVisibility([core.leftKnee, core.rightKnee, core.leftAnkle, core.rightAnkle]);
  const ankleMidY = midpoint(core.leftAnkle, core.rightAnkle).y;
  const headTop = Math.min(core.nose.y, core.leftEye.y, core.rightEye.y);
  if (lowerBodyVisibility < CONFIDENCE_THRESHOLD || ankleMidY > 0.97) {
    return fail('not_full_body', 'Step back until your entire body is visible.');
  }
  if (headTop < 0.04) {
    return fail('not_full_body', 'Step back so your head is fully visible.');
  }

  // Lying down collapses the body's vertical span, which would otherwise
  // read as "too far away" below — catch it first via torso angle alone,
  // since that signal doesn't depend on how much of the frame the body fills.
  const shoulderMid = midpoint(core.leftShoulder, core.rightShoulder);
  const hipMidEarly = midpoint(core.leftHip, core.rightHip);
  if (angleFromVertical(shoulderMid, hipMidEarly) > 50) {
    return fail('not_standing', 'Please stand upright.');
  }

  // Distance: how much of the frame height the body occupies.
  const bodySpan = Math.abs(ankleMidY - Math.min(headTop, shoulderMid.y));
  if (bodySpan > 0.92) {
    return fail('too_close', 'Step farther away.');
  }
  if (bodySpan < 0.35) {
    return fail('too_far', 'Move a little closer.');
  }

  // Centering: nudge left/right based on where the body's bounding box sits.
  // Coordinates are the camera's raw (unmirrored) frame; the preview is
  // CSS-mirrored for a natural selfie view, so telling the member to move
  // toward *their own* left/right (not the raw frame's) matches what they
  // see, the same way a bathroom mirror does.
  const hipMid = midpoint(core.leftHip, core.rightHip);
  const centerX = (shoulderMid.x + hipMid.x) / 2;
  if (centerX < 0.35) {
    return fail('off_center', 'Move slightly to your left.');
  }
  if (centerX > 0.65) {
    return fail('off_center', 'Move slightly to your right.');
  }

  // Orientation: front/back need a wide shoulder line; side views need a narrow one.
  const shoulderWidth = Math.abs(core.leftShoulder.x - core.rightShoulder.x);
  const frontalRatio = shoulderWidth / Math.max(bodySpan, 1e-4);
  const faceVisibility = averageVisibility([core.nose, core.leftEye, core.rightEye, core.leftEar, core.rightEar]);
  const FRONTAL_MIN_RATIO = 0.15;

  if (options.captureType === 'left_side' || options.captureType === 'right_side') {
    if (frontalRatio >= FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Turn so your side faces the camera.');
    }
  } else if (options.captureType === 'front') {
    if (frontalRatio < FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Please face the camera directly.');
    }
    if (faceVisibility < CONFIDENCE_THRESHOLD) {
      return fail('wrong_orientation', 'Please turn to face the camera.');
    }
  } else if (options.captureType === 'back') {
    if (frontalRatio < FRONTAL_MIN_RATIO) {
      return fail('wrong_orientation', 'Please turn your back to the camera.');
    }
    if (faceVisibility >= CONFIDENCE_THRESHOLD) {
      return fail('wrong_orientation', 'Please turn your back to the camera.');
    }
  }

  if (!isStanding(core)) {
    return fail('not_standing', 'Please stand upright.');
  }

  return ready();
}
