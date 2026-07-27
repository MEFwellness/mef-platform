/**
 * UX fix batch 3, item 4 (original): the Water/Movement quick-log cards
 * sit side by side on mobile once both are still open.
 *
 * Today page full redesign (2026-07-27): the quick-log grid moved out of
 * app/today/page.tsx into app/today/TodayZones.tsx, which now owns
 * whether each tracker renders in the Forward Zone (not yet logged today)
 * or the Accomplished Zone's "Done Today" group (logged) — see
 * today-zones-redesign.test.ts for that zone-membership logic. This file
 * keeps checking what batch 3 originally guaranteed: side by side when
 * both are still open, and the underlying controls' own tap targets
 * unchanged by any of this.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const TODAY_ZONES = source('app/today/TodayZones.tsx');
const HYDRATION = source('components/checkin/HydrationTracker.tsx');
const MOVEMENT = source('components/checkin/MovementLevelTracker.tsx');

describe('TodayZones: Water and Movement sit side by side while both are still open', () => {
  it('the Forward Zone quick-log grid is 2 columns only while both trackers are unlogged, 1 column once only one remains', () => {
    expect(TODAY_ZONES).toContain("showBothTrackers ? 'grid-cols-2' : 'grid-cols-1'");
  });

  it('both trackers are still rendered in the Forward Zone in the same order, gated on not-yet-logged-today', () => {
    const idx = TODAY_ZONES.indexOf('showBothTrackers');
    const forwardZoneBlock = TODAY_ZONES.slice(idx, TODAY_ZONES.indexOf("You're all set for today"));
    const hydrationIdx = forwardZoneBlock.indexOf('<HydrationTracker');
    const movementIdx = forwardZoneBlock.indexOf('<MovementLevelTracker');
    expect(hydrationIdx).toBeGreaterThan(-1);
    expect(movementIdx).toBeGreaterThan(hydrationIdx);
  });

  it('both trackers also render in the Accomplished Zone\'s Done Today group once logged, same components not a rewritten summary', () => {
    const doneTodayIdx = TODAY_ZONES.indexOf('Done Today');
    const afterDoneToday = TODAY_ZONES.slice(doneTodayIdx);
    expect(afterDoneToday).toContain('<HydrationTracker');
    expect(afterDoneToday).toContain('<MovementLevelTracker');
  });
});

describe('HydrationTracker / MovementLevelTracker: tap targets are unchanged by the redesign', () => {
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
