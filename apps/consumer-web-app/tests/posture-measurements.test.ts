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
  computeKneeAlignmentEstimate,
  computeFootTurnoutEstimate,
  computeWeightShiftEstimate,
  computeCaptureCompositeScores,
  computeAssessmentCompositeScores,
  computePostureEstimates,
  MEASUREMENT_REGISTRY,
} from '../lib/body-assessment/postureMeasurements';
import { computePoseMetrics } from '../lib/body-assessment/poseMetrics';
import {
  toCoreLandmarks,
  POSE_LANDMARK_INDEX,
  type RawPoseLandmark,
} from '../lib/body-assessment/poseTypes';
import type { CorePoseLandmarks } from '../lib/body-assessment/poseTypes';

/** Builds the raw 33-point landmark array (same shape landmarkMapping.ts/computeFootTurnoutEstimate consume) from the shared base fixture + overrides. `makeCore` wraps this with `toCoreLandmarks`. */
function makeRaw(
  overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}
): RawPoseLandmark[] {
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

function makeCore(
  overrides: Partial<Record<keyof typeof POSE_LANDMARK_INDEX, Partial<RawPoseLandmark>>> = {}
): CorePoseLandmarks {
  return toCoreLandmarks(makeRaw(overrides))!;
}

const DIAGNOSTIC_WORDS =
  /scoliosis|lower-crossed syndrome|trendelenburg sign|spinal disorder|you have/i;

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
    expect(
      computeShoulderAlignment(makeCore(), computePoseMetrics(makeCore()), 'left_side')
    ).toBeNull();
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
    expect(
      computeLowerCrossedIndicators(makeCore(), computePoseMetrics(makeCore()), 'front')
    ).toBeNull();
    const core = makeCore();
    const result = computeLowerCrossedIndicators(core, computePoseMetrics(core), 'left_side')!;
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    expect(result.narrative).toMatch(/practitioner review required|no lower-crossed/i);
  });
});

describe('computeSagittalTrunkPosture', () => {
  it('labels the output as an external estimate, not a spinal curvature measurement', () => {
    const result = computeSagittalTrunkPosture(
      makeCore(),
      computePoseMetrics(makeCore()),
      'left_side'
    )!;
    expect(result.narrative.toLowerCase()).toContain('not a spinal curvature measurement');
  });
});

describe('computeKneeAlignmentEstimate', () => {
  it('only applies to front/back captures', () => {
    const core = makeCore();
    expect(computeKneeAlignmentEstimate(core, computePoseMetrics(core), 'left_side')).toBeNull();
  });

  it('rejects the measurement when knee/hip/ankle landmarks are not confidently visible', () => {
    const core = makeCore({ leftKnee: { visibility: 0.1 }, rightKnee: { visibility: 0.1 } });
    expect(computeKneeAlignmentEstimate(core, computePoseMetrics(core), 'front')).toBeNull();
  });

  it('reports no deviation flag for a knee that sits on the hip-ankle line', () => {
    const core = makeCore();
    const result = computeKneeAlignmentEstimate(core, computePoseMetrics(core), 'front')!;
    expect(result).not.toBeNull();
    expect(result.severity).toBe('none');
    expect(result.findingType).toBe('knee_valgus');
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });

  it('flags a positive (valgus/medial) value when the knee drifts toward the midline', () => {
    // leftHip/leftAnkle are both x=0.56 (a vertical line); moving the knee
    // toward the midline (lower x, since midline ~0.5 < leftHip.x) should
    // produce a positive, flagged ratio.
    const core = makeCore({ leftKnee: { x: 0.5 } });
    const result = computeKneeAlignmentEstimate(core, computePoseMetrics(core), 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.value).toBeGreaterThan(0);
    expect(result.narrative.toLowerCase()).toContain('valgus/medial');
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });

  it('flags a negative (varus/lateral) value when the knee drifts away from the midline', () => {
    const core = makeCore({ leftKnee: { x: 0.62 } });
    const result = computeKneeAlignmentEstimate(core, computePoseMetrics(core), 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.value).toBeLessThan(0);
    expect(result.narrative.toLowerCase()).toContain('varus/lateral');
  });
});

describe('computeFootTurnoutEstimate', () => {
  it('only applies to front/back captures', () => {
    expect(computeFootTurnoutEstimate(makeRaw(), 'left_side')).toBeNull();
  });

  it('rejects the measurement when heel/foot-index landmarks are not confidently visible', () => {
    const raw = makeRaw({ leftHeel: { visibility: 0.1 }, leftFootIndex: { visibility: 0.1 } });
    expect(computeFootTurnoutEstimate(raw, 'front')).toBeNull();
  });

  it('returns null when the raw landmark array is missing required points', () => {
    expect(computeFootTurnoutEstimate([], 'front')).toBeNull();
  });

  it('reports no turnout flag when the foot points neutrally', () => {
    const result = computeFootTurnoutEstimate(makeRaw(), 'front')!;
    expect(result).not.toBeNull();
    expect(result.findingType).toBe('foot_turnout');
    expect(result.severity).toBe('none');
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });

  it('flags "turned outward" when the toe swings away from the midline', () => {
    const raw = makeRaw({ leftFootIndex: { x: 0.66 } });
    const result = computeFootTurnoutEstimate(raw, 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.value).toBeGreaterThan(0);
    expect(result.narrative.toLowerCase()).toContain('turned outward');
  });

  it('flags "turned inward" when the toe swings toward the midline', () => {
    const raw = makeRaw({ leftFootIndex: { x: 0.46 } });
    const result = computeFootTurnoutEstimate(raw, 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.value).toBeLessThan(0);
    expect(result.narrative.toLowerCase()).toContain('turned inward');
  });
});

describe('computeWeightShiftEstimate', () => {
  it('only applies to front/back captures', () => {
    const core = makeCore();
    expect(computeWeightShiftEstimate(core, computePoseMetrics(core), 'right_side')).toBeNull();
  });

  it('rejects the measurement when shoulder/hip/ankle landmarks are not confidently visible', () => {
    const core = makeCore({ leftAnkle: { visibility: 0.1 }, rightAnkle: { visibility: 0.1 } });
    expect(computeWeightShiftEstimate(core, computePoseMetrics(core), 'front')).toBeNull();
  });

  it('reports no shift flag when the visible-mass centroid sits over the base of support', () => {
    const core = makeCore();
    const result = computeWeightShiftEstimate(core, computePoseMetrics(core), 'front')!;
    expect(result).not.toBeNull();
    expect(result.findingType).toBe('weight_shift');
    expect(result.severity).toBe('none');
    expect(result.narrative).not.toMatch(DIAGNOSTIC_WORDS);
  });

  it('flags a shift toward the leg the centroid sits closer to, and discloses this is not a true center-of-mass measurement', () => {
    // Move the base of support (both ankles) away from the unchanged
    // shoulder/hip centroid, toward the right — the centroid should then
    // register as shifted toward the left leg.
    const core = makeCore({ leftAnkle: { x: 0.3 }, rightAnkle: { x: 0.2 } });
    const result = computeWeightShiftEstimate(core, computePoseMetrics(core), 'front')!;
    expect(result.severity).not.toBe('none');
    expect(result.side).toBe('left');
    expect(result.narrative.toLowerCase()).toContain('not a true center-of-mass');
  });
});

describe('computeCaptureCompositeScores', () => {
  it('computes a capture-quality score as the fraction of applicable measurements produced', () => {
    const core = makeCore();
    const estimates = computePostureEstimates(core, 'front');
    const scores = computeCaptureCompositeScores(estimates, 'front');
    const applicableCount = MEASUREMENT_REGISTRY.filter(
      (m) => m.resultType !== 'composite' && m.requiredViews.includes('front')
    ).length;
    expect(scores.overallCaptureQualityScore).toBeCloseTo(estimates.length / applicableCount, 3);
    expect(scores.overallAlignmentConfidenceScore).toBeGreaterThan(0);
    expect(scores.overallAlignmentConfidenceScore).toBeLessThanOrEqual(1);
  });

  it('only computes frontal symmetry for front/back captures and sagittal posture for side captures', () => {
    const frontCore = makeCore();
    const frontScores = computeCaptureCompositeScores(
      computePostureEstimates(frontCore, 'front'),
      'front'
    );
    expect(frontScores.overallFrontalSymmetryScore).not.toBeNull();
    expect(frontScores.overallSagittalPostureScore).toBeNull();

    const sideCore = makeCore();
    const sideScores = computeCaptureCompositeScores(
      computePostureEstimates(sideCore, 'left_side'),
      'left_side'
    );
    expect(sideScores.overallSagittalPostureScore).not.toBeNull();
    expect(sideScores.overallFrontalSymmetryScore).toBeNull();
  });

  it('scores a flagged/asymmetric capture lower on frontal symmetry than a neutral one', () => {
    const neutralScores = computeCaptureCompositeScores(
      computePostureEstimates(makeCore(), 'front'),
      'front'
    );
    const asymmetricCore = makeCore({ leftShoulder: { y: 0.32 }, leftHip: { y: 0.58 } });
    const asymmetricScores = computeCaptureCompositeScores(
      computePostureEstimates(asymmetricCore, 'front'),
      'front'
    );
    expect(asymmetricScores.overallFrontalSymmetryScore!).toBeLessThan(
      neutralScores.overallFrontalSymmetryScore!
    );
  });
});

describe('computeAssessmentCompositeScores', () => {
  it('aggregates capture and estimate counts across every capture in the assessment', () => {
    const captures: Array<'front' | 'left_side' | 'right_side' | 'back'> = [
      'front',
      'left_side',
      'right_side',
      'back',
    ];
    const estimatesByCaptureType = captures.map((captureType) => ({
      captureType,
      estimates: computePostureEstimates(makeCore(), captureType),
    }));
    const result = computeAssessmentCompositeScores(estimatesByCaptureType);
    expect(result.captureCount).toBe(4);
    expect(result.estimateCount).toBe(
      estimatesByCaptureType.reduce((sum, c) => sum + c.estimates.length, 0)
    );
    expect(result.overallPostureScreeningScore).toBeGreaterThan(0.8);
    expect(result.overallPostureScreeningScore).toBeLessThanOrEqual(1);
    expect(result.measurementReliabilityScore).toBeGreaterThan(0);
    expect(result.measurementReliabilityScore).toBeLessThanOrEqual(1);
  });

  it('returns a perfect screening score and zero reliability score for an empty assessment', () => {
    const result = computeAssessmentCompositeScores([]);
    expect(result.overallPostureScreeningScore).toBe(1);
    expect(result.measurementReliabilityScore).toBe(0);
    expect(result.captureCount).toBe(0);
    expect(result.estimateCount).toBe(0);
  });

  it('scores a heavily-flagged assessment lower than a neutral one', () => {
    const neutral = computeAssessmentCompositeScores([
      { captureType: 'front', estimates: computePostureEstimates(makeCore(), 'front') },
    ]);
    const flaggedCore = makeCore({
      leftShoulder: { y: 0.32 },
      leftHip: { y: 0.58 },
      leftKnee: { x: 0.5 },
    });
    const flagged = computeAssessmentCompositeScores([
      { captureType: 'front', estimates: computePostureEstimates(flaggedCore, 'front') },
    ]);
    expect(flagged.overallPostureScreeningScore).toBeLessThan(neutral.overallPostureScreeningScore);
  });
});

describe('MEASUREMENT_REGISTRY', () => {
  it('declares every compute* measurement in this file, including the newly added ones', () => {
    const ids = MEASUREMENT_REGISTRY.map((m) => m.id);
    for (const expected of [
      'forward_head',
      'elevated_shoulder',
      'hip_asymmetry',
      'lateral_trunk_asymmetry',
      'lower_crossed_pattern',
      'sagittal_trunk_posture',
      'knee_valgus',
      'foot_turnout',
      'weight_shift',
      'overall_capture_quality_score',
      'overall_alignment_confidence_score',
      'overall_frontal_symmetry_score',
      'overall_sagittal_posture_score',
      'overall_posture_screening_score',
      'measurement_reliability_score',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('does not list pelvic_drop_screening (a separate, time-series-shaped module)', () => {
    const ids = MEASUREMENT_REGISTRY.map((m) => m.id);
    expect(ids).not.toContain('pelvic_drop_screening');
  });

  it('gives every non-composite entry a positive min confidence and every composite entry zero', () => {
    for (const entry of MEASUREMENT_REGISTRY) {
      if (entry.resultType === 'composite') {
        expect(entry.minConfidence).toBe(0);
      } else {
        expect(entry.minConfidence).toBeGreaterThan(0);
      }
    }
  });
});

describe('computePostureEstimates', () => {
  it('returns only the estimates applicable to a front-view capture', () => {
    const estimates = computePostureEstimates(makeCore(), 'front');
    const types = estimates.map((e) => e.findingType);
    expect(types).toContain('elevated_shoulder');
    expect(types).toContain('hip_asymmetry');
    expect(types).toContain('lateral_trunk_asymmetry');
    expect(types).toContain('knee_valgus');
    expect(types).toContain('weight_shift');
    expect(types).not.toContain('forward_head');
    expect(types).not.toContain('sagittal_trunk_posture');
    // foot_turnout is omitted when no raw landmarks are passed — not a
    // guess, the same suppression behavior as low-confidence estimates.
    expect(types).not.toContain('foot_turnout');
  });

  it('includes foot_turnout when the raw 33-point landmark array is passed', () => {
    const core = makeCore();
    const raw = makeRaw();
    const estimates = computePostureEstimates(core, 'front', raw);
    expect(estimates.map((e) => e.findingType)).toContain('foot_turnout');
  });

  it('returns only the estimates applicable to a side-view capture', () => {
    const estimates = computePostureEstimates(makeCore(), 'left_side');
    const types = estimates.map((e) => e.findingType);
    expect(types).toContain('forward_head');
    expect(types).toContain('sagittal_trunk_posture');
    expect(types).not.toContain('elevated_shoulder');
    expect(types).not.toContain('knee_valgus');
    expect(types).not.toContain('weight_shift');
  });

  it('never produces a narrative naming a medical diagnosis, across every applicable estimate', () => {
    const all = [
      ...computePostureEstimates(makeCore(), 'front', makeRaw()),
      ...computePostureEstimates(makeCore(), 'left_side'),
      ...computePostureEstimates(makeCore(), 'back', makeRaw()),
    ];
    for (const estimate of all) {
      expect(estimate.narrative).not.toMatch(DIAGNOSTIC_WORDS);
    }
  });
});
