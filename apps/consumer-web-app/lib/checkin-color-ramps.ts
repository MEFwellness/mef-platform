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
export const TEMPERATURE_RAMP: { from: RGB; to: RGB } = { from: [90, 110, 120], to: [196, 160, 80] };
export const TEMPERATURE_OVERLAY_OPACITY = 0.08;
