/**
 * lib/body-assessment/facing.ts and the front/back orientation gates in
 * poseValidation.ts.
 *
 * The bug these exist for: the back view used to require a turned-away
 * member's FACE LANDMARKS to stop being reported. The pose model never
 * stops reporting them, so the step looped forever. Measured against the
 * real model on a figure drawn from behind with no face on it at all
 * (scripts/audit-facing-landmarks.mjs), the average face-landmark
 * visibility was 0.951 where the old check needed it below 0.5.
 *
 * The fixtures below use that measured number rather than a convenient
 * one, so the tests fail the same way the real phone did if the old
 * pattern ever comes back.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateFacing,
  isFacingAway,
  isFacingToward,
  FACE_VISIBILITY_AWAY_HINT,
} from '../lib/body-assessment/facing';
import { validatePoseFrame, type PoseValidationOptions } from '../lib/body-assessment/poseValidation';
import { computePoseMetrics } from '../lib/body-assessment/poseMetrics';
import { toCoreLandmarks, POSE_LANDMARK_INDEX, type RawPoseLandmark } from '../lib/body-assessment/poseTypes';

const FRONT: PoseValidationOptions = { requiresStanding: true, captureType: 'front' };
const BACK: PoseValidationOptions = { requiresStanding: true, captureType: 'back' };
const LEFT_SIDE: PoseValidationOptions = { requiresStanding: true, captureType: 'left_side' };

/** The face-landmark visibility the real model actually reports for a person facing away. Not a guess. */
const MEASURED_AWAY_FACE_VISIBILITY = 0.95;

/**
 * A well-framed standing adult. `facing` flips the left/right ordering of
 * the anatomical landmarks, which is exactly what happens in a real frame
 * when a person turns around: the model labels landmarks by the subject's
 * own left and right, so a turn swaps which side of the frame they land on.
 * Face-landmark visibility is deliberately left HIGH in both cases, because
 * that is what the model really does.
 */
function makePose(
  facing: 'toward' | 'away',
  overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}
): RawPoseLandmark[] {
  // Positive when facing the camera: the subject's left lands on the
  // viewer's right, at a larger x.
  const s = facing === 'toward' ? 1 : -1;
  const faceVis = facing === 'toward' ? 0.96 : MEASURED_AWAY_FACE_VISIBILITY;
  const at = (offset: number) => 0.5 + s * offset;

  const base: Record<keyof typeof POSE_LANDMARK_INDEX, RawPoseLandmark> = {
    nose: { x: 0.5, y: 0.12, visibility: faceVis },
    leftEyeInner: { x: at(0.02), y: 0.11, visibility: faceVis },
    leftEye: { x: at(0.03), y: 0.11, visibility: faceVis },
    leftEyeOuter: { x: at(0.04), y: 0.11, visibility: faceVis },
    rightEyeInner: { x: at(-0.02), y: 0.11, visibility: faceVis },
    rightEye: { x: at(-0.03), y: 0.11, visibility: faceVis },
    rightEyeOuter: { x: at(-0.04), y: 0.11, visibility: faceVis },
    leftEar: { x: at(0.06), y: 0.12, visibility: faceVis },
    rightEar: { x: at(-0.06), y: 0.12, visibility: faceVis },
    mouthLeft: { x: at(0.02), y: 0.14, visibility: faceVis },
    mouthRight: { x: at(-0.02), y: 0.14, visibility: faceVis },
    leftShoulder: { x: at(0.1), y: 0.22, visibility: 0.97 },
    rightShoulder: { x: at(-0.1), y: 0.22, visibility: 0.97 },
    leftElbow: { x: at(0.12), y: 0.35, visibility: 0.9 },
    rightElbow: { x: at(-0.12), y: 0.35, visibility: 0.9 },
    leftWrist: { x: at(0.13), y: 0.47, visibility: 0.85 },
    rightWrist: { x: at(-0.13), y: 0.47, visibility: 0.85 },
    leftPinky: { x: at(0.13), y: 0.5, visibility: 0.7 },
    rightPinky: { x: at(-0.13), y: 0.5, visibility: 0.7 },
    leftIndex: { x: at(0.13), y: 0.5, visibility: 0.7 },
    rightIndex: { x: at(-0.13), y: 0.5, visibility: 0.7 },
    leftThumb: { x: at(0.13), y: 0.49, visibility: 0.7 },
    rightThumb: { x: at(-0.13), y: 0.49, visibility: 0.7 },
    leftHip: { x: at(0.06), y: 0.5, visibility: 0.95 },
    rightHip: { x: at(-0.06), y: 0.5, visibility: 0.95 },
    leftKnee: { x: at(0.06), y: 0.72, visibility: 0.93 },
    rightKnee: { x: at(-0.06), y: 0.72, visibility: 0.93 },
    leftAnkle: { x: at(0.06), y: 0.93, visibility: 0.9 },
    rightAnkle: { x: at(-0.06), y: 0.93, visibility: 0.9 },
    leftHeel: { x: at(0.06), y: 0.95, visibility: 0.85 },
    rightHeel: { x: at(-0.06), y: 0.95, visibility: 0.85 },
    leftFootIndex: { x: at(0.07), y: 0.96, visibility: 0.85 },
    rightFootIndex: { x: at(-0.07), y: 0.96, visibility: 0.85 },
  };

  for (const [key, patch] of Object.entries(overrides)) {
    const name = key as keyof typeof POSE_LANDMARK_INDEX;
    base[name] = { ...base[name], ...patch };
  }

  const points: RawPoseLandmark[] = new Array(33);
  for (const [name, index] of Object.entries(POSE_LANDMARK_INDEX)) {
    points[index] = base[name as keyof typeof POSE_LANDMARK_INDEX];
  }
  return points;
}

function facingOf(pose: RawPoseLandmark[]) {
  const core = toCoreLandmarks(pose)!;
  return evaluateFacing(core, computePoseMetrics(core));
}

describe('facing detection — the signal that actually flips', () => {
  it('reads a facing-toward pose as toward, and a facing-away pose as away', () => {
    expect(facingOf(makePose('toward')).direction).toBe('toward');
    expect(facingOf(makePose('away')).direction).toBe('away');
  });

  it('decides from left/right ordering, which reverses on a turn', () => {
    const toward = facingOf(makePose('toward'));
    const away = facingOf(makePose('away'));

    expect(toward.signals.shoulderOrderRatio).toBeGreaterThan(0);
    expect(away.signals.shoulderOrderRatio).toBeLessThan(0);
    expect(toward.signals.hipOrderRatio).toBeGreaterThan(0);
    expect(away.signals.hipOrderRatio).toBeLessThan(0);
    // The score is symmetric: same magnitude, opposite sign.
    expect(away.score).toBe(-toward.score);
  });

  it('calls the direction from the shoulders alone, with no help from anything else', () => {
    // Hips ambiguous (a member standing with hips nearly side-on) and the
    // face confidently reported. Shoulders must still carry it.
    const pose = makePose('away', {
      leftHip: { x: 0.5 },
      rightHip: { x: 0.5 },
    });
    const result = facingOf(pose);
    expect(result.signals.hipPoints).toBe(0);
    expect(result.signals.facePoints).toBe(0);
    expect(result.direction).toBe('away');
  });

  it('treats a near-side-on pose as ambiguous rather than guessing', () => {
    const pose = makePose('toward', {
      leftShoulder: { x: 0.505 },
      rightShoulder: { x: 0.495 },
      leftHip: { x: 0.502 },
      rightHip: { x: 0.498 },
    });
    const result = facingOf(pose);
    expect(result.direction).toBe('ambiguous');
    expect(isFacingAway(result)).toBe(false);
    expect(isFacingToward(result)).toBe(false);
  });
});

describe('facing detection — predicted but invisible face landmarks', () => {
  it('does not let a confidently-reported face block an away-facing pose', () => {
    // THE regression test. Every face landmark reported at the visibility
    // the real model gives for a person with their back turned.
    const pose = makePose('away', {
      nose: { visibility: MEASURED_AWAY_FACE_VISIBILITY },
      leftEye: { visibility: MEASURED_AWAY_FACE_VISIBILITY },
      rightEye: { visibility: MEASURED_AWAY_FACE_VISIBILITY },
      leftEar: { visibility: MEASURED_AWAY_FACE_VISIBILITY },
      rightEar: { visibility: MEASURED_AWAY_FACE_VISIBILITY },
    });
    const result = facingOf(pose);

    expect(result.signals.faceVisibility).toBeGreaterThan(FACE_VISIBILITY_AWAY_HINT);
    expect(result.signals.facePoints).toBe(0);
    expect(result.direction).toBe('away');

    // And the back view accepts it.
    expect(validatePoseFrame([pose], BACK).ok).toBe(true);
  });

  it('never requires face visibility to fall, in either direction', () => {
    // Face visibility can only ever ADD evidence of turning away. Raising
    // it to the maximum must not change an away verdict.
    const shy = facingOf(makePose('away', { nose: { visibility: 0.2 }, leftEye: { visibility: 0.2 }, rightEye: { visibility: 0.2 }, leftEar: { visibility: 0.2 }, rightEar: { visibility: 0.2 } }));
    const confident = facingOf(makePose('away'));
    expect(shy.direction).toBe('away');
    expect(confident.direction).toBe('away');
  });
});

describe('facing detection — the two views cannot both accept one pose', () => {
  it('a facing-away pose passes the back view and fails the front view', () => {
    const pose = makePose('away');
    expect(validatePoseFrame([pose], BACK).ok).toBe(true);

    const front = validatePoseFrame([pose], FRONT);
    expect(front.ok).toBe(false);
    expect(front.status).toBe('wrong_orientation');
    expect(front.message).toBe('Turn around to face the camera.');
  });

  it('a facing-toward pose passes the front view and fails the back view', () => {
    const pose = makePose('toward');
    expect(validatePoseFrame([pose], FRONT).ok).toBe(true);

    const back = validatePoseFrame([pose], BACK);
    expect(back.ok).toBe(false);
    expect(back.status).toBe('wrong_orientation');
    expect(back.message).toBe('Turn around so your back faces the camera.');
  });

  it('gives the two back-view failures different wording, so turning around visibly changes something', () => {
    // Both used to say "Please turn your back to the camera", which is why
    // correcting one and then failing the other read as an endless loop.
    const notSquare = validatePoseFrame(
      [makePose('away', { leftShoulder: { x: 0.5 }, rightShoulder: { x: 0.5 } })],
      BACK
    );
    const wrongWay = validatePoseFrame([makePose('toward')], BACK);
    expect(notSquare.ok).toBe(false);
    expect(wrongWay.ok).toBe(false);
    expect(notSquare.message).not.toBe(wrongWay.message);
  });

  it('never uses an em dash in any facing instruction', () => {
    for (const result of [
      validatePoseFrame([makePose('away')], FRONT),
      validatePoseFrame([makePose('toward')], BACK),
    ]) {
      expect(result.message).not.toContain('—');
    }
  });
});

describe('facing detection — the side views were never broken and stay untouched', () => {
  /** A genuinely side-on pose: the shoulder line collapses toward a point. */
  function sidePose(): RawPoseLandmark[] {
    return makePose('toward', {
      leftShoulder: { x: 0.505, y: 0.22 },
      rightShoulder: { x: 0.495, y: 0.225 },
      leftHip: { x: 0.503, y: 0.5 },
      rightHip: { x: 0.497, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.72 },
      rightKnee: { x: 0.5, y: 0.72 },
      leftAnkle: { x: 0.5, y: 0.93 },
      rightAnkle: { x: 0.5, y: 0.93 },
    });
  }

  it('accepts a side-on pose for a side view without consulting facing at all', () => {
    expect(validatePoseFrame([sidePose()], LEFT_SIDE).ok).toBe(true);
  });

  it('accepts a side-on pose whatever its face visibility, since it never gated on that', () => {
    const faceHidden = makePose('toward', {
      leftShoulder: { x: 0.505, y: 0.22 },
      rightShoulder: { x: 0.495, y: 0.225 },
      leftHip: { x: 0.503, y: 0.5 },
      rightHip: { x: 0.497, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.72 },
      rightKnee: { x: 0.5, y: 0.72 },
      leftAnkle: { x: 0.5, y: 0.93 },
      rightAnkle: { x: 0.5, y: 0.93 },
      nose: { visibility: 0.1 },
      leftEye: { visibility: 0.1 },
      rightEye: { visibility: 0.1 },
      leftEar: { visibility: 0.1 },
      rightEar: { visibility: 0.1 },
    });
    expect(validatePoseFrame([faceHidden], LEFT_SIDE).ok).toBe(true);
  });

  it('still rejects a squared-up pose for a side view', () => {
    const rejected = validatePoseFrame([makePose('toward')], LEFT_SIDE);
    expect(rejected.ok).toBe(false);
    expect(rejected.status).toBe('wrong_orientation');
  });
});
