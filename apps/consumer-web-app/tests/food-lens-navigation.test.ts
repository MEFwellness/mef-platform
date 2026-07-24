/**
 * Regression test for the Food Lens back-navigation bug: "Back to Food
 * Lens" (on subpages) and "Back to Home" (on the main Food Lens page) must
 * navigate to their literal, named destination and must never rely on
 * browser history (router.back() / window.history.back() /
 * history.go(-1)). Relying on history caused a real bug — after
 * Home -> Food Lens -> Primal Pattern -> Food Lens (via the direct "Back to
 * Food Lens" link), tapping "Back to Home" called router.back() and landed
 * back on Primal Pattern instead of Home, because router.back() replays
 * the browser history stack rather than going to the button's labeled
 * destination.
 *
 * Static source scan, following the convention in
 * tests/assessments-isolation.test.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const BROWSER_HISTORY_NAV = /router\.back\(\)|window\.history\.back\(\)|history\.go\(\s*-1\s*\)/;

function collectFiles(root: string, dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (rel.includes('node_modules')) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(root, full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

describe('Food Lens back navigation — no browser-history reliance', () => {
  const root = process.cwd();
  const foodLensDir = join(root, 'app', 'food-lens');
  const files = collectFiles(root, foodLensDir);

  it('found a non-trivial number of Food Lens route files to scan (the scan itself is not silently vacuous)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no Food Lens route file calls router.back() / window.history.back() / history.go(-1) directly', () => {
    const offenders: { file: string; match: string }[] = [];
    for (const file of files) {
      const content = readFileSync(join(root, file), 'utf8');
      const match = content.match(BROWSER_HISTORY_NAV);
      if (match) offenders.push({ file, match: match[0] });
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('every "Back to Food Lens" control on a subpage links directly to /food-lens', () => {
    const subpages = files.filter((f) => f !== join('app', 'food-lens', 'page.tsx'));
    const offenders: string[] = [];
    for (const file of subpages) {
      const content = readFileSync(join(root, file), 'utf8');
      if (!content.includes('Back to Food Lens')) continue;
      if (!/href=\{'\/food-lens'\s+as\s+Route\}/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('the main Food Lens page\'s "Back to Home" control forces its fallback route instead of calling router.back()', () => {
    const content = readFileSync(join(foodLensDir, 'page.tsx'), 'utf8');
    expect(content).toMatch(
      /<BackButton\s+fallbackHref="\/dashboard"\s+label="Back to Home"\s+forceFallback\s*\/>/
    );
  });
});

describe('BackButton — forceFallback always navigates to fallbackHref, never router.back()', () => {
  const source = readFileSync(join(process.cwd(), 'components', 'BackButton.tsx'), 'utf8');

  it('gates the router.back() branch on !forceFallback', () => {
    expect(source).toMatch(/if\s*\(\s*!forceFallback\s*&&.*router\.back\(\)/s);
  });

  it('falls back to an explicit router.push(fallbackHref), not a history call', () => {
    expect(source).toMatch(/router\.push\(fallbackHref\)/);
  });
});
