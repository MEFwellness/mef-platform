import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  fillFractionFor,
  colorFor,
  pointOnCircle,
  wedgePath,
  type RingDomain,
} from '../components/root-map/RootMapRing';

const SOURCE = readFileSync(
  path.resolve(__dirname, '../components/root-map/RootMapRing.tsx'),
  'utf-8'
);
// Strips the file's own leading doc comment before scanning for the
// PRESENCE/ABSENCE of an old approach's name — the doc comment explains a
// fix by naming the old behavior it replaced, which would otherwise make a
// naive "not.toMatch" assertion fail on prose rather than real code.
const CODE_ONLY = SOURCE.replace(/\/\*\*[\s\S]*?\*\/\s*/, '');

function domain(overrides: Partial<RingDomain> = {}): RingDomain {
  return {
    domain: 'movement_physical_capacity',
    label: 'Movement & Physical Capacity',
    whatWeUnderstand: [],
    ...overrides,
  };
}

describe('RootMapRing geometry — "12 o\'clock, clockwise" contract', () => {
  // Every segment's wedge hit-target, the visual arc's stroke-dashoffset math,
  // and the number labels all assume this exact orientation. Locking it down
  // directly guards against a regression back to the old CSS `-rotate-90`
  // class (which relied on the browser to rotate everything, including any
  // future label, rather than this file computing positions itself).
  it('places 0deg at 12 o\'clock (straight up from center)', () => {
    const p = pointOnCircle(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('places 90deg at 3 o\'clock (clockwise from 12)', () => {
    const p = pointOnCircle(100, 100, 50, 90);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it('places 180deg at 6 o\'clock', () => {
    const p = pointOnCircle(100, 100, 50, 180);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(150, 5);
  });

  it('places 270deg at 9 o\'clock', () => {
    const p = pointOnCircle(100, 100, 50, 270);
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });
});

describe('RootMapRing wedgePath — the tap-target fix', () => {
  // The reported bug ("tapping a segment scrolls to the bottom of the page")
  // traced to the old hit target being a `fill="none"` circle whose only
  // hit-testable area was a ~19px stroke band — a real fingertip missing
  // that thin band hit nothing, and the tap fell through to native
  // touch-scroll. The fix is a real filled pie-wedge from the ring's
  // *center* outward, so the entire wedge area is tappable, not just a
  // thin ring. Starting at the center is the whole point of the fix.
  it('starts the path at the ring center, not the outer edge', () => {
    const d = wedgePath(100, 100, 50, 0, 90);
    expect(d.startsWith('M 100 100 L')).toBe(true);
  });

  it('produces the exact expected path for a known quarter-wedge', () => {
    const d = wedgePath(100, 100, 50, 0, 90);
    // 0deg -> 12 o'clock (100,50); 90deg -> 3 o'clock (150,100)
    expect(d).toBe('M 100 100 L 100 50 A 50 50 0 0 1 150 100 Z');
  });
});

describe('RootMapRing fill/color semantics (unchanged, confirmed not reinvented)', () => {
  it('fills fully when the domain has an earned finding, regardless of coverage', () => {
    const d = domain({ whatWeUnderstand: [{}] });
    expect(fillFractionFor(d, { count: 0, windowDays: 21 })).toBe(1);
  });

  it('fills proportionally to coverage when there is no earned finding', () => {
    const d = domain();
    expect(fillFractionFor(d, { count: 7, windowDays: 21 })).toBeCloseTo(1 / 3, 5);
  });

  it('fills zero with no coverage data at all', () => {
    const d = domain();
    expect(fillFractionFor(d, undefined)).toBe(0);
  });

  it('colors gold only for an earned finding, deep green otherwise', () => {
    expect(colorFor(domain({ whatWeUnderstand: [{}] }))).toBe('#F5B700');
    expect(colorFor(domain())).toBe('#1B3A2D');
  });
});

describe('RootMapRing source shape — identification + hit-target guards', () => {
  // Static source scan (this repo's established convention for client
  // components — no jsdom/RTL, see tests/checkin-navigation.test.ts).
  it('uses a filled wedge <path> as the hit target, not a thin stroked circle', () => {
    expect(SOURCE).toMatch(/<path[\s\S]*?fill="transparent"/);
    expect(SOURCE).toMatch(/d=\{wedgePath\(/);
  });

  it('renders a visible number label per segment', () => {
    expect(SOURCE).toMatch(/<text/);
    expect(SOURCE).toMatch(/\{index \+ 1\}/);
  });

  it('renders an ordered, tappable legend below the ring', () => {
    expect(SOURCE).toMatch(/<ul className="mt-4 grid/);
    expect(SOURCE).toMatch(/onClick=\{\(\) => scrollToDomain\(domain\.domain\)\}/);
  });

  it('rotates the ring via an SVG group transform, not a CSS -rotate-90 class', () => {
    expect(SOURCE).toMatch(/rotate\(-90 \$\{cx\} \$\{cy\}\)/);
    // The old CSS class lived directly on the <svg>'s className; check the
    // actual class string, not the file's prose (which references the old
    // approach by name while explaining why it changed).
    expect(SOURCE).not.toMatch(/className="h-auto w-full -rotate-90"/);
  });
});

describe('RootMapRing focus outline — real keyboard focus stays visible, tap does not', () => {
  // Confirmed live: a plain `outline-none` + `focus-visible:outline-*`
  // combo does NOT work on this element in Tailwind v4 — `outline-none`
  // sets the `--tw-outline-style` custom property to `none`, and that
  // property is what `outline-style` reads via var() for EVERY state on
  // the same element, including :focus-visible, since Tailwind v4's
  // outline utilities are custom-property-backed rather than setting
  // `outline-style` directly. Verified via the compiled CSS and a real
  // keyboard Tab press before landing on this fix (`outlineStyle` stayed
  // 'none' even while `:focus-visible` genuinely matched). Scoping the
  // suppression to `:not(:focus-visible)` was the fix — this guards
  // against reverting to the broken unconditional form.
  it('does not use an unconditional outline-none (the broken Tailwind v4 form)', () => {
    expect(CODE_ONLY).not.toMatch(/className="cursor-pointer outline-none focus-visible:outline/);
  });

  it('scopes the outline suppression to non-focus-visible state', () => {
    expect(SOURCE).toMatch(/\[&:not\(:focus-visible\)\]:outline-none/);
    expect(SOURCE).toMatch(/focus-visible:outline-\[#F5B700\]/);
  });
});

describe('RootMapRing scroll alignment — the "still lands wrong" fix', () => {
  // The first fix (block: 'center') was reported as still broken.
  // Reproduced live with isolated per-segment taps (fresh page load each
  // time, no cross-tap interference): `block: 'center'` cannot create
  // scroll room that doesn't exist, so a domain whose section sits near
  // the very end of the page (the four `isUninstrumented` domains'
  // compact list items, plus their close neighbors) clamped to
  // max-scroll instead of centering, landing on whatever card was
  // nearest the clamped viewport center — not the tapped domain.
  // `block: 'start'` doesn't have this failure mode. Verified live for
  // all twelve segments individually after the fix: every one lands on
  // its own real section, on-screen, clear of the header and bottom nav.
  it('scrolls with block: "start", not "center"', () => {
    expect(CODE_ONLY).toMatch(/block: 'start'/);
    expect(CODE_ONLY).not.toMatch(/block: 'center'/);
  });
});

describe('RootMapRing numbering — the WebKit clipping fix', () => {
  // Only 4 of 12 numbers rendered on a real iPhone (Safari/WebKit),
  // though headless Chromium always showed all 12 — confirmed directly
  // with Playwright's `webkit` engine (the real Safari rendering engine):
  // `dominantBaseline="middle"` support is inconsistent there, and the
  // resulting position pushed 8 of 12 labels' bounding boxes outside the
  // SVG's own clipping bounds. Fixed with the standard cross-browser-safe
  // `dy` offset instead, plus a small viewBox margin for real clearance.
  it('centers labels with a dy offset, not dominantBaseline', () => {
    expect(SOURCE).toMatch(/dy="0\.35em"/);
    expect(CODE_ONLY).not.toMatch(/dominantBaseline/);
  });

  it('expands the viewBox with a margin so labels have real clearance', () => {
    expect(SOURCE).toMatch(/VIEWBOX_MARGIN/);
    expect(SOURCE).toMatch(/viewBox=\{`\$\{-VIEWBOX_MARGIN\}/);
  });
});
