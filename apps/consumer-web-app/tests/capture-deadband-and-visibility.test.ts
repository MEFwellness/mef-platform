/**
 * The two halves of the back-view contradiction loop, and the dead bands
 * that stop any check from bouncing a member between opposite
 * instructions.
 *
 * THE LOOP, as measured. Running the real pose model against a figure seen
 * from behind (scripts/audit-facing-landmarks.mjs) produced, on ONE
 * detection, both of these at once:
 *
 *     knees and ankles, average visibility   0.116   ("step back")
 *     body span as a fraction of the frame   0.552   ("move closer")
 *
 * The old code averaged knee and ankle visibility and, when that fell
 * under 0.5, said "Step back until your entire body is visible". Stepping
 * back shrinks the body span, which is the very thing the other check
 * wanted larger. Neither instruction could ever satisfy the other, and the
 * member could only oscillate.
 *
 * Two separate defects are pinned here: an average that a legitimately
 * occluded body part drags down, and a low-visibility reading being
 * reported as if it were a distance problem.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateViewVisibility,
  MIN_PAIR_VISIBILITY,
  REQUIRED_PAIRS_BY_VIEW,
} from '../lib/body-assessment/viewVisibility';
import { bandVerdict, ceilingVerdict } from '../lib/body-assessment/hysteresis';
import { validatePoseFrame, type PoseValidationOptions } from '../lib/body-assessment/poseValidation';
import { evaluateCameraTilt } from '../lib/body-assessment/cameraTilt';
import { toCoreLandmarks, POSE_LANDMARK_INDEX, type RawPoseLandmark } from '../lib/body-assessment/poseTypes';

const FRONT: PoseValidationOptions = { requiresStanding: true, captureType: 'front' };
const BACK: PoseValidationOptions = { requiresStanding: true, captureType: 'back' };
const LEFT_SIDE: PoseValidationOptions = { requiresStanding: true, captureType: 'left_side' };

/** Face-landmark visibility the real model reports for a person facing directly away. Measured, not assumed. */
const MEASURED_AWAY_FACE_VISIBILITY = 0.95;

function makePose(
  facing: 'toward' | 'away',
  overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}
): RawPoseLandmark[] {
  const s = facing === 'toward' ? 1 : -1;
  const at = (offset: number) => 0.5 + s * offset;
  const base: Record<keyof typeof POSE_LANDMARK_INDEX, RawPoseLandmark> = {
    nose: { x: 0.5, y: 0.12, visibility: MEASURED_AWAY_FACE_VISIBILITY },
    leftEyeInner: { x: at(0.02), y: 0.11, visibility: 0.95 },
    leftEye: { x: at(0.03), y: 0.11, visibility: 0.95 },
    leftEyeOuter: { x: at(0.04), y: 0.11, visibility: 0.95 },
    rightEyeInner: { x: at(-0.02), y: 0.11, visibility: 0.95 },
    rightEye: { x: at(-0.03), y: 0.11, visibility: 0.95 },
    rightEyeOuter: { x: at(-0.04), y: 0.11, visibility: 0.95 },
    leftEar: { x: at(0.06), y: 0.12, visibility: 0.94 },
    rightEar: { x: at(-0.06), y: 0.12, visibility: 0.96 },
    mouthLeft: { x: at(0.02), y: 0.14, visibility: 0.9 },
    mouthRight: { x: at(-0.02), y: 0.14, visibility: 0.9 },
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

describe('view visibility — the face is never required, on any view', () => {
  it('passes an away-facing, well-framed pose despite confidently-reported face landmarks', () => {
    const pose = makePose('away');
    const core = toCoreLandmarks(pose)!;
    const result = evaluateViewVisibility(core, 'back');

    expect(result.ok).toBe(true);
    // The weakest required pair is a real body part, never the face.
    expect(result.weakestPair).not.toBeNull();
    expect(result.weakestPair!.join()).not.toMatch(/nose|Eye|Ear/);
    expect(validatePoseFrame([pose], BACK).ok).toBe(true);
  });

  it('passes the back view even when every face landmark is reported at near zero', () => {
    // The mirror case: face visibility must not be able to fail the check
    // in either direction, because it carries no information about whether
    // the body is in shot.
    const pose = makePose('away', {
      nose: { visibility: 0.01 },
      leftEye: { visibility: 0.01 },
      rightEye: { visibility: 0.01 },
      leftEar: { visibility: 0.01 },
      rightEar: { visibility: 0.01 },
    });
    expect(evaluateViewVisibility(toCoreLandmarks(pose)!, 'back').ok).toBe(true);
    expect(validatePoseFrame([pose], BACK).ok).toBe(true);
  });

  it('requires exactly the four body pairs the back view can expect to see', () => {
    const pairs = REQUIRED_PAIRS_BY_VIEW.back!;
    expect(pairs.map((p) => p[0])).toEqual([
      'leftShoulder',
      'leftHip',
      'leftKnee',
      'leftAnkle',
    ]);
  });
});

describe('view visibility — an occluded far side is normal, not a failure', () => {
  it('passes a side-view pose whose far leg and far shoulder are barely reported', () => {
    // On a side view the far side is BEHIND the near side. Averaging the
    // two produced a number that said "we cannot see the legs" about a
    // perfectly framed member; scoring each pair by its better side does
    // not.
    const sidePose = makePose('toward', {
      leftShoulder: { x: 0.505, y: 0.22, visibility: 0.95 },
      rightShoulder: { x: 0.495, y: 0.225, visibility: 0.12 },
      leftHip: { x: 0.503, y: 0.5, visibility: 0.94 },
      rightHip: { x: 0.497, y: 0.5, visibility: 0.1 },
      leftKnee: { x: 0.5, y: 0.72, visibility: 0.9 },
      rightKnee: { x: 0.5, y: 0.72, visibility: 0.08 },
      leftAnkle: { x: 0.5, y: 0.93, visibility: 0.88 },
      rightAnkle: { x: 0.5, y: 0.93, visibility: 0.05 },
    });
    const core = toCoreLandmarks(sidePose)!;
    const result = evaluateViewVisibility(core, 'left_side');

    // The mechanism, asserted directly rather than only its outcome: each
    // pair is scored by its BETTER side, so the overall score is the
    // weakest near-side landmark (the ankle at 0.88), NOT any average.
    // Averaging the two sides instead would give roughly 0.47 here, and a
    // test that only checked "did it pass" would not notice the
    // difference, because 0.47 still clears the floor. It is the far
    // side's ability to drag the number down at all that is the defect.
    expect(result.score).toBeCloseTo(0.88, 6);
    expect(result.weakestPair).toEqual(['leftAnkle', 'rightAnkle']);

    // And the old rule, an average across both sides of both lower-body
    // pairs against a 0.5 bar, genuinely failed this perfectly good pose.
    const oldAverage = (0.9 + 0.08 + 0.88 + 0.05) / 4;
    expect(oldAverage).toBeLessThan(0.5);

    expect(result.ok).toBe(true);
    expect(validatePoseFrame([sidePose], LEFT_SIDE).ok).toBe(true);
  });

  it('still fails when a body part is missing on BOTH sides', () => {
    const noLegs = makePose('toward', {
      leftAnkle: { visibility: 0.05 },
      rightAnkle: { visibility: 0.05 },
    });
    const result = evaluateViewVisibility(toCoreLandmarks(noLegs)!, 'front');
    expect(result.ok).toBe(false);
    expect(result.score).toBeLessThan(MIN_PAIR_VISIBILITY);
  });
});

describe('the contradiction itself', () => {
  it('never answers a not-detected body part with a distance instruction', () => {
    // The half of the loop that could not be resolved by moving at all.
    const undetectedLegs = makePose('away', {
      leftAnkle: { visibility: 0.02 },
      rightAnkle: { visibility: 0.11 },
    });
    const result = validatePoseFrame([undetectedLegs], BACK);

    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('Step back');
    expect(result.message).not.toContain('Move closer');
    expect(result.message).not.toContain('Step farther away');
  });

  it('answers genuinely clipped feet with a framing instruction, as it should', () => {
    const clipped = makePose('away', {
      leftAnkle: { y: 0.99 },
      rightAnkle: { y: 0.99 },
    });
    const result = validatePoseFrame([clipped], BACK);
    expect(result.status).toBe('not_full_body');
    expect(result.message).toContain('Step back');
  });
});

describe('dead bands — no instruction inside the band', () => {
  const FRAME_FILL = { failBelow: 0.65, failAbove: 0.9, releaseMargin: 0.04 };

  it('says nothing anywhere between the two thresholds', () => {
    for (const value of [0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
      expect(bandVerdict(value, FRAME_FILL, false)).toBe('ok');
    }
  });

  it('still complains outside the band, in the right direction', () => {
    expect(bandVerdict(0.6, FRAME_FILL, false)).toBe('below');
    expect(bandVerdict(0.95, FRAME_FILL, false)).toBe('above');
  });

  it('produces no distance instruction for a body sitting inside the band', () => {
    // Body span lands mid-band for the base fixture, so no distance
    // message should appear at all.
    expect(validatePoseFrame([makePose('toward')], FRONT).ok).toBe(true);
  });
});

describe('release margins — a satisfied check does not re-fail on drift', () => {
  const FRAME_FILL = { failBelow: 0.65, failAbove: 0.9, releaseMargin: 0.04 };

  it('holds a passing check through drift smaller than the margin', () => {
    // Just under the floor: a new problem for a check not yet satisfied,
    // ordinary sway for one that is.
    expect(bandVerdict(0.63, FRAME_FILL, false)).toBe('below');
    expect(bandVerdict(0.63, FRAME_FILL, true)).toBe('ok');

    expect(bandVerdict(0.92, FRAME_FILL, false)).toBe('above');
    expect(bandVerdict(0.92, FRAME_FILL, true)).toBe('ok');
  });

  it('still fails a passing check once the drift is real', () => {
    expect(bandVerdict(0.6, FRAME_FILL, true)).toBe('below');
    expect(bandVerdict(0.95, FRAME_FILL, true)).toBe('above');
  });

  it('applies the same grace to framing, via the one-sided form', () => {
    expect(ceilingVerdict(0.975, 0.97, 0.01, false)).toBe(true);
    expect(ceilingVerdict(0.975, 0.97, 0.01, true)).toBe(false);
    expect(ceilingVerdict(0.99, 0.97, 0.01, true)).toBe(true);
  });

  it('applies the same grace to tilt', () => {
    const justOver = { rollDegrees: 4, pitchDegrees: 0 };
    expect(evaluateCameraTilt(justOver, false).ok).toBe(false);
    expect(evaluateCameraTilt(justOver, true).ok).toBe(true);

    const wellOver = { rollDegrees: 9, pitchDegrees: 0 };
    expect(evaluateCameraTilt(wellOver, true).ok).toBe(false);
  });

  it('carries the grace through the validator itself, not just the helper', () => {
    // Body span nudged to 0.63, just under the 0.65 floor but inside the
    // 0.04 release margin. Fresh, that is a problem; after the check had
    // already been satisfied, it is ordinary sway.
    const drifted = makePose('toward', {
      leftKnee: { y: 0.62 },
      rightKnee: { y: 0.62 },
      leftAnkle: { y: 0.74 },
      rightAnkle: { y: 0.74 },
      leftHeel: { y: 0.75 },
      rightHeel: { y: 0.75 },
      leftFootIndex: { y: 0.76 },
      rightFootIndex: { y: 0.76 },
    });
    const fresh = validatePoseFrame([drifted], FRONT);
    const settled = validatePoseFrame([drifted], {
      ...FRONT,
      previouslyPassing: { distance: true, framing: true, centering: true },
    });

    expect(fresh.status).toBe('too_far');
    expect(settled.ok).toBe(true);
  });

  it('does not let the grace hide a genuinely new problem', () => {
    const wayTooFar = makePose('toward', {
      nose: { y: 0.4 },
      leftEye: { y: 0.4 },
      rightEye: { y: 0.4 },
      leftShoulder: { y: 0.45 },
      rightShoulder: { y: 0.45 },
      leftAnkle: { y: 0.8 },
      rightAnkle: { y: 0.8 },
    });
    const settled = validatePoseFrame([wayTooFar], {
      ...FRONT,
      previouslyPassing: { distance: true, framing: true, centering: true },
    });
    expect(settled.ok).toBe(false);
  });
});
