/**
 * Frame-quality gating (blur + lighting) — the two capture-quality signals
 * poseValidation.ts intentionally does NOT cover, since it only reasons
 * about landmark geometry, not pixel data. Kept as a separate module for
 * the same reason cameraTilt.ts is separate: this is a completely
 * different kind of signal (raw pixels, not landmarks) with its own
 * sampling cadence, and every threshold here is pure/testable without a
 * real camera or canvas — CameraCapture.tsx owns sampling a small canvas
 * from the live video on an interval and handing the pixel buffer here.
 *
 * Sharpness is a classic "variance of Laplacian" edge-energy estimate:
 * a blurry frame has weak edges everywhere, so the second-derivative
 * response stays low and uniform (low variance); a sharp frame has strong,
 * varied edge responses. Deliberately computed on a small (~64px-wide)
 * downsampled sample — CameraCapture never runs this on a full-resolution
 * frame, both for performance (getImageData on a large canvas is
 * expensive to do every few hundred ms) and because at small size, real
 * motion/focus blur washes out edges enough to be detectable while normal
 * skin/clothing micro-texture doesn't dominate the signal.
 *
 * Every threshold below is a UX screening bound chosen to reject only
 * clearly-bad frames (won't nag over normal indoor lighting or a slightly
 * soft frame) — like poseValidation.ts's thresholds, these are NOT
 * derived from any imaging/clinical standard and will need field
 * calibration against real devices once this ships.
 */

export type GrayscaleFrameSample = {
  /** RGBA bytes, e.g. from CanvasRenderingContext2D#getImageData — only R/G/B are read. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type FrameQualityStats = {
  /** Relative edge-energy variance of a downsampled grayscale sample — higher means sharper. Not a normalized 0-1 score; compare only against MIN_SHARPNESS_SCORE below. */
  sharpnessScore: number;
  /** Mean luminance, 0-255. */
  meanLuminance: number;
};

export function computeFrameQualityStats(sample: GrayscaleFrameSample): FrameQualityStats {
  const { data, width, height } = sample;
  if (width < 3 || height < 3 || data.length < width * height * 4) {
    return { sharpnessScore: 0, meanLuminance: 0 };
  }

  const gray = new Float32Array(width * height);
  let lumSum = 0;
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    const g = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = g;
    lumSum += g;
  }
  const meanLuminance = lumSum / gray.length;

  // Discrete Laplacian (4*center - 4-neighborhood) at every interior pixel,
  // then the variance of that response across the sample.
  let lapSum = 0;
  let lapSumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = 4 * gray[idx]! - gray[idx - 1]! - gray[idx + 1]! - gray[idx - width]! - gray[idx + width]!;
      lapSum += lap;
      lapSumSq += lap * lap;
      count += 1;
    }
  }
  const lapMean = count > 0 ? lapSum / count : 0;
  const sharpnessScore = count > 0 ? lapSumSq / count - lapMean * lapMean : 0;

  return { sharpnessScore, meanLuminance };
}

export type FrameQualityStatus = 'ready' | 'blurry_frame' | 'poor_lighting';

export type FrameQualityResult = {
  status: FrameQualityStatus;
  ok: boolean;
  message: string;
};

/**
 * Below this Laplacian-variance score on a ~64px-wide downsampled sample,
 * the frame reads as meaningfully blurred (camera shake or out of focus)
 * rather than just naturally soft. Deliberately set very conservatively
 * (far below what a synthetic sharp-edge test fixture produces) — this
 * number was never validated against real, bilinear-downsampled camera
 * video, only hand-built test fixtures (tests/frame-quality.test.ts), and
 * a false trigger here silently blocks the "locked" state auto-capture
 * depends on with no visible explanation beyond a generic message. Until
 * real-device numbers are gathered (this file logs every sample's raw
 * stats in development — see CameraCapture.tsx), err toward under- rather
 * than over-rejecting.
 */
const MIN_SHARPNESS_SCORE = 2;
/** Below this mean luminance (0-255), the room is too dark for the pose model or a member to reliably self-check posture. Loosened for the same reason as MIN_SHARPNESS_SCORE — not yet validated against real camera output. */
const MIN_MEAN_LUMINANCE = 18;
/** Above this, the frame is blown out (backlighting, direct sun) — checked before sharpness, since an overexposed frame also reads as artificially "smooth" and would otherwise be misreported as blur. */
const MAX_MEAN_LUMINANCE = 250;

export function evaluateFrameQuality(stats: FrameQualityStats): FrameQualityResult {
  if (stats.meanLuminance < MIN_MEAN_LUMINANCE) {
    return { status: 'poor_lighting', ok: false, message: 'The image is too dark. Move to a brighter area.' };
  }
  if (stats.meanLuminance > MAX_MEAN_LUMINANCE) {
    return { status: 'poor_lighting', ok: false, message: 'The image is too bright. Reduce the light behind you.' };
  }
  if (stats.sharpnessScore < MIN_SHARPNESS_SCORE) {
    return { status: 'blurry_frame', ok: false, message: 'The image is blurry. Hold the phone steady.' };
  }
  return { status: 'ready', ok: true, message: '' };
}
