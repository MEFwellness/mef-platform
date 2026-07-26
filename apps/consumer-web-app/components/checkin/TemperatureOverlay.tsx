'use client';

/**
 * "As she answers, the screen background shifts temperature to match —
 * cooler and dimmer for depleted answers, warmer and brighter for
 * restored ones. Cap the total shift at ~8%." Implemented as a
 * fixed-opacity (8%) tint layered over the flow's own base gradient
 * (set separately, per flow, in page.tsx) — only its hue moves as
 * `warmth` changes, never its intensity, so it stays atmospheric.
 */

import { lerpColor } from '@/lib/checkin-color-ramps';
import { TEMPERATURE_RAMP, TEMPERATURE_OVERLAY_OPACITY } from '@/lib/checkin-color-ramps';

/** 0 = fully depleted (cool/dim), 1 = fully restored (warm/bright), 0.5 = neutral (no answers yet). */
export function TemperatureOverlay({ warmth }: { warmth: number }) {
  const color = lerpColor(TEMPERATURE_RAMP.from, TEMPERATURE_RAMP.to, warmth);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 transition-colors duration-700 ease-out"
      style={{ backgroundColor: color, opacity: TEMPERATURE_OVERLAY_OPACITY }}
    />
  );
}

/** Averages whichever of mood/energy/stress/recovery have real answers so far, inverting stress (high stress = depleted, not restored) — unanswered scales default to neutral (0.5) rather than skewing the blend before she's said anything. */
export function computeWarmth(values: {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  recovery?: number | null;
}): number {
  const normalize = (v: number | null) => (v === null ? 0.5 : (v - 1) / 4);
  const mood = normalize(values.mood);
  const energy = normalize(values.energy);
  const stress = values.stress === null ? 0.5 : 1 - normalize(values.stress);
  const recovery = values.recovery === undefined ? null : normalize(values.recovery);
  const parts = recovery === null ? [mood, energy, stress] : [mood, energy, stress, recovery];
  return parts.reduce((sum, v) => sum + v, 0) / parts.length;
}
