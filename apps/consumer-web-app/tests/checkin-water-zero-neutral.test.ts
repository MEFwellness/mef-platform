/**
 * UX audit fix (batch 1, item 3, 2026-07-27): the Today-page water
 * tracker rendered "0" in red — waterStatus(0) classifies as 'poor'
 * (lib/wellness/status.ts's thresholds: cups >= 6 good, >= 3 attention,
 * else poor), the same red this app otherwise reserves for real
 * alarm/high-severity states (stress, pain). 0 cups so far today is a
 * neutral, expected state, not a failure.
 *
 * Deliberately local, not a change to waterStatus() itself:
 * lib/wellness/status.ts's own header comment states it's the single
 * source of truth shared by the coach dashboard and the Wellness Index
 * score — a genuinely *completed* day with 0 cups is a real, different
 * signal there than "hasn't gotten to it yet" on a still-accumulating,
 * same-day tracker. So this fix overrides the classification only where
 * the live, in-progress total renders on the Today page (the tracker
 * itself, and the matching "Today's Recommendations" text derived from
 * the same live total) — waterStatus() and every other consumer
 * (app/coach/clients/[id]/page.tsx, lib/wellness/wellness-index.ts) is
 * confirmed unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waterStatus } from '../lib/wellness/status';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const TRACKER = source('components/checkin/HydrationTracker.tsx');
const TODAY_PAGE = source('app/today/page.tsx');
const STATUS_LIB = source('lib/wellness/status.ts');

describe('waterStatus() itself is untouched — still shared, single source of truth', () => {
  it('waterStatus(0) is still classified poor at the shared-function level (coach dashboard / Wellness Index depend on this)', () => {
    expect(waterStatus(0)).toBe('poor');
  });

  it('waterStatus(3) is still attention, waterStatus(6) is still good, waterStatus(null) is still no-data', () => {
    expect(waterStatus(3)).toBe('attention');
    expect(waterStatus(6)).toBe('good');
    expect(waterStatus(null)).toBe('no-data');
  });

  it('lib/wellness/status.ts source has no special-case for 0 — the override lives only at the two Today-page call sites', () => {
    expect(STATUS_LIB).toMatch(/if \(cups >= 6\) return 'good';\s*\n\s*if \(cups >= 3\) return 'attention';\s*\n\s*return 'poor';/);
  });
});

describe('HydrationTracker.tsx: the live tracker treats a literal 0 as neutral, not poor', () => {
  it('overrides to no-data specifically for total === 0 before styling the big number', () => {
    expect(TRACKER).toMatch(/const status = total === 0 \? 'no-data' : waterStatus\(total\);/);
  });
});

describe("Today page's water recommendation text uses the same neutral-zero override", () => {
  it('the STATUS_STYLES lookup for the water line overrides to no-data when hydrationTotal is 0', () => {
    expect(TODAY_PAGE).toMatch(
      /STATUS_STYLES\[hydrationTotal === 0 \? 'no-data' : waterStatus\(hydrationTotal\)\]\.text/
    );
  });
});
