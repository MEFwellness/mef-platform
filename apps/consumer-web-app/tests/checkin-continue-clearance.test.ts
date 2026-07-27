/**
 * UX audit (docs/UX_AUDIT_DAILY_LOOP.md) found the persistent Continue
 * button overlapping real question content on every section-mode check-in
 * screen and on the new-member pain-location screen — confirmed live via
 * Playwright bounding-box measurements (button always sticks at
 * `bottom-4` for the full scroll range once a screen's content exceeds
 * the viewport, and without extra bottom padding, max scroll left real
 * content directly behind it). No rendering harness exists in this repo
 * (documented in every prior check-in test file), so this is a static
 * source scan of components/checkin/CheckinWizard.tsx — the actual fix
 * was verified live via `verify-overlap.mjs` (28/28 checks passing across
 * both check-in flows, both member states, and two viewport sizes,
 * including iPhone SE), reported in docs/BUILD_STATUS.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const wizard = readFileSync(
  path.resolve(__dirname, '..', 'components/checkin/CheckinWizard.tsx'),
  'utf-8'
);

describe('CheckinWizard — Continue button never overlaps content', () => {
  it('the content wrapper reserves real bottom padding sized to the button + safe area', () => {
    // Must be a real calc() combining a rem value with the safe-area
    // inset -- not just a flat pb-* class, since the button's own
    // `bottom-4` offset doesn't already account for the home-indicator
    // inset on notched phones.
    expect(wizard).toMatch(/pb-\[calc\(\d+(\.\d+)?rem\+env\(safe-area-inset-bottom\)\)\]/);
  });

  it('the reserved padding is generous enough to clear the button (>= 6rem base, before the safe-area addition)', () => {
    const match = /pb-\[calc\((\d+(?:\.\d+)?)rem\+env\(safe-area-inset-bottom\)\)\]/.exec(wizard);
    expect(match).not.toBeNull();
    const rem = Number(match![1]);
    // Button is ~52px (py-3.5 + text-base) + its own 16px bottom-4 offset
    // + breathing room ~= 84px = 5.25rem minimum; require comfortably
    // more than that floor, not just barely enough.
    expect(rem).toBeGreaterThanOrEqual(6);
  });

  it('the padding lives on the content wrapper, not stripped from the sticky button itself', () => {
    const paddingIndex = wizard.indexOf('pb-[calc(');
    const contentDivStart = wizard.lastIndexOf('<div', paddingIndex);
    const block = wizard.slice(contentDivStart, paddingIndex + 200);
    expect(block).toContain('renderScreen');
  });

  it('the Continue control stays sticky and persistent -- not moved into normal scroll flow', () => {
    expect(wizard).toMatch(/className="sticky bottom-4 z-10/);
  });

  it("no auto-advance was reintroduced -- onContinue is only ever wired to the one persistent button's onClick", () => {
    const occurrences = wizard.match(/onContinue/g) ?? [];
    // Exactly three occurrences: the destructured prop, its type
    // declaration, and the single `onClick={onContinue}` wiring on the
    // persistent button -- no other call site (e.g. inside a timer or
    // effect) invokes it.
    expect(occurrences.length).toBe(3);
    expect(wizard).toContain('onClick={onContinue}');
    expect(wizard).not.toMatch(/setTimeout\([^)]*onContinue/);
  });

  it('the progress dots, Home control, and back chevron are untouched', () => {
    expect(wizard).toContain('aria-label="Save progress and return to Home"');
    expect(wizard).toContain('aria-label="Back to previous screen"');
    expect(wizard).toMatch(/aria-label={`Go to screen \$\{index \+ 1\} of \$\{screenCount\}`}/);
  });
});
