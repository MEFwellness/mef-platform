/**
 * UX fix batch 3, item 3: every screen's descriptive subhead
 * (`text-[15px] leading-relaxed text-[#6B7A72]`, e.g. "A few gentle
 * questions so Root understands how today actually feels") read as
 * acceptable in screenshots but was worth measuring directly. Measured
 * live via Playwright — real `getComputedStyle(el).color` plus the
 * actual rendered background pixel sampled from a real screenshot (not
 * the nominal palette hex, since most of these screens sit on a
 * `bg-gradient-to-b` whose real on-screen color varies by scroll
 * position) — across 5 representative real screens (`/checkin`,
 * `/questionnaires`, `/membership`, `/connections`, `/checkin/evening`):
 *
 *   #6B7A72 (before) vs. real sampled backgrounds:
 *     /checkin              rgb(240,232,214)  ->  3.70:1  FAIL AA
 *     /questionnaires       rgb(240,246,242)  ->  4.12:1  FAIL AA
 *     /membership           rgb(242,247,243)  ->  4.16:1  FAIL AA
 *     /connections          rgb(240,246,242)  ->  4.12:1  FAIL AA
 *     /checkin/evening      rgb(225,228,222)  ->  3.52:1  FAIL AA
 *
 * All five fail WCAG AA for normal text (4.5:1 — this is 15px/400-weight,
 * well under the "large text" 24px/18.66px-bold threshold that would
 * only need 3:1). Fixed by darkening toward the locked palette's own
 * forest green (#1B3A2D, not inventing an unrelated hue) — #6B7A72
 * blended 35% toward #1B3A2D lands on #4F645A, re-measured live on the
 * same 5 real screens:
 *
 *   #4F645A (after):
 *     /checkin              5.21:1  PASS
 *     /questionnaires       5.80:1  PASS
 *     /membership           5.87:1  PASS
 *     /connections          5.80:1  PASS
 *     /checkin/evening      4.95:1  PASS (worst case, still clears with margin)
 *
 * Applied everywhere this exact style appears (19 files, verified by
 * grep — not screen by screen), not just the screens actually measured.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..');

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function relLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const lA = relLuminance(a);
  const lB = relLuminance(b);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const NEW_SUBHEAD_COLOR: [number, number, number] = [0x4f, 0x64, 0x5a];
const OLD_SUBHEAD_COLOR: [number, number, number] = [0x6b, 0x7a, 0x72];

// The real backgrounds sampled live behind the subhead on 5 representative
// screens (see the header comment above for exactly how these were captured).
const REAL_MEASURED_BACKGROUNDS: Record<string, [number, number, number]> = {
  '/checkin': [240, 232, 214],
  '/questionnaires': [240, 246, 242],
  '/membership': [242, 247, 243],
  '/connections': [240, 246, 242],
  '/checkin/evening': [225, 228, 222],
};

describe('Subhead contrast: WCAG AA math against the real measured backgrounds', () => {
  it('the OLD color failed AA (4.5:1) against every real measured background — confirms this was a genuine bug, not a false alarm', () => {
    for (const [screen, bg] of Object.entries(REAL_MEASURED_BACKGROUNDS)) {
      const ratio = contrastRatio(OLD_SUBHEAD_COLOR, bg);
      expect(ratio, `${screen} should have failed AA with the old color`).toBeLessThan(4.5);
    }
  });

  it('the NEW color clears AA (4.5:1) against every real measured background, with margin', () => {
    for (const [screen, bg] of Object.entries(REAL_MEASURED_BACKGROUNDS)) {
      const ratio = contrastRatio(NEW_SUBHEAD_COLOR, bg);
      expect(ratio, `${screen} should pass AA with the new color`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the new color is a blend toward the locked palette\'s forest green, not an unrelated hue', () => {
    // Every channel of the new color must sit between the old color and
    // forest green (#1B3A2D) — i.e. a real blend, not an arbitrary pick.
    const FOREST: [number, number, number] = [0x1b, 0x3a, 0x2d];
    for (let i = 0; i < 3; i++) {
      const old = OLD_SUBHEAD_COLOR[i]!;
      const forest = FOREST[i]!;
      const next = NEW_SUBHEAD_COLOR[i]!;
      const lo = Math.min(old, forest);
      const hi = Math.max(old, forest);
      expect(next).toBeGreaterThanOrEqual(lo);
      expect(next).toBeLessThanOrEqual(hi);
    }
  });
});

describe('Subhead style: the new color is applied everywhere it is used, not screen by screen', () => {
  it('no file under app/ or components/ still uses the old subhead color for this exact style', () => {
    const grep = execSync(
      `grep -rl "text-\\[15px\\] leading-relaxed text-\\[#6B7A72\\]" --include="*.tsx" app components || true`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    ).trim();
    expect(grep).toBe('');
  });

  it('the new color is present in every one of the 19 files known to use this subhead style', () => {
    const knownFiles = [
      'app/assessment/page.tsx',
      'app/checkin/CheckinForm.tsx',
      'app/checkin/evening/EveningReflectionForm.tsx',
      'app/connections/page.tsx',
      'app/conversation/page.tsx',
      'app/food-lens/page.tsx',
      'app/food-lens/pantry/page.tsx',
      'app/food-lens/report/page.tsx',
      'app/membership/page.tsx',
      'app/onboarding/GuestObservationScreen.tsx',
      'app/onboarding/OnboardingCompletionScreen.tsx',
      'app/onboarding/OnboardingIntro.tsx',
      'app/questionnaires/page.tsx',
      'app/welcome/WelcomeFlow.tsx',
      'app/wellness-check/GuestPreviewFlow.tsx',
      'components/FirstCheckinTransition.tsx',
      'components/MovementAssessmentCard.tsx',
      'components/body-assessment/AssessmentWizard.tsx',
      'components/movement/MovementEmptyState.tsx',
    ];
    for (const rel of knownFiles) {
      const src = readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
      expect(src, `${rel} should use the new subhead color`).toContain(
        'text-[15px] leading-relaxed text-[#4F645A]'
      );
    }
  });
});
