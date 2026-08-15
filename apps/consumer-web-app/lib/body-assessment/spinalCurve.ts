/**
 * Spinal curve measurement from the body silhouette — the segmentation-
 * based companion to lib/body-assessment/postureMeasurements.ts.
 *
 * ============================================================
 * WHY THIS FILE EXISTS
 * ============================================================
 * MediaPipe's 33-point pose topology has NO landmark anywhere between the
 * shoulder and the hip: no C7, no thoracic or lumbar vertebra, no sacrum.
 * A straight line drawn between the shoulder point and the hip point is by
 * definition straight, so it can never describe a curve. That is exactly
 * why postureMeasurements.ts's docblock says per-region cervical/thoracic/
 * lumbar curvature is NOT computed there, and why computeSagittalTrunkPosture
 * only reports one combined trunk inclination.
 *
 * The pose model does, however, also produce a SEGMENTATION MASK: a
 * per-pixel "how likely is this pixel part of the person" image. On a side
 * view, the back edge of that mask is a continuous outline of the person's
 * actual back surface, from the base of the neck all the way down to the
 * pelvis, sampled at every single pixel row. That outline is a curve, and a
 * curve can be measured. This file measures it.
 *
 * ============================================================
 * WHAT THIS FILE DOES AND DOES NOT CLAIM
 * ============================================================
 * This measures the SURFACE OF THE BACK, not the spine. It is the same
 * thing a practitioner measures with a flexible curve, a kyphometer, or a
 * pair of inclinometers laid on the skin: an external contour, which is a
 * proxy for the underlying vertebral column, not the column itself. It is
 * not a Cobb angle and not a radiographic measurement.
 *
 * This module is MEASUREMENT ONLY. It produces two numbers and two
 * confidences. It deliberately contains:
 *   - no severity thresholds,
 *   - no finding types,
 *   - no normal/abnormal judgement,
 *   - no member-facing narrative.
 * Interpretation is a separate concern and deliberately lives elsewhere.
 *
 * ============================================================
 * HOW THE TWO ANGLES ARE DEFINED (the geometry, in full)
 * ============================================================
 * 1. The measured band runs from the shoulder landmark's pixel row down to
 *    PELVIS_BAND_FRACTION (92%) of the way to the hip landmark's row. The
 *    band stops just short of hip-joint height on purpose: the gluteal
 *    contour bulges sharply backward at and below that level, and letting
 *    it into the fit would corrupt the lower-back reading with a shape that
 *    is not spinal at all.
 *
 * 2. Every pixel row in that band is scanned inward from the back side of
 *    the frame until the mask crosses BODY_THRESHOLD (0.5). Linear
 *    interpolation across that crossing gives a sub-pixel back-edge
 *    position for the row. Which side is "the back" is decided from the
 *    landmarks, not assumed: whichever horizontal direction the face points
 *    is anterior, so the other side is posterior.
 *
 * 3. The band is split at THORACOLUMBAR_SPLIT (0.60) into an upper and a
 *    lower half, where 0 is the top of the band (base of the neck) and 1 is
 *    the bottom (top of the pelvis). 0.60 is a fixed anatomical
 *    approximation of where the thoracic spine gives way to the lumbar
 *    spine in a typical adult. It is a constant, not something detected per
 *    person.
 *
 * 4. Each half is then fitted with its OWN smooth cubic curve by least
 *    squares, using only that half's rows. One outlier-rejection pass drops
 *    rows more than 3 RMS from the first fit and refits once. Two passes
 *    exactly, never a convergence loop, so the arithmetic is fixed. Fitting
 *    the halves separately is what keeps a pronounced upper back from
 *    bending the lower-back reading, and vice versa: one shared curve has
 *    too few degrees of freedom to hold both shapes at once, so the larger
 *    feature would dominate the smaller one.
 *
 * 5. The INCLINATION at any point is the angle of that half's fitted curve
 *    away from vertical at that point, in degrees. Positive means the back
 *    surface is travelling backward (posteriorly) as you move downward.
 *
 * 6. UPPER BACK (THORACIC) ANGLE = inclination at the top of the upper half
 *    minus inclination at the bottom of it. In words: how many degrees the
 *    back surface turns between the base of the neck and the mid-back
 *    junction. A perfectly straight upper back reads 0. A rounded upper
 *    back reads a larger positive number, because the surface leaves the
 *    neck heading backward and has to turn forward again to come off the
 *    hump.
 *
 * 7. LOWER BACK (LUMBAR) ANGLE = inclination at the bottom of the lower
 *    half minus inclination at the top of it. In words: how many degrees
 *    the back surface turns between the mid-back junction and the top of
 *    the pelvis. A flat lower back reads near 0. A deeply hollowed lower
 *    back reads a larger positive number.
 *
 * This "difference between the inclination at the two ends of a region" is
 * the same quantity a two-inclinometer or kyphometer protocol produces, so
 * a practitioner can put a caliper on the same two points and compare. What
 * differs from a caliper is only WHERE the two ends sit: this file anchors
 * them to the shoulder and hip landmarks and a fixed 60% split, not to
 * palpated spinous processes.
 *
 * ============================================================
 * DETERMINISM
 * ============================================================
 * Same mask plus same anchors must produce the same two angles to the
 * decimal, every time. Everything here is a pure function of its inputs:
 * no clock, no randomness, no iteration-until-converged, no Set/Map
 * ordering dependence, fixed loop bounds. tests/spinal-curve.test.ts
 * proves it against the committed fixture images.
 *
 * ============================================================
 * REJECTING RATHER THAN GUESSING
 * ============================================================
 * Same discipline as postureMeasurements.ts: when the silhouette edge is
 * not good enough to trust, the angle is stored as null and no number is
 * invented. Loose clothing (a ragged, rippling edge), poor contrast with
 * the background (a soft, smeared mask edge), or a broken outline all push
 * the confidence down, and below MIN_CONFIDENCE_TO_MEASURE nothing is
 * reported for that segment.
 */

/**
 * A per-pixel body-probability image, row-major, `width * height` values.
 * Float32Array carries MediaPipe's native [0,1] confidences; Uint8Array /
 * Uint8ClampedArray carries the 0-255 form (e.g. a decoded greyscale PNG
 * test fixture). Both are accepted so the exact same code path runs in the
 * browser and in tests.
 */
export type SegmentationMask = {
  data: Float32Array | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * The three landmark positions this measurement anchors to, in the pose
 * model's normalized [0,1] image coordinates (origin top-left), so they map
 * onto a mask of any resolution without a scale factor.
 */
export type SpinalCurveAnchors = {
  /** The more confidently visible shoulder — the top of the measured band. */
  shoulder: { x: number; y: number };
  /** The more confidently visible hip — sets the bottom of the measured band. */
  hip: { x: number; y: number };
  /** A point on the face side of the body. Used only to decide which silhouette edge is the back, never measured. */
  facePoint: { x: number; y: number };
};

/** Everything about the mask edge that fed the fit — stored with the capture so a reading can be audited later, not just trusted. */
export type SpinalCurveMaskQuality = {
  /** Which horizontal side of the frame the back was found on. */
  backSide: 'left' | 'right';
  /** Height of the measured band in mask pixels. */
  bandHeightPx: number;
  /** Pixel rows in the band the scan attempted. */
  rowsRequested: number;
  /** Rows that produced a usable back-edge crossing and survived outlier rejection. */
  rowsUsable: number;
  /** rowsUsable / rowsRequested, 0-1. */
  rowCoverage: number;
  /** 0-1, how crisp the mask transition was at the back edge. A soft, smeared edge (low contrast with the background) scores low. */
  edgeSharpness: number;
  /** RMS distance in pixels from the scanned edge points to the fitted curve. Loose clothing and a ragged outline push this up. */
  edgeRoughnessPx: number;
  /** Rows dropped by the single outlier-rejection pass. */
  rowsRejectedAsOutliers: number;
};

export type SpinalCurveMeasurement = {
  /** Degrees the back surface turns between the base of the neck and the 60% junction. Null when confidence did not clear the floor. */
  thoracicAngleDegrees: number | null;
  /** 0-1 trust in thoracicAngleDegrees. Always present, even when the angle is null. */
  thoracicConfidence: number;
  /** Degrees the back surface turns between the 60% junction and the top of the pelvis. Null when confidence did not clear the floor. */
  lumbarAngleDegrees: number | null;
  /** 0-1 trust in lumbarAngleDegrees. */
  lumbarConfidence: number;
  maskQuality: SpinalCurveMaskQuality | null;
  /** Bumped whenever the geometry above changes meaning, so a stored reading can be traced to the formula generation that produced it. */
  methodVersion: string;
  /** Plain-language reason a measurement was withheld, or null when both angles were reported. */
  rejectionReason: string | null;
};

/** Bump when any constant or step in the geometry above changes meaning. Stored with every reading. */
export const SPINAL_CURVE_METHOD_VERSION = 'silhouette_back_edge_cubic_v1';

/** Mask value above which a pixel counts as body. Masks are confidences, so the halfway point is the edge. */
const BODY_THRESHOLD = 0.5;

/** The measured band stops at 92% of the way from the shoulder row to the hip row, staying clear of the gluteal contour. */
const PELVIS_BAND_FRACTION = 0.92;

/** Where the upper segment ends and the lower begins, as a fraction of the band. A fixed anatomical approximation, not detected per person. */
const THORACOLUMBAR_SPLIT = 0.6;

/** Same floor as postureMeasurements.ts's MIN_CONFIDENCE_TO_ESTIMATE, on purpose: one reject-rather-than-guess bar across the whole screening engine. */
export const MIN_CONFIDENCE_TO_MEASURE = 0.45;

/** Below this many pixel rows the band is too short to fit a curve through each half of. */
const MIN_BAND_ROWS = 60;

/** Below this many surviving rows in one half, that half's fit has too little to stand on, whatever the coverage ratio says. */
const MIN_USABLE_ROWS = 24;

/** A crossing only counts if the mask stays body-side for this many pixels inward, so a single speck of noise is not read as the back. */
const EDGE_RUN_PX = 5;
/** The looser bar those confirmation pixels must clear. */
const EDGE_RUN_THRESHOLD = 0.35;

/** Anterior/posterior cannot be told apart when the face point sits this close to the body's own centre line, as a fraction of frame width. */
const MIN_FACING_SEPARATION_FRACTION = 0.01;

/** Landmark visibility floor for the three anchors, matching postureMeasurements.ts. */
const MIN_ANCHOR_VISIBILITY = 0.45;

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function emptyResult(reason: string, quality: SpinalCurveMaskQuality | null): SpinalCurveMeasurement {
  return {
    thoracicAngleDegrees: null,
    thoracicConfidence: 0,
    lumbarAngleDegrees: null,
    lumbarConfidence: 0,
    maskQuality: quality,
    methodVersion: SPINAL_CURVE_METHOD_VERSION,
    rejectionReason: reason,
  };
}

/**
 * Least-squares fit of a cubic `p(t) = c0 + c1 t + c2 t^2 + c3 t^3` by
 * normal equations, solved with Gaussian elimination and partial pivoting.
 * Fixed size, fixed pivot order, no iteration — the same inputs always walk
 * the same arithmetic path.
 */
function fitCubic(ts: number[], ps: number[]): [number, number, number, number] | null {
  const n = ts.length;
  if (n < 4) return null;

  // Normal matrix of the 4-term polynomial basis: A[i][j] = sum(t^(i+j)).
  const a: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const b = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    const t = ts[k]!;
    const p = ps[k]!;
    const basis = [1, t, t * t, t * t * t];
    for (let i = 0; i < 4; i++) {
      b[i]! += basis[i]! * p;
      for (let j = 0; j < 4; j++) a[i]![j]! += basis[i]! * basis[j]!;
    }
  }

  // Augmented Gaussian elimination with partial pivoting.
  const m: number[][] = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const swap = m[col]!;
      m[col] = m[pivot]!;
      m[pivot] = swap;
    }
    const diag = m[col]![col]!;
    for (let row = col + 1; row < 4; row++) {
      const factor = m[row]![col]! / diag;
      if (factor === 0) continue;
      for (let c = col; c < 5; c++) m[row]![c]! -= factor * m[col]![c]!;
    }
  }

  const coeffs = [0, 0, 0, 0];
  for (let row = 3; row >= 0; row--) {
    let sum = m[row]![4]!;
    for (let c = row + 1; c < 4; c++) sum -= m[row]![c]! * coeffs[c]!;
    coeffs[row] = sum / m[row]![row]!;
  }
  return [coeffs[0]!, coeffs[1]!, coeffs[2]!, coeffs[3]!];
}

function evalCubic(c: [number, number, number, number], t: number): number {
  return c[0] + c[1] * t + c[2] * t * t + c[3] * t * t * t;
}

function evalCubicDerivative(c: [number, number, number, number], t: number): number {
  return c[1] + 2 * c[2] * t + 3 * c[3] * t * t;
}

type EdgeSample = {
  /** The mask pixel row this edge point came from. */
  row: number;
  /** Posterior offset of the back edge in pixels — larger means further back. */
  p: number;
  /** 0-1 crispness of the mask transition at this row. */
  sharpness: number;
};

/** One half of the band, measured on its own. `angle` is null when the half could not be fitted at all. */
type SegmentFit = {
  angle: number | null;
  confidence: number;
  rowsRequested: number;
  rowsUsable: number;
  rowsRejectedAsOutliers: number;
  /** RMS distance in pixels from this half's edge points to its own fitted curve. */
  rmsPx: number;
  /** Mean 0-1 crispness of this half's edge. */
  sharpness: number;
};

/**
 * Reads one pixel row of the mask from the back side inward and returns the
 * sub-pixel position where the mask crosses BODY_THRESHOLD, or null when
 * that row has no trustworthy body edge.
 */
function scanRow(
  mask: SegmentationMask,
  row: number,
  posteriorSign: -1 | 1,
  scale: number,
  sharpnessReferencePx: number
): { column: number; sharpness: number } | null {
  const { width } = mask;
  const rowOffset = row * width;
  // Scan index s walks inward from the back side; col() maps it back to a
  // real column so the rest of the function never re-derives the direction.
  const col = (s: number): number => (posteriorSign < 0 ? s : width - 1 - s);
  const valueAt = (s: number): number => (mask.data[rowOffset + col(s)] ?? 0) * scale;

  let crossing = -1;
  for (let s = 0; s < width; s++) {
    if (valueAt(s) < BODY_THRESHOLD) continue;
    // Confirm the edge is the body and not a speck: the next few pixels
    // inward must stay body-side too.
    let confirmed = true;
    for (let k = 1; k <= EDGE_RUN_PX; k++) {
      if (s + k >= width) break;
      if (valueAt(s + k) < EDGE_RUN_THRESHOLD) {
        confirmed = false;
        break;
      }
    }
    if (confirmed) {
      crossing = s;
      break;
    }
  }
  if (crossing < 0) return null;
  // An edge flush against the frame border means the body is cut off here.
  if (crossing === 0) return null;

  const outside = valueAt(crossing - 1);
  const inside = valueAt(crossing);
  const span = inside - outside;
  const frac = span > 1e-9 ? clamp01((BODY_THRESHOLD - outside) / span) : 0;
  const edgeScanPos = crossing - 1 + frac;

  // Crispness: how many pixels the mask takes to travel from clearly-
  // background (0.2) to clearly-body (0.8). A hard edge does it in about
  // one pixel; a soft, low-contrast edge smears it over many.
  const window = Math.max(4, Math.ceil(sharpnessReferencePx * 3));
  let lowIndex = -1;
  for (let s = crossing; s >= Math.max(0, crossing - window); s--) {
    if (valueAt(s) <= 0.2) {
      lowIndex = s;
      break;
    }
  }
  let highIndex = -1;
  for (let s = crossing; s <= Math.min(width - 1, crossing + window); s++) {
    if (valueAt(s) >= 0.8) {
      highIndex = s;
      break;
    }
  }
  const transitionPx = lowIndex >= 0 && highIndex >= 0 ? highIndex - lowIndex : window;
  const sharpness = clamp01(1 - Math.max(0, transitionPx - 1) / sharpnessReferencePx);

  return { column: posteriorSign < 0 ? edgeScanPos : width - 1 - edgeScanPos, sharpness };
}

/**
 * Measures the upper-back and lower-back angles from one side-view
 * segmentation mask. Pure: same mask plus same anchors always produces the
 * same numbers.
 */
export function measureSpinalCurve(
  mask: SegmentationMask,
  anchors: SpinalCurveAnchors
): SpinalCurveMeasurement {
  const { width, height } = mask;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 8 || height < 8) {
    return emptyResult('The segmentation mask was too small to read a body outline from.', null);
  }
  if (mask.data.length < width * height) {
    return emptyResult('The segmentation mask was incomplete.', null);
  }

  // Float32 masks are already [0,1]; byte masks are 0-255.
  const scale = mask.data instanceof Float32Array ? 1 : 1 / 255;

  const bodyCentreX = ((anchors.shoulder.x + anchors.hip.x) / 2) * width;
  const facePointX = anchors.facePoint.x * width;
  if (Math.abs(facePointX - bodyCentreX) < MIN_FACING_SEPARATION_FRACTION * width) {
    return emptyResult(
      'Could not tell which way the body was facing, so the back edge of the outline could not be identified.',
      null
    );
  }
  const posteriorSign: -1 | 1 = facePointX > bodyCentreX ? -1 : 1;
  const backSide: 'left' | 'right' = posteriorSign < 0 ? 'left' : 'right';

  const shoulderRow = Math.round(anchors.shoulder.y * height);
  const hipRow = Math.round(anchors.hip.y * height);
  const bandTop = shoulderRow;
  const bandBottom = Math.round(shoulderRow + PELVIS_BAND_FRACTION * (hipRow - shoulderRow));
  const bandHeightPx = bandBottom - bandTop;

  if (bandHeightPx < MIN_BAND_ROWS || bandTop < 0 || bandBottom >= height) {
    return emptyResult(
      'The shoulder-to-hip section of the body was too short or fell outside the frame to measure a curve across.',
      null
    );
  }

  const sharpnessReferencePx = Math.max(2, 0.02 * bandHeightPx);
  const roughnessReferencePx = Math.max(2, 0.03 * bandHeightPx);

  const samples: EdgeSample[] = [];
  const rowsRequested = bandHeightPx + 1;
  for (let row = bandTop; row <= bandBottom; row++) {
    const found = scanRow(mask, row, posteriorSign, scale, sharpnessReferencePx);
    if (!found) continue;
    samples.push({
      row,
      p: posteriorSign * found.column,
      sharpness: found.sharpness,
    });
  }

  /**
   * Measures one half of the band on its own terms: its own cubic fit, its
   * own outlier pass, its own quality numbers. `u` runs 0 to 1 across just
   * this half, so the returned angle is the total turn of the back surface
   * from one end of the half to the other. The two halves partition the
   * band's pixel rows exactly — no row belongs to both.
   */
  const measureSegment = (
    rowLow: number,
    rowHigh: number,
    /** Which end of the half the angle is measured FROM. The upper half reads top-to-bottom, the lower half bottom-to-top, so a rounded back and a hollow back both come out positive. */
    direction: 'top_first' | 'bottom_first'
  ): SegmentFit => {
    const rowsRequestedHere = Math.max(1, rowHigh - rowLow + 1);
    const segmentHeightPx = Math.max(1, rowHigh - rowLow);
    const inSegment = samples.filter((s) => s.row >= rowLow && s.row <= rowHigh);
    const empty: SegmentFit = {
      angle: null,
      confidence: 0,
      rowsRequested: rowsRequestedHere,
      rowsUsable: inSegment.length,
      rowsRejectedAsOutliers: 0,
      rmsPx: 0,
      sharpness: 0,
    };
    if (inSegment.length < MIN_USABLE_ROWS) return empty;

    const us = inSegment.map((s) => (s.row - rowLow) / segmentHeightPx);
    const ps = inSegment.map((s) => s.p);
    const firstFit = fitCubic(us, ps);
    if (!firstFit) return empty;

    // One outlier pass, then one refit. Never a loop.
    let sumSq = 0;
    for (let i = 0; i < us.length; i++) {
      const r = ps[i]! - evalCubic(firstFit, us[i]!);
      sumSq += r * r;
    }
    const firstRms = Math.sqrt(sumSq / us.length);
    const keptIndices: number[] = [];
    for (let i = 0; i < us.length; i++) {
      if (firstRms <= 1e-9 || Math.abs(ps[i]! - evalCubic(firstFit, us[i]!)) <= 3 * firstRms) {
        keptIndices.push(i);
      }
    }
    const rowsRejectedAsOutliers = us.length - keptIndices.length;
    if (keptIndices.length < MIN_USABLE_ROWS) {
      return { ...empty, rowsUsable: keptIndices.length, rowsRejectedAsOutliers, rmsPx: firstRms };
    }

    const fit = fitCubic(
      keptIndices.map((i) => us[i]!),
      keptIndices.map((i) => ps[i]!)
    );
    if (!fit) return { ...empty, rowsUsable: keptIndices.length, rowsRejectedAsOutliers };

    let residualSq = 0;
    let sharpnessSum = 0;
    for (const i of keptIndices) {
      const r = ps[i]! - evalCubic(fit, us[i]!);
      residualSq += r * r;
      sharpnessSum += inSegment[i]!.sharpness;
    }
    const rms = Math.sqrt(residualSq / keptIndices.length);
    const sharpness = clamp01(sharpnessSum / keptIndices.length);

    // dp/du is per-half-length, so divide by the half's own pixel height to
    // get the true per-pixel slope before taking the angle.
    const inclinationAt = (u: number): number =>
      (Math.atan(evalCubicDerivative(fit, u) / segmentHeightPx) * 180) / Math.PI;
    const angle =
      direction === 'top_first'
        ? inclinationAt(0) - inclinationAt(1)
        : inclinationAt(1) - inclinationAt(0);

    // Confidence is the weakest of the three signals, never their average —
    // same reasoning as postureMeasurements.ts's confidenceFrom: one strong
    // signal must not mask a weak one.
    const coverage = clamp01(keptIndices.length / rowsRequestedHere);
    const smoothness = clamp01(1 - rms / roughnessReferencePx);
    return {
      angle: round1(angle),
      confidence: round3(Math.min(coverage, sharpness, smoothness)),
      rowsRequested: rowsRequestedHere,
      rowsUsable: keptIndices.length,
      rowsRejectedAsOutliers,
      rmsPx: rms,
      sharpness,
    };
  };

  const splitRow = bandTop + Math.round(THORACOLUMBAR_SPLIT * bandHeightPx);
  const thoracic = measureSegment(bandTop, splitRow, 'top_first');
  const lumbar = measureSegment(splitRow + 1, bandBottom, 'bottom_first');

  const rowsUsable = thoracic.rowsUsable + lumbar.rowsUsable;
  const weight = Math.max(1, rowsUsable);
  const quality: SpinalCurveMaskQuality = {
    backSide,
    bandHeightPx,
    rowsRequested,
    rowsUsable,
    rowCoverage: round3(rowsUsable / rowsRequested),
    edgeSharpness: round3(
      (thoracic.sharpness * thoracic.rowsUsable + lumbar.sharpness * lumbar.rowsUsable) / weight
    ),
    edgeRoughnessPx: round3(
      (thoracic.rmsPx * thoracic.rowsUsable + lumbar.rmsPx * lumbar.rowsUsable) / weight
    ),
    rowsRejectedAsOutliers: thoracic.rowsRejectedAsOutliers + lumbar.rowsRejectedAsOutliers,
  };

  if (samples.length < MIN_USABLE_ROWS) {
    return emptyResult(
      'Too little of the back outline could be traced to fit a curve through.',
      quality
    );
  }

  const thoracicConfidence = thoracic.confidence;
  const lumbarConfidence = lumbar.confidence;
  const thoracicAngle = thoracic.angle;
  const lumbarAngle = lumbar.angle;
  const thoracicOk = thoracicAngle !== null && thoracicConfidence >= MIN_CONFIDENCE_TO_MEASURE;
  const lumbarOk = lumbarAngle !== null && lumbarConfidence >= MIN_CONFIDENCE_TO_MEASURE;

  let rejectionReason: string | null = null;
  if (!thoracicOk && !lumbarOk) {
    rejectionReason =
      'The outline of the back was not clear enough to measure either curve. Loose clothing, low contrast with the background, or a broken outline will do this.';
  } else if (!thoracicOk) {
    rejectionReason = 'The outline of the upper back was not clear enough to measure.';
  } else if (!lumbarOk) {
    rejectionReason = 'The outline of the lower back was not clear enough to measure.';
  }

  return {
    thoracicAngleDegrees: thoracicOk ? thoracicAngle : null,
    thoracicConfidence,
    lumbarAngleDegrees: lumbarOk ? lumbarAngle : null,
    lumbarConfidence,
    maskQuality: quality,
    methodVersion: SPINAL_CURVE_METHOD_VERSION,
    rejectionReason,
  };
}

/** The only capture views a back-edge silhouette measurement is meaningful on. A front, back, or movement capture stores nothing new. */
export function isSpinalCurveView(captureType: string, mediaType: string): boolean {
  return mediaType === 'image' && (captureType === 'left_side' || captureType === 'right_side');
}

type AnchorLandmark = { x: number; y: number; visibility?: number };

/**
 * Picks the three anchor points from a validated frame's landmarks, or
 * returns null when any of them is not confidently visible. Side-of-body is
 * chosen by visibility with a fixed left-wins tie-break, so the same frame
 * always yields the same anchors.
 */
export function spinalCurveAnchorsFromLandmarks(core: {
  nose: AnchorLandmark;
  leftShoulder: AnchorLandmark;
  rightShoulder: AnchorLandmark;
  leftHip: AnchorLandmark;
  rightHip: AnchorLandmark;
}): SpinalCurveAnchors | null {
  const vis = (l: AnchorLandmark): number => l.visibility ?? 1;
  const shoulder = vis(core.leftShoulder) >= vis(core.rightShoulder) ? core.leftShoulder : core.rightShoulder;
  const hip = vis(core.leftHip) >= vis(core.rightHip) ? core.leftHip : core.rightHip;
  const facePoint = core.nose;

  if (
    vis(shoulder) < MIN_ANCHOR_VISIBILITY ||
    vis(hip) < MIN_ANCHOR_VISIBILITY ||
    vis(facePoint) < MIN_ANCHOR_VISIBILITY
  ) {
    return null;
  }

  return {
    shoulder: { x: shoulder.x, y: shoulder.y },
    hip: { x: hip.x, y: hip.y },
    facePoint: { x: facePoint.x, y: facePoint.y },
  };
}
