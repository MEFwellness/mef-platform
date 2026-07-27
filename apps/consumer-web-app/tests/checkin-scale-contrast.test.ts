/**
 * Four-fixes pass (2026-07-27), fix 2: "Energy and stress use a pale
 * sage tint that disappears into the beige background." The audit
 * named in the same task also found RecoveryFill (evening) sharing the
 * identical bug. No component-rendering harness exists in this repo
 * (plain 'node' vitest environment) so this is a static scan of the
 * fixed source, proving the SHAPE of the fix (a fixed, always-solid
 * selected-card color per scale, never the per-index interpolated ramp
 * color as a background) rather than literally rendering pixels. The
 * actual visible contrast is verified live via Playwright, reported
 * separately.
 *
 * UX audit pass (2026-07-27, later same day): the "Energy and Stress
 * must be different hue families" constraint below was the ORIGINAL
 * cause of the bug this file's second describe block now guards
 * against — Stress was deliberately given its own clay/rust ramp so it
 * wouldn't collide with Energy's green, and that clay/rust endpoint is
 * exactly what a real UX audit flagged as an unintended green-to-red
 * good/bad axis (see docs/UX_AUDIT_DAILY_LOOP.md item 7). Stress no
 * longer uses STRESS_RAMP at all — see CompressingRings.tsx's own
 * updated header comment. STRESS_RAMP itself is untouched in
 * lib/checkin-color-ramps.ts (still used by the check-in ending
 * screen's color blend, out of scope for that fix), so the old
 * "distinct hue families" test is removed rather than rewritten: the
 * property it asserted no longer describes anything CompressingRings
 * actually renders.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENERGY_RAMP, RECOVERY_RAMP } from '../lib/checkin-color-ramps';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const ENERGY = source('components/checkin/scales/VerticalFillScale.tsx');
const STRESS = source('components/checkin/scales/CompressingRings.tsx');
const RECOVERY = source('components/checkin/scales/RecoveryFill.tsx');

describe.each([
  ['Energy (VerticalFillScale.tsx)', ENERGY, 'ENERGY_SOLID', ENERGY_RAMP],
  ['Recovery (RecoveryFill.tsx)', RECOVERY, 'RECOVERY_SOLID', RECOVERY_RAMP],
] as const)('%s: selected state is a fixed, always-solid card fill', (_label, src, solidConstName, ramp) => {
  it(`defines a ${solidConstName} constant built from the ramp's own saturated ("to") endpoint`, () => {
    expect(src).toContain(`const ${solidConstName} = \`rgb(${'$'}{`);
  });

  it('the selected card background uses that fixed constant, not the per-index interpolated rampColorAt(...) result', () => {
    // The old bug: `backgroundColor: isSelected ? fill : ...` where `fill`
    // was `rampColorAt(...)` -- pale at low indices, unreadable as a card
    // background. The fix must reference the fixed solid constant instead.
    expect(src).toMatch(new RegExp(`backgroundColor:\\s*${solidConstName}`));
  });

  it('still computes a per-index ramp color and uses it as a visible accent (the ramp is not discarded, just no longer the background)', () => {
    expect(src).toContain('rampColorAt(');
    expect(src).toContain('accent');
  });

  it("the ramp's saturated ('to') end used as the solid card fill is not itself near-white (would fail to fix the contrast bug)", () => {
    // White text is rendered on top of this fill when selected -- a
    // near-white background would reintroduce the exact legibility
    // problem this fix exists to close, regardless of which direction
    // this particular ramp runs (Energy/Stress go pale->saturated;
    // Recovery deliberately goes dim->luminous gold, so "darker than
    // its own 'from'" isn't a universal property -- "not near-white" is).
    const [r, g, b] = ramp.to;
    const isNearWhite = r > 200 && g > 200 && b > 200;
    expect(isNearWhite).toBe(false);
  });
});

describe('the selected-state animation is real, not just an instant color swap', () => {
  it('Energy and Recovery bars animate height growth via a mounted-after-select effect, not a static height', () => {
    for (const src of [ENERGY, RECOVERY]) {
      expect(src).toContain('useEffect');
      expect(src).toContain('requestAnimationFrame');
      expect(src).toMatch(/height:\s*grown\s*\?\s*FILL_HEIGHTS\[index\]\s*:\s*'0%'/);
    }
  });

  it('Stress rings reveal progressively (staggered) rather than all at once', () => {
    expect(STRESS).toContain('STAGGER_MS');
    expect(STRESS).toMatch(/setTimeout\(.*i \* STAGGER_MS/s);
  });

  it('Stress lights exactly N rings for level N (a real count, not a fixed-tightness pattern)', () => {
    expect(STRESS).toContain('litCount');
    expect(STRESS).not.toContain('ringRadii'); // the old fixed-3-rings-always function is gone
  });
});

describe('Stress (CompressingRings.tsx): one on-palette hue for every option, magnitude via intensity/ring-density only, never hue (UX audit item 7)', () => {
  const LOCKED_PALETTE = ['#1B3A2D', '#C4A050', '#F5F0E4'];

  it('no longer imports or references STRESS_RAMP/rampColorAt — the two-hue-family ramp is gone, not just hidden', () => {
    expect(STRESS).not.toContain('STRESS_RAMP');
    expect(STRESS).not.toContain('rampColorAt');
  });

  it('defines a single fixed STRESS_SOLID hex constant, not a template built from ramp channels', () => {
    expect(STRESS).toMatch(/const STRESS_SOLID = '#[0-9A-Fa-f]{6}'/);
  });

  it('STRESS_SOLID is one of the three locked brand colors', () => {
    const match = STRESS.match(/const STRESS_SOLID = '(#[0-9A-Fa-f]{6})'/);
    expect(match).not.toBeNull();
    expect(LOCKED_PALETTE).toContain(match![1]!.toUpperCase());
  });

  it('both the selected card fill and the unselected accent dot reference the same STRESS_SOLID constant — no second color anywhere', () => {
    expect(STRESS).toMatch(/backgroundColor:\s*STRESS_SOLID/);
    expect(STRESS).toMatch(/backgroundColor:\s*isSelected \? '#FFFFFF' : STRESS_SOLID/);
  });

  it('magnitude is conveyed by a computed opacity that varies with index, not by a per-index color', () => {
    expect(STRESS).toContain('accentOpacity');
    expect(STRESS).toMatch(/MIN_ACCENT_OPACITY \+ \(index/);
  });
});
