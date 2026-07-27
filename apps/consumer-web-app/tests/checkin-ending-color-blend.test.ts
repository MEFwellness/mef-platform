/**
 * UX audit (docs/UX_AUDIT_DAILY_LOOP.md) found the check-in ending screen
 * ("Today, in one color") rendering as nearly the same pale, low-saturation
 * tone for two different accounts with different real answers. Traced to
 * `blendValues`' plain per-channel RGB average in the old EndingMoment.tsx:
 * averaging colors drawn from different hue families (mood's green->gold,
 * energy's pale->forest, stress's sage->clay) pulls the result toward a
 * similar muddy middle for most real answer combinations, regardless of how
 * different the underlying answers were.
 *
 * `blendEndingColors` (lib/checkin-color-ramps.ts) replaces that with an
 * HSL-space blend plus a bounded saturation lift. These are real unit
 * tests of that pure function — no rendering harness needed, and none of
 * the RAMP constants themselves (shared with the live scale UI) are
 * touched by this change or exercised for their own sake here.
 */
import { describe, it, expect } from 'vitest';
import {
  blendEndingColors,
  rgbToHsl,
  hslToRgb,
  MOOD_RAMP,
  ENERGY_RAMP,
  STRESS_RAMP,
  RECOVERY_RAMP,
  type RGB,
} from '../lib/checkin-color-ramps';

function distance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

describe('blendEndingColors', () => {
  it('returns null when there is nothing to blend (no real answers yet)', () => {
    expect(blendEndingColors([])).toBeNull();
  });

  it('returns a valid RGB triple (each channel 0-255, no NaN) for a real morning answer set', () => {
    const result = blendEndingColors([
      { ramp: MOOD_RAMP, value: 4, max: 5 },
      { ramp: ENERGY_RAMP, value: 3, max: 5 },
      { ramp: STRESS_RAMP, value: 2, max: 5 },
    ]);
    expect(result).not.toBeNull();
    for (const channel of result!) {
      expect(Number.isNaN(channel)).toBe(false);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it("a single value blends to something close to that value's own lerped color (sanity check, not just 3-way blends)", () => {
    const result = blendEndingColors([{ ramp: MOOD_RAMP, value: 5, max: 5 }]);
    // value 5 of 5 is MOOD_RAMP's own "to" endpoint (gold-ish) -- the
    // saturation lift changes it a little, but hue should land close to
    // the source color's hue, not somewhere unrelated.
    const [h] = rgbToHsl(result!);
    const [expectedHue] = rgbToHsl(MOOD_RAMP.to as unknown as RGB);
    expect(Math.abs(h - expectedHue)).toBeLessThan(15);
  });

  it('two genuinely contrasting real morning answer sets produce visibly different colors', () => {
    // "great morning": high mood, high energy, calm (low) stress.
    const great = blendEndingColors([
      { ramp: MOOD_RAMP, value: 5, max: 5 },
      { ramp: ENERGY_RAMP, value: 5, max: 5 },
      { ramp: STRESS_RAMP, value: 1, max: 5 },
    ])!;
    // "rough morning": low mood, low energy, overwhelmed (high) stress.
    const rough = blendEndingColors([
      { ramp: MOOD_RAMP, value: 1, max: 5 },
      { ramp: ENERGY_RAMP, value: 1, max: 5 },
      { ramp: STRESS_RAMP, value: 5, max: 5 },
    ])!;

    // The old plain-RGB-average implementation put these ~30 units apart
    // per channel (~52 total Euclidean distance) -- barely perceptible,
    // especially rendered through a mostly-transparent gradient. Requiring
    // comfortably more than that confirms this is a real fix, not a
    // rounding-error-sized nudge.
    expect(distance(great, rough)).toBeGreaterThan(90);
  });

  it('two contrasting real evening answer sets (day rating / stress / recovery) also produce visibly different colors', () => {
    const great = blendEndingColors([
      { ramp: MOOD_RAMP, value: 5, max: 5 },
      { ramp: STRESS_RAMP, value: 1, max: 5 },
      { ramp: RECOVERY_RAMP, value: 5, max: 5 },
    ])!;
    const rough = blendEndingColors([
      { ramp: MOOD_RAMP, value: 1, max: 5 },
      { ramp: STRESS_RAMP, value: 5, max: 5 },
      { ramp: RECOVERY_RAMP, value: 1, max: 5 },
    ])!;
    expect(distance(great, rough)).toBeGreaterThan(90);
  });

  it('a middling, ambiguous day sits between the two contrasting extremes above (no good/bad axis baked in)', () => {
    // The constraint is "different hues, not better/worse hues" -- this
    // doesn't assert the middling color is "between" on any judged scale,
    // only that it's a real third point, distinct from both extremes,
    // confirming the blend responds continuously to input rather than
    // snapping toward one of two poles.
    const great = blendEndingColors([
      { ramp: MOOD_RAMP, value: 5, max: 5 },
      { ramp: ENERGY_RAMP, value: 5, max: 5 },
      { ramp: STRESS_RAMP, value: 1, max: 5 },
    ])!;
    const rough = blendEndingColors([
      { ramp: MOOD_RAMP, value: 1, max: 5 },
      { ramp: ENERGY_RAMP, value: 1, max: 5 },
      { ramp: STRESS_RAMP, value: 5, max: 5 },
    ])!;
    const middling = blendEndingColors([
      { ramp: MOOD_RAMP, value: 3, max: 5 },
      { ramp: ENERGY_RAMP, value: 3, max: 5 },
      { ramp: STRESS_RAMP, value: 3, max: 5 },
    ])!;
    expect(distance(middling, great)).toBeGreaterThan(20);
    expect(distance(middling, rough)).toBeGreaterThan(20);
  });
});

describe('rgbToHsl / hslToRgb round-trip', () => {
  it('converting to HSL and back returns (approximately) the original color', () => {
    const samples: RGB[] = [
      [196, 160, 80],
      [27, 58, 45],
      [124, 84, 67],
      [255, 255, 255],
      [0, 0, 0],
      [128, 128, 128],
    ];
    for (const rgb of samples) {
      const [r, g, b] = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(r - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(g - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(b - rgb[2])).toBeLessThanOrEqual(1);
    }
  });
});
