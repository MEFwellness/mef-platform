/**
 * Protein Ledger (Phase 1b) — pure logic guard tests. No Supabase needed
 * for the assertions themselves (the shared setupFiles connection check
 * still runs, per every test file in this suite), which is exactly why
 * these decisions (target-state rendering, day attribution, rounding, entry
 * source) were pulled into lib/protein/ledger.ts rather than left inline
 * in server actions/components — provable without a browser or a DB row.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDailyTotals,
  entryProteinGrams,
  lastNLocalDates,
  resolveEntrySource,
  resolveLedgerTargetDisplay,
  roundGrams,
  shouldApplySearchResponse,
  sumProteinGrams,
} from '../lib/protein/ledger';
import { localDateStringFor } from '../lib/time/localDate';
import type { ProteinSetupState } from '../app/actions/protein';

describe('roundGrams', () => {
  it('collapses a floating-point artifact to a clean whole number', () => {
    // The exact bug the task called out: a raw provider calculation can
    // come back as 189.9999999999998 — this must read 190, not the raw float.
    expect(roundGrams(189.9999999999998)).toBe(190);
  });

  it('rounds normally otherwise', () => {
    expect(roundGrams(24.4)).toBe(24);
    expect(roundGrams(24.5)).toBe(25);
  });
});

describe('entryProteinGrams', () => {
  it('multiplies per-serving protein by servings', () => {
    expect(entryProteinGrams({ servings: 2 }, { proteinG: 12.5 })).toBe(25);
  });

  it('is null (not zero) when the product has no known protein value — never invented', () => {
    expect(entryProteinGrams({ servings: 1 }, { proteinG: null })).toBeNull();
    expect(entryProteinGrams({ servings: 1 }, null)).toBeNull();
  });
});

describe('sumProteinGrams', () => {
  it('ignores unresolved entries rather than counting them as 0g', () => {
    const total = sumProteinGrams([{ proteinGrams: 10 }, { proteinGrams: null }, { proteinGrams: 15.5 }]);
    expect(total).toBe(25.5);
  });
});

describe('resolveEntrySource', () => {
  it('is "scan" whenever a scan_id is present, regardless of the product', () => {
    expect(
      resolveEntrySource({ scanId: 'scan-1', productBarcode: '012345678905', productDataSource: 'open_food_facts' })
    ).toBe('scan');
  });

  it('is "quick_add" for a private mef_verified product with no barcode and no scan', () => {
    expect(
      resolveEntrySource({ scanId: null, productBarcode: null, productDataSource: 'mef_verified' })
    ).toBe('quick_add');
  });

  it('is "search" for any other product-linked entry with no scan', () => {
    expect(
      resolveEntrySource({ scanId: null, productBarcode: '012345678905', productDataSource: 'open_food_facts' })
    ).toBe('search');
  });
});

describe('resolveLedgerTargetDisplay — the task’s two hard display rules', () => {
  it('a pending_coach_review target never renders as active (no targetGrams, no active mode)', () => {
    const state: ProteinSetupState = { stage: 'pending_review' };
    const display = resolveLedgerTargetDisplay(state);
    expect(display.mode).not.toBe('active');
    expect(display.targetGrams).toBeNull();
    expect(display.showSetupNudge).toBe(false);
  });

  it('a safety-blocked member gets no setup nudge', () => {
    const state: ProteinSetupState = { stage: 'blocked', message: 'anything' };
    const display = resolveLedgerTargetDisplay(state);
    expect(display.showSetupNudge).toBe(false);
    expect(display.mode).toBe('blocked');
  });

  it('no profile at all is the only case with a setup nudge', () => {
    expect(resolveLedgerTargetDisplay(null).showSetupNudge).toBe(true);
    expect(resolveLedgerTargetDisplay({ stage: 'not_started' }).showSetupNudge).toBe(true);
  });

  it('an active target exposes the real target grams and range', () => {
    const state: ProteinSetupState = {
      stage: 'active',
      track: 'self_guided',
      activeGrams: 120,
      isCoachEdited: false,
      suggestedRange: { low: 110, high: 130 },
    };
    const display = resolveLedgerTargetDisplay(state);
    expect(display.mode).toBe('active');
    if (display.mode === 'active') {
      expect(display.targetGrams).toBe(120);
      expect(display.suggestedRange).toEqual({ low: 110, high: 130 });
    }
  });
});

describe('day attribution across timezone boundaries', () => {
  it('an instant just after UTC midnight still belongs to the previous local day in a negative-offset timezone', () => {
    // 2024-01-15T02:00:00Z is 2024-01-14 21:00 in America/New_York (UTC-5
    // in January) — the entry must attribute to the 14th, not the 15th.
    const localDate = localDateStringFor('2024-01-15T02:00:00.000Z', 'America/New_York');
    expect(localDate).toBe('2024-01-14');
  });

  it('an instant just before UTC midnight already belongs to the next local day in a positive-offset timezone', () => {
    // 2024-01-14T20:00:00Z is 2024-01-15 05:00 in Asia/Tokyo (UTC+9) — the
    // entry must attribute to the 15th, not the 14th.
    const localDate = localDateStringFor('2024-01-14T20:00:00.000Z', 'Asia/Tokyo');
    expect(localDate).toBe('2024-01-15');
  });

  it('buildDailyTotals sums only the entries whose real local date matches each bucket, and keeps empty days at 0g', () => {
    const dates = lastNLocalDates('2024-01-15', 3); // ['2024-01-13', '2024-01-14', '2024-01-15']
    expect(dates).toEqual(['2024-01-13', '2024-01-14', '2024-01-15']);

    const totals = buildDailyTotals(dates, [
      { localDate: '2024-01-13', proteinGrams: 20 },
      { localDate: '2024-01-13', proteinGrams: 30 },
      { localDate: '2024-01-15', proteinGrams: 50 },
    ]);

    expect(totals).toEqual([
      { localDate: '2024-01-13', totalGrams: 50 },
      { localDate: '2024-01-14', totalGrams: 0 },
      { localDate: '2024-01-15', totalGrams: 50 },
    ]);
  });
});

describe('shouldApplySearchResponse — search-lane race guard', () => {
  it('simulates out-of-order arrival: an earlier, shorter query resolving after a later, longer one must not overwrite it', () => {
    // Member types "c" (request A, id 1) then keeps typing to "chicken
    // breast" before A resolves (request B, id 2) — by the time B is
    // dispatched, id 2 is the latest and "chicken breast" is the live text.
    const latestRequestId = 2;
    const liveQuery = 'chicken breast';

    // B (the current, correct request) resolves first.
    const bApplies = shouldApplySearchResponse(
      { requestId: 2, query: 'chicken breast' },
      { latestRequestId, query: liveQuery }
    );
    expect(bApplies).toBe(true);

    // A (dispatched earlier, for a since-superseded partial query) resolves
    // late, after B already landed — it must be discarded even though it
    // eventually did complete successfully.
    const aApplies = shouldApplySearchResponse(
      { requestId: 1, query: 'c' },
      { latestRequestId, query: liveQuery }
    );
    expect(aApplies).toBe(false);
  });

  it('also rejects a response whose request id is current but whose query text has since moved on (a rapid keystroke between dispatch and resolution)', () => {
    const applies = shouldApplySearchResponse(
      { requestId: 3, query: 'chicken' },
      { latestRequestId: 3, query: 'chicken breast' }
    );
    expect(applies).toBe(false);
  });

  it('accepts a response only when both the request id and the query text are still current', () => {
    const applies = shouldApplySearchResponse(
      { requestId: 5, query: 'chicken breast' },
      { latestRequestId: 5, query: 'chicken breast' }
    );
    expect(applies).toBe(true);
  });
});
