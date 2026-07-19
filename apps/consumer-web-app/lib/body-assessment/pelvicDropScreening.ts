/**
 * Pelvic-drop screening estimate for the guided single-leg stance
 * (single_leg_balance assessment's movement step) — the same clinical-
 * boundary rules as postureMeasurements.ts apply: this reports a
 * "pelvic-drop screening indicator," never a Trendelenburg diagnosis,
 * which requires clinical examination this app cannot perform.
 *
 * SCOPE NOTE (documented rather than silently simplified): the product
 * spec for this feature describes a fully guided multi-phase trial —
 * confirm which leg is the stance leg, confirm the other foot is lifted,
 * reject the trial live if the member uses a wall/steps down/rotates
 * excessively/leaves the frame, all while giving real-time voice
 * feedback. What's implemented here is lighter-weight: passive analysis
 * of the hip-line angle across the EXISTING single-leg-balance video
 * recording (CameraCapture.tsx already runs pose detection during
 * recording for this one step), producing a confidence score that
 * degrades when the samples show low visibility (the member likely left
 * the frame or was occluded) or erratic jumps (likely instability,
 * stepping down, or rotation) — but there is no live blocking gate, no
 * forced retry, and no specific detection of "used a wall" (not
 * reliably inferable from pose landmarks alone; a hand near a vertical
 * surface looks identical to a hand at the member's side from a 2D pose
 * model with no scene/depth understanding of the environment).
 */

export type PelvicDropSample = {
  /** Signed hip-line angle from horizontal (poseMetrics.ts's hipLineAngle), degrees. */
  hipLineAngle: number;
  /** Landmark-visibility-derived confidence for this sample, 0-1. */
  confidence: number;
  timestampMs: number;
};

export type PelvicDropEstimate = {
  /** Degrees of hip-line angle change from the baseline (first ~1s of samples) to the largest deviation observed. */
  maxDeviationDegrees: number;
  /** 0-1 — degrades with low per-sample confidence and with erratic (high-variance) samples, both of which point at instability, occlusion, or the member leaving the frame rather than a clean, held single-leg stance. */
  confidence: number;
  narrative: string;
  sampleCount: number;
};

const BASELINE_WINDOW_MS = 1000;
/** A sample-to-sample jump larger than this (degrees) is treated as instability/rotation noise for confidence purposes — not itself a rejection, since there's no live retry flow, only a lower reported confidence. */
const JUMP_NOISE_THRESHOLD_DEGREES = 8;
/** Screening-only bound, not a clinical cutoff (see docblock) — flags a possible pelvic-drop indicator worth practitioner attention. */
const POSSIBLE_DROP_THRESHOLD_DEGREES = 4;

export function computePelvicDropScreening(samples: PelvicDropSample[]): PelvicDropEstimate | null {
  if (samples.length < 4) return null;

  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  const start = sorted[0]!.timestampMs;
  const baselineSamples = sorted.filter((s) => s.timestampMs - start <= BASELINE_WINDOW_MS);
  if (baselineSamples.length === 0) return null;

  const baselineAngle =
    baselineSamples.reduce((sum, s) => sum + s.hipLineAngle, 0) / baselineSamples.length;

  let maxDeviation = 0;
  let jumpCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const deviation = Math.abs(sorted[i]!.hipLineAngle - baselineAngle);
    if (deviation > maxDeviation) maxDeviation = deviation;
    if (
      i > 0 &&
      Math.abs(sorted[i]!.hipLineAngle - sorted[i - 1]!.hipLineAngle) > JUMP_NOISE_THRESHOLD_DEGREES
    ) {
      jumpCount += 1;
    }
  }

  const avgLandmarkConfidence = sorted.reduce((sum, s) => sum + s.confidence, 0) / sorted.length;
  const jumpRatio = jumpCount / sorted.length;
  // Confidence degrades with low landmark visibility and with erratic
  // sample-to-sample jumps — both proxies for "this trial wasn't a clean,
  // stable hold," not a claim about the drop measurement's precision.
  const confidence = Math.max(0, Math.min(1, avgLandmarkConfidence * (1 - jumpRatio)));

  const possible = maxDeviation > POSSIBLE_DROP_THRESHOLD_DEGREES;

  return {
    maxDeviationDegrees: Math.round(maxDeviation * 10) / 10,
    confidence,
    sampleCount: sorted.length,
    narrative: possible
      ? `Pelvic-drop screening indicator: estimated ${maxDeviation.toFixed(1)}° contralateral pelvic-line change during the single-leg stance, relative to the initial standing baseline. Not a Trendelenburg diagnosis — requires practitioner review and clinical examination.`
      : `No pelvic-drop screening indicator flagged — estimated pelvic-line change during the single-leg stance stayed within the screening bound (${maxDeviation.toFixed(1)}°).`,
  };
}
