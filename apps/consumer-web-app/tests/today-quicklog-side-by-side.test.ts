/**
 * UX fix batch 3, item 4: the Water/Movement quick-log cards used to
 * stack one per row on mobile (`grid-cols-1 md:grid-cols-2`) — identified
 * in the prior batch as the single best remaining way to shorten Today's
 * page. Now `grid-cols-2` unconditionally, so they sit side by side at
 * every width including iPhone SE.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source. The
 * real side-by-side layout, tap-target sizes, and no-overflow behavior
 * at 375px width were verified live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const TODAY_PAGE = source('app/today/page.tsx');
const HYDRATION = source('components/checkin/HydrationTracker.tsx');
const MOVEMENT = source('components/checkin/MovementLevelTracker.tsx');

describe('Today page: Water and Movement quick-log cards sit side by side unconditionally', () => {
  it('the grid is grid-cols-2 with no mobile-only single-column override', () => {
    expect(TODAY_PAGE).toContain('grid grid-cols-2 gap-3 sm:gap-5');
  });

  it('specifically the quick-log grid (not the unrelated Check-In Progress grid earlier on the page) is the one that changed', () => {
    const quickLogIdx = TODAY_PAGE.indexOf('<HydrationTracker');
    const nearbyGridOpenTag = TODAY_PAGE.lastIndexOf('<div className="mt-6 grid', quickLogIdx);
    expect(TODAY_PAGE.slice(nearbyGridOpenTag, quickLogIdx)).toContain('grid-cols-2 gap-3 sm:gap-5');
  });

  it('both trackers are still rendered, in the same order, no content dropped', () => {
    const gridIdx = TODAY_PAGE.indexOf('grid grid-cols-2 gap-3 sm:gap-5');
    const after = TODAY_PAGE.slice(gridIdx, gridIdx + 400);
    const hydrationIdx = after.indexOf('<HydrationTracker');
    const movementIdx = after.indexOf('<MovementLevelTracker');
    expect(hydrationIdx).toBeGreaterThan(-1);
    expect(movementIdx).toBeGreaterThan(hydrationIdx);
  });
});

describe('HydrationTracker / MovementLevelTracker: tap targets are unchanged by the layout change', () => {
  it('the +/- buttons are still their original fixed size (h-8 w-8), not shrunk to fit a narrower column', () => {
    expect(HYDRATION).toContain('flex h-8 w-8 shrink-0 items-center justify-center rounded-full');
  });

  it('the movement pills keep their original padding (px-3.5 py-1.5), not shrunk', () => {
    expect(MOVEMENT).toContain('rounded-full border px-3.5 py-1.5 text-[13px] font-medium');
  });

  it('the movement options still wrap (flex-wrap), so a narrower column reflows to more rows instead of clipping or shrinking any pill', () => {
    expect(MOVEMENT).toContain('flex flex-wrap gap-2');
  });

  it('all four movement levels are still present — no options dropped to make room', () => {
    for (const label of ['None', 'Light', 'Moderate', 'Full session']) {
      expect(MOVEMENT).toContain(`label: '${label}'`);
    }
  });
});
