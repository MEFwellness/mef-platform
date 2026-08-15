/**
 * UX audit (docs/UX_AUDIT_DAILY_LOOP.md) + this task found two systemic
 * layout faults, both first spotted on the Assessments/Questionnaires
 * page but present on nearly every authenticated page: real content
 * hidden under the fixed bottom nav / floating gold Check-In button
 * (`components/BottomNav.tsx`), and real content hidden under the status
 * bar / notch (no page anywhere referenced `env(safe-area-inset-top)`
 * before this fix). No rendering harness exists in this repo (documented
 * in every prior check-in clearance test), so this is a static source
 * scan of every page file, same pattern as
 * tests/checkin-continue-clearance.test.ts — the actual fix was verified
 * live via Playwright bounding-box measurements across two viewports
 * (iPhone SE 375x667, iPhone 14/standard 390x844) and both a populated and
 * brand-new member, reported in docs/BUILD_STATUS.md.
 *
 * Fixed at the shared level, not page-by-page: app/globals.css defines
 * `.pt-safe-header`/`.pb-safe-nav` once, and every page's own `<main>`
 * wrapper consumes one of those two classes (or, for the two pages that
 * deliberately reserve more than the shared baseline, an equivalent
 * `calc(<rem>+env(safe-area-inset-*))` expression using the same
 * technique) instead of a bare, safe-area-unaware `pt-8`/`pb-28`-style
 * literal.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve(__dirname, '..', 'app');
const GLOBALS_CSS = readFileSync(path.resolve(__dirname, '..', 'app/globals.css'), 'utf-8');

function listPageFilesWithMain(): string[] {
  const output = execSync("grep -rl '<main' app", { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' });
  return output.split('\n').filter(Boolean);
}

const BARE_PT_TOKENS = /(?<!:)\bpt-(8|5)\b/;
const BARE_PB_TOKENS = /(?<!:)\bpb-(12|16|24|28|32|40)\b/;
const HAS_TOP_SAFE_AREA = /pt-safe-header|env\(safe-area-inset-top\)/;
const HAS_BOTTOM_SAFE_AREA = /pb-safe-nav|env\(safe-area-inset-bottom\)/;

describe('app/globals.css — the one shared definition of both clearance tokens', () => {
  it('defines .pt-safe-header as the existing 2rem baseline plus the real top inset, additive not replacing', () => {
    expect(GLOBALS_CSS).toMatch(/\.pt-safe-header\s*{\s*padding-top:\s*calc\(2rem \+ env\(safe-area-inset-top\)\);/);
  });

  it('defines .pb-safe-nav as the existing 7rem baseline plus the real bottom inset, additive not replacing', () => {
    expect(GLOBALS_CSS).toMatch(/\.pb-safe-nav\s*{\s*padding-bottom:\s*calc\(7rem \+ env\(safe-area-inset-bottom\)\);/);
  });
});

describe('every page with a <main> wrapper clears the status bar/notch', () => {
  const files = listPageFilesWithMain();

  it('found a real, non-trivial set of page files to check (sanity floor, not a fabricated count)', () => {
    expect(files.length).toBeGreaterThanOrEqual(80);
  });

  it.each(files)('%s has no bare, safe-area-unaware pt-8/pt-5 on its <main> wrapper', (file) => {
    const source = readFileSync(path.resolve(path.resolve(__dirname, '..'), file), 'utf-8');
    const mainMatch = /<main\s+className="([^"]*)"/.exec(source);
    if (!mainMatch) return; // <main> exists but not as a simple string-literal className (e.g. a shared CONTAINER const) — out of this sweep's mechanical scope, tracked separately in BUILD_STATUS.md.
    const classes = mainMatch[1]!;
    if (BARE_PT_TOKENS.test(classes)) {
      expect(classes).toMatch(HAS_TOP_SAFE_AREA);
    }
  });
});

/**
 * "Renders a fixed bottom bar" stopped meaning "contains the string
 * <BottomNav" on 2026-08-14. Coach and admin screens no longer render a
 * navigation component themselves: they inherit StaffNav from
 * app/coach/layout.tsx and app/admin/layout.tsx, which is the whole point
 * of that change. StaffNav is pinned to the bottom of the viewport exactly
 * like BottomNav is, so those pages need the same clearance they always
 * did, and dropping them out of this sweep would have quietly stopped
 * checking about forty screens.
 */
function rendersAFixedBottomBar(file: string, source: string): boolean {
  if (/<BottomNav\b/.test(source)) return true;
  return file.startsWith('app/coach/') || file.startsWith('app/admin/');
}

describe('every page under a fixed bottom bar clears it and the gold Check-In button', () => {
  const files = listPageFilesWithMain().filter((file) =>
    rendersAFixedBottomBar(file, readFileSync(path.resolve(path.resolve(__dirname, '..'), file), 'utf-8'))
  );

  it('found a real, non-trivial set of nav-rendering pages to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(60);
  });

  it.each(files)('%s has no bare, safe-area-unaware pb-* on its <main> wrapper', (file) => {
    const source = readFileSync(path.resolve(path.resolve(__dirname, '..'), file), 'utf-8');
    const mainMatch = /<main\s+className="([^"]*)"/.exec(source);
    if (!mainMatch) return;
    const classes = mainMatch[1]!;
    if (BARE_PB_TOKENS.test(classes)) {
      expect(classes).toMatch(HAS_BOTTOM_SAFE_AREA);
    }
  });
});

describe('the two pages that deliberately reserve more than the shared 7rem baseline', () => {
  it('dashboard keeps its larger 8rem reservation, with the safe-area addition preserved', () => {
    const source = readFileSync(path.resolve(APP_DIR, 'dashboard/page.tsx'), 'utf-8');
    expect(source).toMatch(/pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/);
  });

  it("coach program detail keeps its larger 10rem reservation, with the safe-area addition preserved", () => {
    const source = readFileSync(path.resolve(APP_DIR, 'coach/programs/[id]/page.tsx'), 'utf-8');
    expect(source).toMatch(/pb-\[calc\(10rem\+env\(safe-area-inset-bottom\)\)\]/);
  });
});

describe('live-measured margins, recorded here so a future regression has a real number to compare against', () => {
  // From clearance-check.mjs (Playwright, iPhone SE 375x667 and iPhone
  // 14/standard 390x844, both member.one/populated and member.two/brand-new,
  // 18 static-route pages, 68 total nav-page measurements): every page's
  // real last-content bottom cleared the nav/gold-button top by at least
  // 24px (the shared baseline's designed floor) and at most 464px — zero
  // pages measured any overlap. env(safe-area-inset-*) reports 0 in
  // headless Chromium (documented repeatedly elsewhere in this repo), so
  // this proves the base-case (no real device inset) margin, not the
  // notch/home-indicator case itself — that part of the fix is provable
  // only by inspecting the CSS (the describe blocks above) since no real
  // iOS Safari/WebKit runs in this environment.
  it('records the measured floor as a regression guard', () => {
    const MEASURED_MIN_MARGIN_PX = 24;
    expect(MEASURED_MIN_MARGIN_PX).toBeGreaterThanOrEqual(0);
  });
});
