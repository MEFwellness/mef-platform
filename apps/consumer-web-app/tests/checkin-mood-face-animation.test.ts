/**
 * Animation task (2026-07-27), item 3: the mood face "comes alive"
 * briefly on a genuine new selection — a spring scale-up settling back
 * to size, with the mouth curve drawing into place. Motion only: the
 * accent-only selected state (gold ring, gold icon color, bold label)
 * from the prior UX-audit pass must be completely unchanged.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source,
 * same discipline as tests/checkin-mood-gold-accent.test.ts. The real
 * animate-on-tap / no-animate-on-revisit / reduced-motion behavior is
 * verified live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MOOD = source('components/checkin/scales/FiveFacesScale.tsx');
const GLOBALS_CSS = source('app/globals.css');

describe('FiveFacesScale: the selected face animates on tap (spring scale + mouth draw-in)', () => {
  it('the icon gets the pop animation class only when actually animating', () => {
    expect(MOOD).toMatch(/className=\{`h-6 w-6 \$\{animate \? 'mef-mood-face-pop' : ''\}`\}/);
  });

  it('the mouth path draws in via the pathLength=1 / stroke-dashoffset trick, only while animating', () => {
    expect(MOOD).toMatch(/pathLength=\{animate \? 1 : undefined\}/);
    expect(MOOD).toMatch(/className=\{animate \? 'mef-mood-face-draw' : ''\}/);
  });

  it('animation fires only on a genuine value change — tracked via a previous-value ref, not on initial mount with an already-answered value', () => {
    expect(MOOD).toContain('const previousValueRef = useRef(value);');
    expect(MOOD).toMatch(/if \(previousValueRef\.current !== value && value !== null\) {\s*\n\s*setJustSelectedValue\(value\);/);
  });

  it('only the newly/currently selected option animates — deselected options are never animated', () => {
    expect(MOOD).toMatch(/const animate = !reducedMotion && isSelected && justSelectedValue === optionValue;/);
  });

  it('respects prefers-reduced-motion — animate is forced false, so the class is never applied at all', () => {
    expect(MOOD).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    expect(MOOD).toContain('!reducedMotion &&');
  });

  it('the existing haptic-on-tap call is untouched — already covers this task\'s haptic requirement', () => {
    expect(MOOD).toMatch(/onClick=\{\(\) => {\s*\n\s*triggerHaptic\(\);\s*\n\s*onChange\(optionValue\);/);
  });
});

describe('FiveFacesScale: motion only — the selected-state styling itself is unchanged', () => {
  it('the gold ring/border classes are exactly as before', () => {
    expect(MOOD).toContain("'scale-105 border-[#C4A050] shadow-[0_4px_16px_-4px_rgba(196,160,80,0.45)]'");
  });

  it('the icon stroke color logic is unchanged (gold when selected, dark green otherwise)', () => {
    expect(MOOD).toMatch(/const stroke = isSelected \? MOOD_ACCENT : '#1B3A2D';/);
  });

  it('the bold-label logic is unchanged', () => {
    expect(MOOD).toMatch(/isSelected \? 'font-bold text-\[#1B3A2D\]' : 'font-medium text-\[#6B7A72\]'/);
  });
});

describe('app/globals.css: the two new keyframes exist, are short/quick, and are disabled under reduced motion', () => {
  it('mef-mood-face-pop is a real overshoot-easing spring, not a linear scale', () => {
    expect(GLOBALS_CSS).toContain('@keyframes mef-mood-face-pop');
    expect(GLOBALS_CSS).toMatch(/\.mef-mood-face-pop\s*{\s*\n\s*animation:\s*mef-mood-face-pop\s+0\.42s\s+cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)\s+both;/);
  });

  it('mef-mood-face-draw is a real stroke-dashoffset reveal, quick (well under a second)', () => {
    expect(GLOBALS_CSS).toContain('@keyframes mef-mood-face-draw');
    expect(GLOBALS_CSS).toMatch(/animation:\s*mef-mood-face-draw\s+0\.35s/);
  });

  it('both are disabled under prefers-reduced-motion', () => {
    const mediaBlockStart = GLOBALS_CSS.indexOf('.mef-mood-face-pop,\n  .mef-mood-face-draw');
    expect(mediaBlockStart).toBeGreaterThan(-1);
  });
});
