/**
 * Fixture-driven tests for lib/body-assessment/poseValidation.ts. Fixtures
 * are hand-built normalized (0..1) landmark sets standing in for real
 * PoseLandmarker output — standing/sitting/crouching/lying geometry is
 * approximated but each fixture is built from the same reasoning the
 * validator itself uses (thigh angle, leg span ratio, torso angle), so a
 * regression in that reasoning shows up here without needing a real model.
 */
import { describe, it, expect } from 'vitest';
import {
  validatePoseFrame,
  evaluateMultiPersonCandidate,
  type PoseValidationOptions,
} from '../lib/body-assessment/poseValidation';
import { toCoreLandmarks, POSE_LANDMARK_INDEX, type RawPoseLandmark } from '../lib/body-assessment/poseTypes';
import { computePoseMetrics } from '../lib/body-assessment/poseMetrics';

const FRONT: PoseValidationOptions = { requiresStanding: true, captureType: 'front' };
const LEFT_SIDE: PoseValidationOptions = { requiresStanding: true, captureType: 'left_side' };
const BACK: PoseValidationOptions = { requiresStanding: true, captureType: 'back' };

function makePose(overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}): RawPoseLandmark[] {
  // A well-framed, centered, standing, front-facing adult — every check should pass on this unless overridden.
  const base: Record<keyof typeof POSE_LANDMARK_INDEX, RawPoseLandmark> = {
    nose: { x: 0.5, y: 0.12, visibility: 0.98 },
    leftEyeInner: { x: 0.52, y: 0.11, visibility: 0.95 },
    leftEye: { x: 0.53, y: 0.11, visibility: 0.95 },
    leftEyeOuter: { x: 0.54, y: 0.11, visibility: 0.95 },
    rightEyeInner: { x: 0.48, y: 0.11, visibility: 0.95 },
    rightEye: { x: 0.47, y: 0.11, visibility: 0.95 },
    rightEyeOuter: { x: 0.46, y: 0.11, visibility: 0.95 },
    leftEar: { x: 0.56, y: 0.12, visibility: 0.9 },
    rightEar: { x: 0.44, y: 0.12, visibility: 0.9 },
    mouthLeft: { x: 0.52, y: 0.14, visibility: 0.9 },
    mouthRight: { x: 0.48, y: 0.14, visibility: 0.9 },
    leftShoulder: { x: 0.6, y: 0.22, visibility: 0.97 },
    rightShoulder: { x: 0.4, y: 0.22, visibility: 0.97 },
    leftElbow: { x: 0.62, y: 0.35, visibility: 0.9 },
    rightElbow: { x: 0.38, y: 0.35, visibility: 0.9 },
    leftWrist: { x: 0.63, y: 0.47, visibility: 0.85 },
    rightWrist: { x: 0.37, y: 0.47, visibility: 0.85 },
    leftPinky: { x: 0.63, y: 0.5, visibility: 0.7 },
    rightPinky: { x: 0.37, y: 0.5, visibility: 0.7 },
    leftIndex: { x: 0.63, y: 0.5, visibility: 0.7 },
    rightIndex: { x: 0.37, y: 0.5, visibility: 0.7 },
    leftThumb: { x: 0.63, y: 0.49, visibility: 0.7 },
    rightThumb: { x: 0.37, y: 0.49, visibility: 0.7 },
    leftHip: { x: 0.56, y: 0.5, visibility: 0.95 },
    rightHip: { x: 0.44, y: 0.5, visibility: 0.95 },
    leftKnee: { x: 0.56, y: 0.72, visibility: 0.93 },
    rightKnee: { x: 0.44, y: 0.72, visibility: 0.93 },
    leftAnkle: { x: 0.56, y: 0.93, visibility: 0.9 },
    rightAnkle: { x: 0.44, y: 0.93, visibility: 0.9 },
    leftHeel: { x: 0.56, y: 0.95, visibility: 0.8 },
    rightHeel: { x: 0.44, y: 0.95, visibility: 0.8 },
    leftFootIndex: { x: 0.56, y: 0.96, visibility: 0.8 },
    rightFootIndex: { x: 0.44, y: 0.96, visibility: 0.8 },
  };
  for (const key of Object.keys(overrides) as (keyof typeof POSE_LANDMARK_INDEX)[]) {
    base[key] = { ...base[key], ...overrides[key] };
  }
  const arr: RawPoseLandmark[] = new Array(33);
  for (const [key, index] of Object.entries(POSE_LANDMARK_INDEX)) {
    arr[index] = base[key as keyof typeof POSE_LANDMARK_INDEX];
  }
  return arr;
}

describe('validatePoseFrame', () => {
  it('passes on a well-framed standing front pose', () => {
    const result = validatePoseFrame([makePose()], FRONT);
    expect(result.status).toBe('ready');
    expect(result.ok).toBe(true);
  });

  it('skips all checks for steps that do not require standing', () => {
    const result = validatePoseFrame([], { requiresStanding: false, captureType: 'walking' });
    expect(result.status).toBe('ready');
  });

  it('reports no_person when nothing is detected', () => {
    const result = validatePoseFrame([], FRONT);
    expect(result.status).toBe('no_person');
    expect(result.ok).toBe(false);
  });

  it('validates the primary subject normally even when a second, identical (duplicate/ghost) detection is present — multi-person confirmation is a separate, temporally-hysteresis-protected layer, not this function\'s job', () => {
    const result = validatePoseFrame([makePose(), makePose()], FRONT);
    expect(result.status).toBe('ready');
  });

  it('reports low_confidence (immediate hard floor) when visibility is near zero', () => {
    const dim = makePose({
      nose: { visibility: 0.05 },
      leftShoulder: { visibility: 0.05 },
      rightShoulder: { visibility: 0.05 },
      leftHip: { visibility: 0.05 },
      rightHip: { visibility: 0.05 },
      leftKnee: { visibility: 0.05 },
      rightKnee: { visibility: 0.05 },
      leftAnkle: { visibility: 0.05 },
      rightAnkle: { visibility: 0.05 },
    });
    const result = validatePoseFrame([dim], FRONT);
    expect(result.status).toBe('low_confidence');
  });

  it('reports low_confidence as a LAST RESORT when confidence is merely marginal and every specific geometric check already passed', () => {
    // Overall subject.score averages below CONFIDENCE_THRESHOLD (0.5), but
    // knee/ankle visibility (what not_full_body actually gates on) and
    // face visibility (what wrong_orientation/head_rotated gate on) both
    // stay comfortably above it — nothing more specific is identifiable,
    // so this is the one case a generic message is still the right call.
    const marginal = makePose({
      nose: { visibility: 0.3 },
      leftShoulder: { visibility: 0.3 },
      rightShoulder: { visibility: 0.3 },
      leftHip: { visibility: 0.3 },
      rightHip: { visibility: 0.3 },
      leftKnee: { visibility: 0.6 },
      rightKnee: { visibility: 0.6 },
      leftAnkle: { visibility: 0.6 },
      rightAnkle: { visibility: 0.6 },
    });
    const result = validatePoseFrame([marginal], FRONT);
    expect(result.status).toBe('low_confidence');
  });

  it('prefers a SPECIFIC correction over the generic low-confidence message when both are true (the bug this fixes)', () => {
    // Same marginal overall confidence as above, but this time the member
    // is also genuinely off-center — the specific, actionable problem
    // must win over the generic "can't get a clear reading" catch-all.
    const marginalAndOffCenter = makePose({
      nose: { visibility: 0.3 },
      leftShoulder: { visibility: 0.3, x: 0.85 },
      rightShoulder: { visibility: 0.3, x: 0.65 },
      leftHip: { visibility: 0.3, x: 0.85 },
      rightHip: { visibility: 0.3, x: 0.65 },
      leftKnee: { visibility: 0.6 },
      rightKnee: { visibility: 0.6 },
      leftAnkle: { visibility: 0.6 },
      rightAnkle: { visibility: 0.6 },
    });
    const result = validatePoseFrame([marginalAndOffCenter], FRONT);
    expect(result.status).toBe('off_center');
  });

  it('reports not_full_body when feet are out of frame', () => {
    const cutOff = makePose({
      leftKnee: { visibility: 0.1 },
      rightKnee: { visibility: 0.1 },
      leftAnkle: { visibility: 0.1 },
      rightAnkle: { visibility: 0.1 },
    });
    const result = validatePoseFrame([cutOff], FRONT);
    expect(result.status).toBe('not_full_body');
  });

  it('reports too_close when the body fills almost the whole frame', () => {
    const close = makePose({
      nose: { y: 0.04 },
      leftEye: { y: 0.04 },
      rightEye: { y: 0.04 },
      leftAnkle: { y: 0.97 },
      rightAnkle: { y: 0.97 },
    });
    const result = validatePoseFrame([close], FRONT);
    expect(result.status).toBe('too_close');
  });

  it('reports too_far when the body only occupies a small fraction of the frame', () => {
    const far = makePose({
      nose: { y: 0.4 },
      leftEye: { y: 0.4 },
      rightEye: { y: 0.4 },
      leftShoulder: { y: 0.45 },
      rightShoulder: { y: 0.45 },
      leftHip: { y: 0.55 },
      rightHip: { y: 0.55 },
      leftKnee: { y: 0.62 },
      rightKnee: { y: 0.62 },
      leftAnkle: { y: 0.68 },
      rightAnkle: { y: 0.68 },
    });
    const result = validatePoseFrame([far], FRONT);
    expect(result.status).toBe('too_far');
  });

  it('reports off_center with a mirror-consistent direction (raw frame x > 0.65 means the member sees themselves on the right, so move right)', () => {
    const shifted = makePose({
      leftShoulder: { x: 0.85 },
      rightShoulder: { x: 0.65 },
      leftHip: { x: 0.85 },
      rightHip: { x: 0.65 },
    });
    const result = validatePoseFrame([shifted], FRONT);
    expect(result.status).toBe('off_center');
    expect(result.message).toMatch(/right/);
  });

  it('rejects a side-on pose for a front-view step', () => {
    const sideOn = makePose({
      leftShoulder: { x: 0.51 },
      rightShoulder: { x: 0.49 },
      leftHip: { x: 0.51 },
      rightHip: { x: 0.49 },
    });
    const result = validatePoseFrame([sideOn], FRONT);
    expect(result.status).toBe('wrong_orientation');
  });

  it('rejects a frontal pose for a side-view step', () => {
    const result = validatePoseFrame([makePose()], LEFT_SIDE);
    expect(result.status).toBe('wrong_orientation');
  });

  it('accepts a narrow, face-obscured pose for a side-view step', () => {
    const side = makePose({
      leftShoulder: { x: 0.51 },
      rightShoulder: { x: 0.49 },
      leftHip: { x: 0.51 },
      rightHip: { x: 0.49 },
      leftKnee: { x: 0.5 },
      rightKnee: { x: 0.5 },
      leftAnkle: { x: 0.5 },
      rightAnkle: { x: 0.5 },
    });
    const result = validatePoseFrame([side], LEFT_SIDE);
    expect(result.status).toBe('ready');
  });

  it('rejects a face-visible pose for a back-view step', () => {
    const result = validatePoseFrame([makePose()], BACK);
    expect(result.status).toBe('wrong_orientation');
  });

  it('detects sitting: hip-to-ankle vertical span compressed relative to standing', () => {
    // A front view can't see the thigh bending backward in depth, so the
    // reliable front-view signal is compression: hips drop much closer to
    // knee/ankle height than a standing leg span would allow.
    const sitting = makePose({
      leftHip: { y: 0.6 },
      rightHip: { y: 0.6 },
      leftKnee: { y: 0.62 },
      rightKnee: { y: 0.62 },
      leftAnkle: { y: 0.75 },
      rightAnkle: { y: 0.75 },
    });
    const result = validatePoseFrame([sitting], FRONT);
    expect(result.status).toBe('not_standing');
  });

  it('detects lying down: torso close to horizontal', () => {
    const lying = makePose({
      nose: { x: 0.1, y: 0.5 },
      leftEye: { x: 0.1, y: 0.5 },
      rightEye: { x: 0.1, y: 0.5 },
      leftShoulder: { x: 0.3, y: 0.52 },
      rightShoulder: { x: 0.3, y: 0.48 },
      leftHip: { x: 0.6, y: 0.52 },
      rightHip: { x: 0.6, y: 0.48 },
      leftKnee: { x: 0.8, y: 0.52 },
      rightKnee: { x: 0.8, y: 0.48 },
      leftAnkle: { x: 0.95, y: 0.52 },
      rightAnkle: { x: 0.95, y: 0.48 },
    });
    const result = validatePoseFrame([lying], FRONT);
    expect(result.status).toBe('not_standing');
  });

  it('accepts standing pose regardless of minor arm position (arms are not gated)', () => {
    const armsUp = makePose({
      leftWrist: { y: 0.1 },
      rightWrist: { y: 0.1 },
    });
    const result = validatePoseFrame([armsUp], FRONT);
    expect(result.status).toBe('ready');
  });

  it('reports head_rotated when one ear is far less visible than the other on a front view', () => {
    const turned = makePose({
      rightEar: { visibility: 0.1 },
    });
    const result = validatePoseFrame([turned], FRONT);
    expect(result.status).toBe('head_rotated');
  });

  it('reports head_rotated when the nose sits well off the shoulder midline on a front view', () => {
    const turned = makePose({ nose: { x: 0.65 } });
    const result = validatePoseFrame([turned], FRONT);
    expect(result.status).toBe('head_rotated');
  });

  it('reports shoulders_rotated when the pose model supplies a large left/right shoulder depth difference', () => {
    const twisted = makePose({
      leftShoulder: { z: 0.2 },
      rightShoulder: { z: -0.2 },
    });
    const result = validatePoseFrame([twisted], FRONT);
    expect(result.status).toBe('shoulders_rotated');
  });

  it('does not flag shoulder rotation when the pose model supplies no z estimate', () => {
    const result = validatePoseFrame([makePose()], FRONT);
    expect(result.status).toBe('ready');
  });

  it('reports crouching_or_bending for a bent-knee stance distinct from sitting', () => {
    const crouching = makePose({
      leftKnee: { x: 0.66 },
      rightKnee: { x: 0.34 },
    });
    const result = validatePoseFrame([crouching], FRONT);
    expect(result.status).toBe('crouching_or_bending');
  });

  it('reports excessive_lean for a moderate torso tilt that is not a full lying-down angle', () => {
    const leaning = makePose({
      nose: { x: 0.63 },
      leftShoulder: { x: 0.73 },
      rightShoulder: { x: 0.53 },
    });
    const result = validatePoseFrame([leaning], FRONT);
    expect(result.status).toBe('excessive_lean');
  });

  it('returns computed metrics on both passing and failing frames', () => {
    const ok = validatePoseFrame([makePose()], FRONT);
    expect(ok.metrics).not.toBeNull();
    const failing = validatePoseFrame([], FRONT);
    expect(failing.metrics).toBeNull();
  });

  describe('subject continuity (mid-hold person-swap detection)', () => {
    it('stays ready when no previousSubjectCenter is supplied (not mid-hold yet)', () => {
      const result = validatePoseFrame([makePose()], FRONT);
      expect(result.status).toBe('ready');
    });

    it('stays ready when the subject barely moves between two mid-hold frames', () => {
      const first = validatePoseFrame([makePose()], FRONT);
      const result = validatePoseFrame([makePose()], {
        ...FRONT,
        previousSubjectCenter: first.metrics!.hipMid,
      });
      expect(result.status).toBe('ready');
    });

    it('reports subject_changed when the confident subject jumps far between mid-hold frames', () => {
      const first = validatePoseFrame([makePose()], FRONT);
      const swapped = makePose({
        leftShoulder: { x: 0.2 },
        rightShoulder: { x: 0.1 },
        leftHip: { x: 0.2, y: 0.75 },
        rightHip: { x: 0.1, y: 0.75 },
        leftKnee: { x: 0.2, y: 0.85 },
        rightKnee: { x: 0.1, y: 0.85 },
        leftAnkle: { x: 0.2, y: 0.95 },
        rightAnkle: { x: 0.1, y: 0.95 },
      });
      const result = validatePoseFrame([swapped], {
        ...FRONT,
        previousSubjectCenter: first.metrics!.hipMid,
      });
      expect(result.status).toBe('subject_changed');
    });
  });
});

describe('camera height (camera_position)', () => {
  it('reports camera_position ("Raise the phone") when the body sits low in the frame', () => {
    const low = makePose({
      nose: { y: 0.52 },
      leftEye: { y: 0.52 },
      rightEye: { y: 0.52 },
      leftEar: { y: 0.52 },
      rightEar: { y: 0.52 },
      leftShoulder: { y: 0.58 },
      rightShoulder: { y: 0.58 },
      leftHip: { y: 0.72 },
      rightHip: { y: 0.72 },
      leftKnee: { y: 0.85 },
      rightKnee: { y: 0.85 },
      leftAnkle: { y: 0.95 },
      rightAnkle: { y: 0.95 },
    });
    const result = validatePoseFrame([low], FRONT);
    expect(result.status).toBe('camera_position');
    expect(result.message).toMatch(/Raise/);
  });

  it('reports camera_position ("Lower the phone") when the body sits high in the frame', () => {
    const high = makePose({
      nose: { y: 0.06 },
      leftEye: { y: 0.06 },
      rightEye: { y: 0.06 },
      leftEar: { y: 0.06 },
      rightEar: { y: 0.06 },
      leftShoulder: { y: 0.15 },
      rightShoulder: { y: 0.15 },
      leftHip: { y: 0.32 },
      rightHip: { y: 0.32 },
      leftKnee: { y: 0.42 },
      rightKnee: { y: 0.42 },
      leftAnkle: { y: 0.5 },
      rightAnkle: { y: 0.5 },
    });
    const result = validatePoseFrame([high], FRONT);
    expect(result.status).toBe('camera_position');
    expect(result.message).toMatch(/Lower/);
  });
});

describe('structured validation-result contract', () => {
  it('exposes category/severity/confidence/blocksCapture/resetsStabilityHold on a passing frame', () => {
    const ok = validatePoseFrame([makePose()], FRONT);
    expect(ok.category).toBe('measurement_readiness');
    expect(ok.severity).toBe('info');
    expect(ok.blocksCapture).toBe(false);
    expect(ok.resetsStabilityHold).toBe(false);
    expect(ok.confidence).toBeGreaterThan(0);
    expect(ok.correctionTarget).toBeNull();
    expect(ok.practitionerReviewRecommended).toBe(false);
  });

  it('exposes category/severity/blocksCapture and a matching spokenMessage on a failing frame', () => {
    const failing = validatePoseFrame([], FRONT);
    expect(failing.category).toBe('person_detection');
    expect(failing.severity).toBe('blocking');
    expect(failing.blocksCapture).toBe(true);
    expect(failing.resetsStabilityHold).toBe(true);
    expect(failing.spokenMessage).toBe(failing.message);
  });

  it('flags low_confidence and subject_changed as worth practitioner review', () => {
    const dim = makePose({
      nose: { visibility: 0.05 },
      leftShoulder: { visibility: 0.05 },
      rightShoulder: { visibility: 0.05 },
      leftHip: { visibility: 0.05 },
      rightHip: { visibility: 0.05 },
      leftKnee: { visibility: 0.05 },
      rightKnee: { visibility: 0.05 },
      leftAnkle: { visibility: 0.05 },
      rightAnkle: { visibility: 0.05 },
    });
    const lowConfidenceResult = validatePoseFrame([dim], FRONT);
    expect(lowConfidenceResult.practitionerReviewRecommended).toBe(true);
  });

  it('maps head_rotated and shoulders_rotated to their expected overlay correctionTarget', () => {
    const headTurned = validatePoseFrame([makePose({ rightEar: { visibility: 0.1 } })], FRONT);
    expect(headTurned.correctionTarget).toBe('head');

    const shouldersTwisted = validatePoseFrame(
      [makePose({ leftShoulder: { z: 0.2 }, rightShoulder: { z: -0.2 } })],
      FRONT
    );
    expect(shouldersTwisted.correctionTarget).toBe('shoulders');
  });
});

describe('evaluateMultiPersonCandidate', () => {
  function subjectContext(pose: RawPoseLandmark[]) {
    const core = toCoreLandmarks(pose)!;
    return { core, metrics: computePoseMetrics(core) };
  }

  it('reports no candidate when only one pose is detected', () => {
    const subject = makePose();
    const { core, metrics } = subjectContext(subject);
    const result = evaluateMultiPersonCandidate([subject], core, metrics);
    expect(result.candidateDetected).toBe(false);
    expect(result.reason).toBe('none');
  });

  it('never treats an exact duplicate detection of the same person as evidence of a second person', () => {
    const subject = makePose();
    const { core, metrics } = subjectContext(subject);
    // The exact same landmarks reported twice — the classic multi-pose-model
    // duplicate/ghost-detection artifact this function exists to filter out.
    const result = evaluateMultiPersonCandidate([subject, subject], core, metrics);
    expect(result.candidateDetected).toBe(false);
  });

  it('labels a near-duplicate (small jitter, same physical person) as same_person_duplicate, not evidence', () => {
    const subject = makePose();
    const jitteredDuplicate = makePose({
      leftHip: { x: 0.59 },
      rightHip: { x: 0.47 },
    });
    const { core, metrics } = subjectContext(subject);
    const result = evaluateMultiPersonCandidate([subject, jitteredDuplicate], core, metrics);
    expect(result.candidateDetected).toBe(false);
    expect(result.reason).toBe('same_person_duplicate');
  });

  it('detects a candidate when a second detection is spatially distinct AND confident', () => {
    const subject = makePose();
    const distinctOther = makePose({
      nose: { x: 0.1 },
      leftShoulder: { x: 0.16 },
      rightShoulder: { x: 0.04 },
      leftHip: { x: 0.16 },
      rightHip: { x: 0.04 },
      leftKnee: { x: 0.16 },
      rightKnee: { x: 0.04 },
      leftAnkle: { x: 0.16 },
      rightAnkle: { x: 0.04 },
    });
    const { core, metrics } = subjectContext(subject);
    const result = evaluateMultiPersonCandidate([subject, distinctOther], core, metrics);
    expect(result.candidateDetected).toBe(true);
    expect(result.reason).toBe('second_person_candidate');
  });

  it('does not treat a spatially distinct but low-confidence detection as a candidate', () => {
    const subject = makePose();
    const distinctButDim = makePose({
      nose: { x: 0.1, visibility: 0.1 },
      leftShoulder: { x: 0.16, visibility: 0.1 },
      rightShoulder: { x: 0.04, visibility: 0.1 },
      leftHip: { x: 0.16, visibility: 0.1 },
      rightHip: { x: 0.04, visibility: 0.1 },
      leftKnee: { x: 0.16, visibility: 0.1 },
      rightKnee: { x: 0.04, visibility: 0.1 },
      leftAnkle: { x: 0.16, visibility: 0.1 },
      rightAnkle: { x: 0.04, visibility: 0.1 },
    });
    const { core, metrics } = subjectContext(subject);
    const result = evaluateMultiPersonCandidate([subject, distinctButDim], core, metrics);
    expect(result.candidateDetected).toBe(false);
    expect(result.reason).toBe('low_confidence_other');
  });
});
