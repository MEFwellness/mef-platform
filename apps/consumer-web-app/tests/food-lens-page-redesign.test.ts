/**
 * Food Lens page redesign — restructures ~12 equal-weight cards into
 * sections without adding or removing any destination. No component-
 * rendering harness exists in this repo (plain 'node' vitest environment,
 * see today-zones-redesign.test.ts's header for the same convention), so
 * this is a static source scan of the fixed files, plus the merged
 * protein card's three display states (no target, pending review, target
 * set) proven directly against resolveLedgerTargetDisplay — the same
 * function ProteinLedgerProgress uses internally, per
 * protein-ledger-logic.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveLedgerTargetDisplay } from '../lib/protein/ledger';
import type { ProteinSetupState } from '../app/actions/protein';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PAGE = source('app/food-lens/page.tsx');
const BANNER = source('components/food-lens/PrimalPatternSetupBanner.tsx');
const PROGRESS = source('components/protein-ledger/ProteinLedgerProgress.tsx');

describe('Food Lens page: subheading swap', () => {
  it('has the new headline and supporting line', () => {
    expect(PAGE).toContain('One number we count. Everything else, we coach.');
    expect(PAGE).toContain(
      'However you&apos;d like to log it, Root walks through what actually matters, never a'
    );
  });

  it('the old copy is gone', () => {
    expect(PAGE).not.toContain('Meal coaching, not counting');
  });

  it('keeps the FOOD LENS eyebrow and the locked subhead contrast color', () => {
    expect(PAGE).toContain('Food Lens');
    expect(PAGE).toContain('text-[15px] leading-relaxed text-[#4F645A]');
  });
});

describe('Food Lens page: Log food section', () => {
  it('has a "Log food" section header', () => {
    expect(PAGE).toContain('Log food');
  });

  it('Scan a Meal is a standalone full-width primary tile, not part of the compact grid', () => {
    expect(PAGE).toContain('PRIMARY_ENTRY_OPTION');
    expect(PAGE).toMatch(/PRIMARY_ENTRY_OPTION = \{[^}]*title: 'Scan a Meal'/s);
  });

  it('the remaining four entry methods are compact icon+title tiles with no description sentences', () => {
    expect(PAGE).toContain('COMPACT_ENTRY_OPTIONS');
    expect(PAGE).toMatch(/COMPACT_ENTRY_OPTIONS = \[([\s\S]*?)\];/);
    const match = PAGE.match(/const COMPACT_ENTRY_OPTIONS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const block = match![1]!;
    expect(block).toContain("title: 'Scan a Barcode'");
    expect(block).toContain("title: 'Scan a Label'");
    expect(block).toContain("title: 'Search'");
    expect(block).toContain("title: 'Manual Entry'");
    // No description field on any of the four compact options.
    expect(block).not.toContain('description');
  });

  it('the compact tiles render in a 2x2 grid', () => {
    expect(PAGE).toContain('grid grid-cols-2 gap-3');
    expect(PAGE).toContain('COMPACT_ENTRY_OPTIONS.map(');
  });

  it('every original entry-method destination is still linked from this page', () => {
    expect(PAGE).toContain("'/food-lens/new'");
    expect(PAGE).toContain("'/food-lens/barcode/new'");
    expect(PAGE).toContain("'/food-lens/label/new'");
    expect(PAGE).toContain("'/food-lens/search'");
    expect(PAGE).toContain("'/food-lens/manual/new'");
  });
});

describe('Food Lens page: merged protein card', () => {
  it('renders exactly one merged protein card, always wrapped in a single Link', () => {
    const occurrences = PAGE.split('<ProteinLedgerProgress').length - 1;
    expect(occurrences).toBe(1);
  });

  it('the old separate "Protein ledger" / "Protein target" cards are gone', () => {
    expect(PAGE).not.toContain('Protein ledger');
    expect(PAGE).not.toContain('Protein target');
    expect(PAGE).not.toContain('proteinLedgerSubtitle');
    expect(PAGE).not.toContain('proteinSubtitle');
  });

  // Regression test: the redesign originally gated this Link behind
  // `proteinCardIsTappable` (stage !== 'not_started'), which meant a
  // brand-new member — the single most common state — had zero reachable
  // link to the ledger's own entry lanes (barcode/search/quick-add) from
  // this page. The ledger page itself (app/food-lens/protein/ledger/
  // page.tsx) has never gated on target stage, so this was purely a
  // reachability bug introduced by the redesign, not a deliberate design
  // constraint. Fixed by always wrapping the card, in every stage.
  it('always taps through to the ledger, in every target stage — including before any target is set up', () => {
    expect(PAGE).not.toContain('proteinCardIsTappable');
    expect(PAGE).toContain("<Link href={'/food-lens/protein/ledger' as Route} className=\"mef-press block\">");
    expect(PAGE).toContain('setupLinkIsInteractive={false}');
  });
});

describe('ProteinLedgerProgress: the three required display states', () => {
  it('no target yet -> shows the setup nudge, no target line', () => {
    const display = resolveLedgerTargetDisplay(null);
    expect(display.mode).toBe('not_started');
    expect(display.showSetupNudge).toBe(true);
    expect(display.targetGrams).toBeNull();
  });

  it('target pending coach review -> pending state, never rendered as active', () => {
    const state: ProteinSetupState = { stage: 'pending_review' };
    const display = resolveLedgerTargetDisplay(state);
    expect(display.mode).toBe('pending_review');
    expect(display.showSetupNudge).toBe(false);
    expect(display.targetGrams).toBeNull();
  });

  it('target set -> active mode with real target grams for the progress fill', () => {
    const state: ProteinSetupState = {
      stage: 'active',
      track: 'self_guided',
      activeGrams: 120,
      isCoachEdited: false,
      suggestedRange: null,
    };
    const display = resolveLedgerTargetDisplay(state);
    expect(display.mode).toBe('active');
    expect(display.targetGrams).toBe(120);
  });

  it('the component renders a progress fill bar only in active mode', () => {
    expect(PROGRESS).toContain("display.mode !== 'active'");
    expect(PROGRESS).toContain('<GrowBar');
  });

  it('the pending-review state is shown clearly with its own message', () => {
    expect(PROGRESS).toContain("display.mode === 'pending_review'");
    expect(PROGRESS).toContain('Your coach is still setting up your target');
  });

  it('grams never render with the Cormorant oldstyle-numeral bug (lining-nums forces "0g", not "og")', () => {
    expect(PROGRESS).toContain('[font-variant-numeric:lining-nums]');
  });
});

describe('Food Lens page: Primal Pattern dismissible banner', () => {
  it('the banner only renders when no pattern has been set — no space taken once completed', () => {
    expect(PAGE).toContain('{!pattern && <PrimalPatternSetupBanner />}');
  });

  it('the old permanent Primal Pattern card is gone from the main page', () => {
    expect(PAGE).not.toContain("pattern ? pattern.pattern_label : 'Set your Primal Pattern target'");
  });

  it('dismissal is session-scoped (sessionStorage), not permanent (no localStorage read/write)', () => {
    expect(BANNER).toContain('window.sessionStorage.getItem(DISMISS_KEY)');
    expect(BANNER).toContain('window.sessionStorage.setItem(DISMISS_KEY');
    expect(BANNER).not.toMatch(/\blocalStorage\.(get|set)Item/);
  });

  it('closing the banner does not navigate — dismiss is a distinct control from the setup link', () => {
    expect(BANNER).toMatch(/aria-label="Dismiss"/);
    expect(BANNER).toContain("sessionStorage.setItem(DISMISS_KEY, '1')");
  });

  it('the setup link still points at the real Primal Pattern setup flow', () => {
    expect(BANNER).toContain("href={'/food-lens/pattern' as Route}");
  });
});

describe('Food Lens page: unchanged section order', () => {
  it('utility row, then Your Week in Food, then Your recent scans, in that order', () => {
    const utilityIdx = PAGE.indexOf("Today&apos;s food log");
    const weekIdx = PAGE.indexOf('Your Week in Food');
    const scansIdx = PAGE.indexOf('Your recent scans');
    expect(utilityIdx).toBeGreaterThan(-1);
    expect(weekIdx).toBeGreaterThan(utilityIdx);
    expect(scansIdx).toBeGreaterThan(weekIdx);
  });

  it('all four utility destinations are still present', () => {
    expect(PAGE).toContain("'/food-lens/log'");
    expect(PAGE).toContain("'/food-lens/preferences'");
    expect(PAGE).toContain("'/food-lens/pantry'");
    expect(PAGE).toContain("'/food-lens/restaurant/new'");
  });

  it('no vendor names were introduced', () => {
    expect(PAGE.toLowerCase()).not.toMatch(/openai|usda|edamam|nutritionix|spoonacular/);
  });
});
