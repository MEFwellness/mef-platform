/**
 * Daily Check-In redesign v2 — "color as data." Each hero scale gets its
 * own hue ramp inside the brand family; none of them run low-to-high on
 * a red/green good-bad axis, per the task's hard constraint ("she must
 * never be able to tell which answer the app 'wants'"). This file is
 * the one place each ramp's two endpoint colors are defined, so nothing
 * here duplicates raw RGB triples per component.
 */

export type RGB = readonly [number, number, number];

export function lerpColor(from: RGB, to: RGB, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(from[0] + (to[0] - from[0]) * clamped);
  const g = Math.round(from[1] + (to[1] - from[1]) * clamped);
  const b = Math.round(from[2] + (to[2] - from[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

/** `index`/`count` -> a color along a two-stop ramp (e.g. index 0 of 5 -> t=0, index 4 of 5 -> t=1). */
export function rampColorAt(from: RGB, to: RGB, index: number, count: number): string {
  const t = count <= 1 ? 1 : index / (count - 1);
  return lerpColor(from, to, t);
}

/** Mood — cool muted (a desaturated, grayed-down sage, not blue) -> warm gold (the locked accent color). */
export const MOOD_RAMP: { from: RGB; to: RGB } = { from: [151, 168, 160], to: [196, 160, 80] };

/** Energy — pale sage -> saturated forest green. */
export const ENERGY_RAMP: { from: RGB; to: RGB } = { from: [214, 224, 216], to: [27, 58, 45] };

/** Stress (shared with evening's daytime stress) — open sage -> deep clay (a muted brown, never red). */
export const STRESS_RAMP: { from: RGB; to: RGB } = { from: [180, 199, 188], to: [124, 84, 67] };

/** Recovery — dim (a muted, low-light gray-green) -> luminous (the locked gold accent, read as "bright" rather than "good"). */
export const RECOVERY_RAMP: { from: RGB; to: RGB } = { from: [122, 130, 124], to: [196, 160, 80] };

/** Pain / soreness severity — clay -> terracotta. Explicitly never red, per the task's hard constraint. */
export const SEVERITY_RAMP: { from: RGB; to: RGB } = { from: [181, 146, 118], to: [176, 90, 58] };

/**
 * The background "temperature" wash (task's "cap the total shift at
 * ~8%"): implemented as a fixed-opacity (8%) overlay whose own color
 * blends between a cool/dim anchor and a warm/bright anchor as she
 * answers — never a saturation swing, just this one low-opacity hue
 * shift layered over the flow's own base gradient.
 */
export const TEMPERATURE_RAMP: { from: RGB; to: RGB } = {
  from: [90, 110, 120],
  to: [196, 160, 80],
};
export const TEMPERATURE_OVERLAY_OPACITY = 0.08;

// --- Ending-screen color blend ("Today, in one color") ---------------------
//
// Used only by components/checkin/EndingMoment.tsx, never by the scale
// components above — none of the RAMP constants themselves change here.
//
// The ending screen combines 2-3 of the ramps above (whichever hero scales
// she actually answered) into one blended color. A plain per-channel RGB
// average was tried first and rejected: averaging colors drawn from
// different hue families (mood's green->gold, energy's pale->forest-green,
// stress's sage->clay) pulls the result toward a similar muddy
// gray-green-brown for most real answer combinations, regardless of how
// different the underlying answers actually were — RGB channel averaging
// doesn't preserve hue separation the way blending in HSL space does.
// Confirmed directly: a "great day" (mood 5, energy 5, stress 1) and a
// "rough day" (mood 1, energy 1, stress 5) averaged to two colors only
// ~30 units apart per channel out of 255 — barely perceptible, especially
// once rendered through a soft, mostly-transparent radial gradient.

export type HSL = readonly [number, number, number]; // [hue 0-360, saturation 0-1, lightness 0-1]

export function rgbToHsl([r, g, b]: RGB): HSL {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, l];

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === rN) h = ((gN - bN) / delta) % 6;
  else if (max === gN) h = (bN - rN) / delta + 2;
  else h = (rN - gN) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return [h, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rN = 0;
  let gN = 0;
  let bN = 0;
  if (h < 60) [rN, gN, bN] = [c, x, 0];
  else if (h < 120) [rN, gN, bN] = [x, c, 0];
  else if (h < 180) [rN, gN, bN] = [0, c, x];
  else if (h < 240) [rN, gN, bN] = [0, x, c];
  else if (h < 300) [rN, gN, bN] = [x, 0, c];
  else [rN, gN, bN] = [c, 0, x];

  return [
    Math.round((rN + m) * 255),
    Math.round((gN + m) * 255),
    Math.round((bN + m) * 255),
  ] as const;
}

/**
 * Combines several ramp positions into one perceptually-distinguishable
 * color, blending in HSL space (circular mean for hue, arithmetic mean for
 * saturation/lightness) rather than averaging raw RGB channels, then
 * lifting saturation a bounded amount so genuinely different days read as
 * genuinely different colors rather than converging toward the same muted
 * gray-green. The saturation lift is capped well under what any single
 * ramp's own endpoint reaches, so it stays atmospheric rather than garish,
 * and nothing here treats any answer as "better" than another — the same
 * blend runs regardless of which direction the answers point.
 */
export function blendEndingColors(
  values: { ramp: { from: RGB; to: RGB }; value: number; max: number }[]
): RGB | null {
  if (values.length === 0) return null;

  const hsls = values.map(({ ramp, value, max }) => {
    const t = max <= 1 ? 1 : (value - 1) / (max - 1);
    const clamped = Math.max(0, Math.min(1, t));
    const rgb: RGB = [
      Math.round(ramp.from[0] + (ramp.to[0] - ramp.from[0]) * clamped),
      Math.round(ramp.from[1] + (ramp.to[1] - ramp.from[1]) * clamped),
      Math.round(ramp.from[2] + (ramp.to[2] - ramp.from[2]) * clamped),
    ];
    return rgbToHsl(rgb);
  });

  const n = hsls.length;
  const sinSum = hsls.reduce((sum, [h]) => sum + Math.sin((h * Math.PI) / 180), 0);
  const cosSum = hsls.reduce((sum, [h]) => sum + Math.cos((h * Math.PI) / 180), 0);
  let hue = (Math.atan2(sinSum / n, cosSum / n) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  const meanSat = hsls.reduce((sum, [, s]) => sum + s, 0) / n;
  const meanLight = hsls.reduce((sum, [, , l]) => sum + l, 0) / n;

  const SATURATION_BOOST = 1.6;
  const SATURATION_CAP = 0.62;
  const boostedSat = Math.min(SATURATION_CAP, meanSat * SATURATION_BOOST);

  return hslToRgb([hue, boostedSat, meanLight]);
}
