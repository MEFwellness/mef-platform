/**
 * lib/body-assessment/spinalCurve.ts — the silhouette-based upper-back and
 * lower-back angle measurement.
 *
 * The fixtures in tests/fixtures/spinal-curve are drawn side-view body
 * masks (see scripts/generate-spinal-curve-fixtures.mjs for why a drawn
 * mask, not a photo, is the honest input here: a mask is literally what
 * MediaPipe hands this code in production). Because they are drawn, the
 * true shape of every back is known in advance, which is what lets these
 * tests assert direction and not just "a number came out."
 *
 * What is proven here:
 *   - the rounded-upper-back silhouette reads a visibly larger upper-back
 *     angle than the upright one, and the flattened silhouette reads a
 *     visibly smaller lower-back angle,
 *   - the same image measured twice produces the same angles to the
 *     decimal, including across independent decodes of the file,
 *   - a ragged or smeared outline stores no angle at all rather than a
 *     guessed one,
 *   - the existing landmark-based estimates in postureMeasurements.ts are
 *     untouched by any of this,
 *   - a capture with no side view produces nothing new and breaks nothing.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import {
  measureSpinalCurve,
  isSpinalCurveView,
  spinalCurveAnchorsFromLandmarks,
  MIN_CONFIDENCE_TO_MEASURE,
  SPINAL_CURVE_METHOD_VERSION,
  type SegmentationMask,
  type SpinalCurveAnchors,
} from '../lib/body-assessment/spinalCurve';
import { computePostureEstimates } from '../lib/body-assessment/postureMeasurements';
import { toCoreLandmarks, POSE_LANDMARK_INDEX, type RawPoseLandmark } from '../lib/body-assessment/poseTypes';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'spinal-curve');

/** The landmark anchors every fixture was drawn around — kept in the committed anchors.json next to the images so the two can never drift apart. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FIXTURE_META = require(path.join(FIXTURE_DIR, 'anchors.json')) as {
  width: number;
  height: number;
  anchors: SpinalCurveAnchors;
};
const ANCHORS = FIXTURE_META.anchors;

async function loadMask(name: string): Promise<SegmentationMask> {
  const { data, info } = await sharp(path.join(FIXTURE_DIR, `${name}.png`))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** Flips a mask left-to-right, so the same body faces the other way and the back edge moves to the opposite side of the frame. */
function mirror(mask: SegmentationMask): SegmentationMask {
  const out = new Uint8Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      out[y * mask.width + x] = Number(mask.data[y * mask.width + (mask.width - 1 - x)] ?? 0);
    }
  }
  return { data: out, width: mask.width, height: mask.height };
}

function mirrorAnchors(a: SpinalCurveAnchors): SpinalCurveAnchors {
  return {
    shoulder: { x: 1 - a.shoulder.x, y: a.shoulder.y },
    hip: { x: 1 - a.hip.x, y: a.hip.y },
    facePoint: { x: 1 - a.facePoint.x, y: a.facePoint.y },
  };
}

describe('spinal curve measurement — validation against the drawn side-view fixtures', () => {
  it('measures both angles on an upright back', async () => {
    const result = measureSpinalCurve(await loadMask('upright'), ANCHORS);
    expect(result.rejectionReason).toBeNull();
    expect(result.thoracicAngleDegrees).not.toBeNull();
    expect(result.lumbarAngleDegrees).not.toBeNull();
    expect(result.methodVersion).toBe(SPINAL_CURVE_METHOD_VERSION);
    expect(result.maskQuality?.backSide).toBe('left');
    // Locked to the committed fixtures, so a future change to the geometry
    // has to be a deliberate act, not a silent drift.
    expect(result.thoracicAngleDegrees).toBe(27.4);
    expect(result.lumbarAngleDegrees).toBe(28.2);
  });

  it('reads a visibly larger upper-back angle on the rounded-upper-back silhouette', async () => {
    const upright = measureSpinalCurve(await loadMask('upright'), ANCHORS);
    const rounded = measureSpinalCurve(await loadMask('rounded-upper-back'), ANCHORS);

    expect(rounded.thoracicAngleDegrees).toBe(68.4);
    expect(rounded.thoracicAngleDegrees!).toBeGreaterThan(upright.thoracicAngleDegrees! + 15);
  });

  it('reads a visibly smaller lower-back angle on the flattened-lower-back silhouette', async () => {
    const upright = measureSpinalCurve(await loadMask('upright'), ANCHORS);
    const flat = measureSpinalCurve(await loadMask('flat-lower-back'), ANCHORS);

    expect(flat.lumbarAngleDegrees).toBe(10.2);
    expect(flat.lumbarAngleDegrees!).toBeLessThan(upright.lumbarAngleDegrees! - 15);
    // The flattened fixture's upper back is drawn identically to the
    // upright one, so the upper-back reading must barely move: the two
    // halves are measured independently and must not bleed into each other.
    expect(Math.abs(flat.thoracicAngleDegrees! - upright.thoracicAngleDegrees!)).toBeLessThan(2);
  });

  it('measures the same body identically whichever way it faces', async () => {
    const facingRight = measureSpinalCurve(await loadMask('upright'), ANCHORS);
    const facingLeft = measureSpinalCurve(mirror(await loadMask('upright')), mirrorAnchors(ANCHORS));

    expect(facingLeft.maskQuality?.backSide).toBe('right');
    expect(facingLeft.thoracicAngleDegrees).toBe(facingRight.thoracicAngleDegrees);
    expect(facingLeft.lumbarAngleDegrees).toBe(facingRight.lumbarAngleDegrees);
  });

  it('reads a float mask the same as the equivalent byte mask', async () => {
    // MediaPipe hands over [0,1] confidences; the fixtures are 0-255 bytes.
    // Both must walk the same path to the same answer.
    const byteMask = await loadMask('upright');
    const floatData = new Float32Array(byteMask.data.length);
    for (let i = 0; i < floatData.length; i++) floatData[i] = Number(byteMask.data[i]) / 255;

    const fromBytes = measureSpinalCurve(byteMask, ANCHORS);
    const fromFloats = measureSpinalCurve(
      { data: floatData, width: byteMask.width, height: byteMask.height },
      ANCHORS
    );
    expect(fromFloats.thoracicAngleDegrees).toBe(fromBytes.thoracicAngleDegrees);
    expect(fromFloats.lumbarAngleDegrees).toBe(fromBytes.lumbarAngleDegrees);
  });
});

describe('spinal curve measurement — determinism', () => {
  it('produces identical angles when the same image is processed twice', async () => {
    const mask = await loadMask('rounded-upper-back');
    const first = measureSpinalCurve(mask, ANCHORS);
    const second = measureSpinalCurve(mask, ANCHORS);

    expect(second.thoracicAngleDegrees).toBe(first.thoracicAngleDegrees);
    expect(second.lumbarAngleDegrees).toBe(first.lumbarAngleDegrees);
    expect(second.thoracicConfidence).toBe(first.thoracicConfidence);
    expect(second.lumbarConfidence).toBe(first.lumbarConfidence);
    expect(second).toEqual(first);
  });

  it('produces identical angles across independent decodes of the same file, many times over', async () => {
    const runs = [];
    for (let i = 0; i < 8; i++) {
      runs.push(measureSpinalCurve(await loadMask('flat-lower-back'), ANCHORS));
    }
    for (const run of runs) {
      expect(run).toEqual(runs[0]);
    }
  });

  it('is deterministic for every fixture, including the rejected ones', async () => {
    for (const name of [
      'upright',
      'rounded-upper-back',
      'flat-lower-back',
      'loose-clothing',
      'low-contrast',
    ]) {
      const mask = await loadMask(name);
      expect(measureSpinalCurve(mask, ANCHORS)).toEqual(measureSpinalCurve(mask, ANCHORS));
    }
  });
});

describe('spinal curve measurement — refusing to guess', () => {
  it('stores no angle when loose clothing makes the outline ragged', async () => {
    const result = measureSpinalCurve(await loadMask('loose-clothing'), ANCHORS);

    expect(result.thoracicAngleDegrees).toBeNull();
    expect(result.lumbarAngleDegrees).toBeNull();
    expect(result.thoracicConfidence).toBeLessThan(MIN_CONFIDENCE_TO_MEASURE);
    expect(result.lumbarConfidence).toBeLessThan(MIN_CONFIDENCE_TO_MEASURE);
    expect(result.rejectionReason).toBeTruthy();
    // The rejection is caused by edge roughness specifically: the outline
    // was fully traced, it just does not follow a smooth curve.
    expect(result.maskQuality!.rowCoverage).toBeGreaterThan(0.9);
    expect(result.maskQuality!.edgeRoughnessPx).toBeGreaterThan(4);
  });

  it('stores no angle when the body barely contrasts with the background', async () => {
    const result = measureSpinalCurve(await loadMask('low-contrast'), ANCHORS);

    expect(result.thoracicAngleDegrees).toBeNull();
    expect(result.lumbarAngleDegrees).toBeNull();
    expect(result.rejectionReason).toBeTruthy();
    // Here the cause is a smeared edge, not a rough one.
    expect(result.maskQuality!.edgeSharpness).toBeLessThan(0.2);
  });

  it('stores no angle when it cannot tell which way the body is facing', async () => {
    const mask = await loadMask('upright');
    const result = measureSpinalCurve(mask, { ...ANCHORS, facePoint: { x: 0.5, y: 0.075 } });

    expect(result.thoracicAngleDegrees).toBeNull();
    expect(result.lumbarAngleDegrees).toBeNull();
    expect(result.rejectionReason).toContain('facing');
  });

  it('stores no angle when the shoulder-to-hip band is too short to fit a curve across', async () => {
    const mask = await loadMask('upright');
    const result = measureSpinalCurve(mask, {
      ...ANCHORS,
      hip: { x: 0.5, y: ANCHORS.shoulder.y + 0.01 },
    });

    expect(result.thoracicAngleDegrees).toBeNull();
    expect(result.lumbarAngleDegrees).toBeNull();
    expect(result.rejectionReason).toBeTruthy();
  });

  it('stores no angle for an empty or unreadable mask', () => {
    const blank = measureSpinalCurve(
      { data: new Uint8Array(720 * 1280), width: 720, height: 1280 },
      ANCHORS
    );
    expect(blank.thoracicAngleDegrees).toBeNull();
    expect(blank.lumbarAngleDegrees).toBeNull();

    const tiny = measureSpinalCurve({ data: new Uint8Array(4), width: 2, height: 2 }, ANCHORS);
    expect(tiny.thoracicAngleDegrees).toBeNull();
    expect(tiny.maskQuality).toBeNull();

    const truncated = measureSpinalCurve(
      { data: new Uint8Array(100), width: 720, height: 1280 },
      ANCHORS
    );
    expect(truncated.thoracicAngleDegrees).toBeNull();
    expect(truncated.rejectionReason).toBeTruthy();
  });
});

describe('spinal curve measurement — anchors from landmarks', () => {
  const visible = (x: number, y: number, visibility = 0.95): RawPoseLandmark => ({ x, y, visibility });

  it('picks the more visible shoulder and hip, and the nose as the face side', () => {
    const anchors = spinalCurveAnchorsFromLandmarks({
      nose: visible(0.6, 0.075),
      leftShoulder: visible(0.5, 0.235, 0.9),
      rightShoulder: visible(0.49, 0.24, 0.5),
      leftHip: visible(0.5, 0.545, 0.6),
      rightHip: visible(0.51, 0.55, 0.92),
    });
    expect(anchors).toEqual({
      shoulder: { x: 0.5, y: 0.235 },
      hip: { x: 0.51, y: 0.55 },
      facePoint: { x: 0.6, y: 0.075 },
    });
  });

  it('returns nothing when any anchor is not confidently visible', () => {
    expect(
      spinalCurveAnchorsFromLandmarks({
        nose: visible(0.6, 0.075, 0.2),
        leftShoulder: visible(0.5, 0.235),
        rightShoulder: visible(0.49, 0.24),
        leftHip: visible(0.5, 0.545),
        rightHip: visible(0.51, 0.55),
      })
    ).toBeNull();

    expect(
      spinalCurveAnchorsFromLandmarks({
        nose: visible(0.6, 0.075),
        leftShoulder: visible(0.5, 0.235, 0.1),
        rightShoulder: visible(0.49, 0.24, 0.2),
        leftHip: visible(0.5, 0.545),
        rightHip: visible(0.51, 0.55),
      })
    ).toBeNull();
  });
});

describe('spinal curve measurement — leaves the existing pipeline alone', () => {
  /** Builds the raw 33-point landmark array for a side-view pose, mirroring tests/posture-measurements.test.ts's fixture approach. */
  function sideViewLandmarks(): RawPoseLandmark[] {
    const points: RawPoseLandmark[] = [];
    for (let i = 0; i < 33; i++) points.push({ x: 0.5, y: 0.5, visibility: 0.9 });
    const set = (key: keyof typeof POSE_LANDMARK_INDEX, x: number, y: number, v = 0.95) => {
      points[POSE_LANDMARK_INDEX[key]] = { x, y, visibility: v };
    };
    set('nose', 0.6, 0.075);
    set('leftEye', 0.59, 0.07);
    set('rightEye', 0.585, 0.07);
    set('leftEar', 0.545, 0.08);
    set('rightEar', 0.54, 0.08);
    set('leftShoulder', 0.5, 0.235);
    set('rightShoulder', 0.495, 0.237);
    set('leftHip', 0.5, 0.545);
    set('rightHip', 0.498, 0.546);
    set('leftKnee', 0.495, 0.73);
    set('rightKnee', 0.494, 0.731);
    set('leftAnkle', 0.5, 0.93);
    set('rightAnkle', 0.499, 0.931);
    return points;
  }

  it('does not change what the landmark-based estimates produce for a side view', () => {
    const core = toCoreLandmarks(sideViewLandmarks())!;
    const estimates = computePostureEstimates(core, 'left_side');

    // The three estimates this view has always produced, unchanged:
    // nothing in the silhouette path adds to, removes from, or renames
    // them, and in particular no new spinal-curve finding type appears
    // here — the two angles are stored on the capture, not as findings.
    expect(estimates.map((e) => e.findingType).sort()).toEqual([
      'forward_head',
      'lower_crossed_pattern',
      'sagittal_trunk_posture',
    ]);
    for (const estimate of estimates) {
      expect(Number.isFinite(estimate.value)).toBe(true);
    }
  });

  it('produces the same landmark estimates whether or not a silhouette measurement was taken', async () => {
    const core = toCoreLandmarks(sideViewLandmarks())!;
    const before = computePostureEstimates(core, 'left_side');
    measureSpinalCurve(await loadMask('upright'), ANCHORS);
    const after = computePostureEstimates(core, 'left_side');

    expect(after).toEqual(before);
  });

  it('only runs on side-view photo captures, so a capture with no side view stores nothing new', () => {
    expect(isSpinalCurveView('left_side', 'image')).toBe(true);
    expect(isSpinalCurveView('right_side', 'image')).toBe(true);

    expect(isSpinalCurveView('front', 'image')).toBe(false);
    expect(isSpinalCurveView('back', 'image')).toBe(false);
    expect(isSpinalCurveView('movement', 'video')).toBe(false);
    expect(isSpinalCurveView('walking', 'video')).toBe(false);
    expect(isSpinalCurveView('custom', 'image')).toBe(false);
    // A side-view VIDEO step (the hip-hinge assessment has one) is a
    // moving body, not a standing posture, so it is out of scope too.
    expect(isSpinalCurveView('left_side', 'video')).toBe(false);
  });
});
