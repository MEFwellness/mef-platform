/**
 * lib/body-assessment/postureMeasurements.ts — verifies each estimate (a)
 * only fires for the capture views it's documented as applicable to, (b)
 * rejects rather than guesses when required landmarks aren't confident,
 * and (c) never emits a diagnostic label, only screening-indicator
 * wording. Fixtures mirror tests/pose-validation.test.ts's approach.
 */
import { describe, it, expect } from 'vitest';
import {
  computeForwardHeadEstimate,
  computeShoulderAlignment,
  computeHipAlignment,
  computeLateralTrunkAsymmetry,
  computeLowerCrossedIndicators,
  computeSagittalTrunkPosture,
  computePostureEstimates,
} from '../lib/body-assessment/postureMeasurements';
import { computePoseMetrics } from '../lib/body-assessment/poseMetrics';
import { toCoreLandmarks, POSE_LANDMARK_INDEX, type RawPoseLandmark } from '../lib/body-assessment/poseTypes';
import type { CorePoseLandmarks } from '../lib/body-assessment/poseTypes';

function makeCore(
  overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}
): CorePoseLandmarks {
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
  return toCoreLandmarks(arr)!;
}

const DIAGNOSTIC_WORDS = /scoliosis|lower-crossed syndrome|trendelenburg sign|spinal disorder|you have/i;

describe('computeForwardHeadEstimate', () => {
  it('only applies to side-view captures', () => {
    expect(computeForwardHeadEstimate(makeCore(), 'front')).toBeNull();
    expect(computeForwardHeadEstimate(makeCore(), 'back')).toBeNull();
  });

  it('rejects the measurement when the ear/shoulder are not confidently visible', () => {
    const core = makeCore({ leftEar: { visibility: 0.1 }, rightEar: { visibility: 0.1 } });
    expect(computeForwardHeadEstimate(core, 'left_side')).toBeNull();
  });

  it('produces a labeled estimate with no diagnostic wording for a side view', () => {
    const estimate = computeForwardHeadEstimate(makeCore(), 'left_side');
    expect(estimate).not.toBeNull();
    expect(estimate!.findingType).toBe('forward_head');
    expect(estimate!.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    expect(estimate!.narrative.toLowerCase()).toContain('estimate');
  });

  it('never uses the phrase "forehead carriage"', () => {
    const estimate = computeForwardHeadEstimate(makeCore(), 'left_side');
    expect(estimate!.narrative.toLowerCase()).not.toContain('forehead carriage');
  });
});

describe('computeShoulderAlignment', () => {
  it('only applies to front/back captures', () => {
    expect(computeShoulderAlignment(makeCore(), computePoseMetrics(makeCore()), 'left_side')).toBeNull();
  });

  it('flags possible asymmetry only when the height difference exceeds the screening threshold', () => {
    const level = makeCore();
    const uneven = makeCore({ leftShoulder: { y: 0.3 } });
    const levelResult = computeShoulderAlignment(level, computePoseMetrics(level), 'front')!;
    const unevenResult = computeShoulderAlignment(uneven, computePoseMetrics(uneven), 'front')!;
    expect(levelResult.severity).toBe('none');
    expect(unevenResult.severity).not.toBe('none');
    expect(unevenResult.narrative).toMatch(/possible/i);
    expect(unevenResult.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });
});

describe('computeHipAlignment', () => {
  it('flags possible asymmetry for an uneven hip line', () => {
    const uneven = makeCore({ leftHip: { y: 0.58 } });
    const result = computeHipAlignment(uneven, computePoseMetrics(uneven), 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });
});

describe('computeLateralTrunkAsymmetry', () => {
  it('never mentions scoliosis and uses "visible asymmetry detected" wording when flagged', () => {
    const asymmetric = makeCore({ leftShoulder: { y: 0.32 }, leftHip: { y: 0.58 } });
    const result = computeLateralTrunkAsymmetry(
      asymmetric,
      computePoseMetrics(asymmetric),
      'front'
    )!;
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    expect(result.narrative.toLowerCase()).toContain('visible asymmetry detected');
  });

  it('reports no flag for a symmetric pose', () => {
    const core = makeCore();
    const result = computeLateralTrunkAsymmetry(core, computePoseMetrics(core), 'front')!;
    expect(result.severity).toBe('none');
  });
});

describe('computeLowerCrossedIndicators', () => {
  it('only applies to side-view captures and never names lower-crossed syndrome as a diagnosis', () => {
    expect(computeLowerCrossedIndicators(makeCore(), computePoseMetrics(makeCore()), 'front')).toBeNull();
    const core = makeCore();
    const result = computeLowerCrossedIndicators(core, computePoseMetrics(core), 'left_side')!;
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    expect(result.narrative).toMatch(/practitioner review required|no lower-crossed/i);
  });
});

describe('computeSagittalTrunkPosture', () => {
  it('labels the output as an external estimate, not a spinal curvature measurement', () => {
    const result = computeSagittalTrunkPosture(makeCore(), computePoseMetrics(makeCore()), 'left_side')!;
    expect(result.narrative.toLowerCase()).toContain('not a spinal curvature measurement');
  });
});

describe('computePostureEstimates', () => {
  it('returns only the estimates applicable to a front-view capture', () => {
    const estimates = computePostureEstimates(makeCore(), 'front');
    const types = estimates.map((e) => e.findingType);
    expect(types).toContain('elevated_shoulder');
    expect(types).toContain('hip_asymmetry');
    expect(types).toContain('lateral_trunk_asymmetry');
    expect(types).not.toContain('forward_head');
    expect(types).not.toContain('sagittal_trunk_posture');
  });

  it('returns only the estimates applicable to a side-view capture', () => {
    const estimates = computePostureEstimates(makeCore(), 'left_side');
    const types = estimates.map((e) => e.findingType);
    expect(types).toContain('forward_head');
    expect(types).toContain('sagittal_trunk_posture');
    expect(types).not.toContain('elevated_shoulder');
  });

  it('never produces a narrative naming a medical diagnosis, across every applicable estimate', () => {
    const all = [
      ...computePostureEstimates(makeCore(), 'front'),
      ...computePostureEstimates(makeCore(), 'left_side'),
      ...computePostureEstimates(makeCore(), 'back'),
    ];
    for (const estimate of all) {
      expect(estimate.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    }
  });
});
