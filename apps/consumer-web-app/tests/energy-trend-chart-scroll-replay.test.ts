/**
 * Animation task (2026-07-27), item 1: the Energy Trend chart's line
 * draw-in used to fire once on mount, regardless of scroll position — if
 * it was below the fold at page load, the animation had already
 * finished, unseen, before the member scrolled to it. Now it replays
 * every time the card enters the viewport.
 *
 * Follow-up task (2026-07-27, same day, "Your Wellness Story" gets the
 * Home treatment): the observer/clip-path/reduced-motion mechanism that
 * used to live entirely inside AnimatedEnergyTrendChart.tsx was lifted
 * out, unchanged in behavior, into the shared components/ScrollDrawIn.tsx
 * — so the Progress page's Root Score chart could reuse the exact same
 * scroll-watcher instead of a second implementation. The mechanism
 * assertions below now target ScrollDrawIn.tsx (where the logic actually
 * lives); AnimatedEnergyTrendChart.tsx is checked separately for
 * correctly delegating to it rather than duplicating it.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source,
 * same discipline as the other animation/scale tests in this suite. The
 * real no-flicker/no-replay-while-visible/reduced-motion behavior is
 * verified live via Playwright, reported separately.
 *
 * Trend-chart range-selector task (2026-07-28): ScrollDrawIn gained an
 * optional `resetKey` prop so switching the 1-week/2-week/1-month range
 * pills re-animates the chart without needing a scroll crossing —
 * assertions for that addition are in their own describe block below. The
 * "not a plain mount-time requestAnimationFrame" assertion is updated: rAF
 * now legitimately appears, but only inside the resetKey effect (to
 * re-trigger the CSS transition), never as a substitute for the
 * IntersectionObserver-driven scroll reveal itself.
 *
 * AnimatedEnergyTrendChart.tsx no longer renders EnergyTrendChart or
 * ScrollDrawIn directly — it was rebuilt onto the shared
 * components/TrendChartCard.tsx (which itself wraps components/TrendChart.tsx
 * in ScrollDrawIn). The assertions checking its wiring are updated to
 * match; ScrollDrawIn's own mechanism (this file's main subject) is
 * unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const SCROLL_DRAW_IN = source('components/ScrollDrawIn.tsx');
const ANIMATED_CHART = source('components/dashboard/AnimatedEnergyTrendChart.tsx');
const REVEAL_ON_SCROLL = source('components/dashboard/RevealOnScroll.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');

describe('ScrollDrawIn: replays on every scroll into view, not just once on mount', () => {
  it('uses its own IntersectionObserver for the scroll reveal — not a plain mount-time trigger', () => {
    expect(SCROLL_DRAW_IN).toContain('new IntersectionObserver(');
  });

  it('resets to not-drawn when the card is no longer intersecting (the "scrolls out of view" reset)', () => {
    expect(SCROLL_DRAW_IN).toMatch(/if \(!entry\.isIntersecting && current\) return false;/);
  });

  it('replays (sets drawn) when the card starts intersecting again', () => {
    expect(SCROLL_DRAW_IN).toMatch(/if \(entry\.isIntersecting && !current\) return true;/);
  });

  it('does not update state when the intersection state has not actually changed — the guard against replaying while already fully on screen', () => {
    // The third branch of the reducer-style setDrawn callback must be a
    // no-op (`return current`), not fall through to an unconditional set.
    expect(SCROLL_DRAW_IN).toMatch(/return current;\s*\n\s*}\);/);
  });

  it('observes with a single fixed threshold — no threshold array, no scroll-linked continuous updates, which is what keeps it from flickering on a slow or reversed scroll', () => {
    expect(SCROLL_DRAW_IN).toContain('REPLAY_THRESHOLD');
    expect(SCROLL_DRAW_IN).toMatch(/threshold:\s*REPLAY_THRESHOLD/);
    expect(SCROLL_DRAW_IN).not.toMatch(/threshold:\s*\[/);
  });

  it('the observer is never disconnected inside the callback itself — only the effect cleanup (unmount) disconnects it, unlike RevealOnScroll\'s one-shot disconnect-on-reveal', () => {
    const callbackStart = SCROLL_DRAW_IN.indexOf('(entries) => {');
    const callbackEnd = SCROLL_DRAW_IN.indexOf('{ threshold: REPLAY_THRESHOLD }');
    const callbackBody = SCROLL_DRAW_IN.slice(callbackStart, callbackEnd);
    expect(callbackBody).not.toContain('disconnect');
    // Only the effect's own cleanup function disconnects it.
    expect(SCROLL_DRAW_IN).toMatch(/return \(\) => observer\.disconnect\(\);/);
  });

  it('skips the observer and the clip-path style entirely under prefers-reduced-motion, rendering the finished chart', () => {
    expect(SCROLL_DRAW_IN).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    expect(SCROLL_DRAW_IN).toMatch(/if \(reduced\) {\s*\n\s*setDrawn\(true\);\s*\n\s*return;/);
    expect(SCROLL_DRAW_IN).toMatch(/reducedMotion\s*\n?\s*\?\s*undefined/);
  });

  it('only transitions on the way in (drawn) — resetting closed is instant, avoiding a visible "wipe closed" flicker at the scroll boundary', () => {
    expect(SCROLL_DRAW_IN).toMatch(/transition:\s*drawn\s*\?\s*'clip-path 1\.1s ease-out'\s*:\s*'none'/);
  });

  it('the known trap is fixed: the observed (outer) element is a plain, unclipped wrapper — the clip-path style lives on a separate inner div, never on containerRef itself', () => {
    const outerDivIdx = SCROLL_DRAW_IN.indexOf('<div ref={containerRef}>');
    expect(outerDivIdx).toBeGreaterThan(-1);
    const outerTagEnd = SCROLL_DRAW_IN.indexOf('>', outerDivIdx);
    // The outer tag itself must carry no style attribute (no clip-path risk on the observed node).
    expect(SCROLL_DRAW_IN.slice(outerDivIdx, outerTagEnd)).not.toContain('style');
    // clipPath is applied further down, on a nested div.
    const clipIdx = SCROLL_DRAW_IN.indexOf('clipPath:');
    expect(clipIdx).toBeGreaterThan(outerTagEnd);
  });
});

describe('AnimatedEnergyTrendChart: delegates to the shared TrendChartCard (which itself delegates to ScrollDrawIn) instead of duplicating any mechanism', () => {
  it('no longer contains its own IntersectionObserver/threshold logic', () => {
    expect(ANIMATED_CHART).not.toContain('new IntersectionObserver(');
    expect(ANIMATED_CHART).not.toContain('REPLAY_THRESHOLD');
  });

  it('no longer imports or renders components/EnergyTrendChart.tsx or components/ScrollDrawIn.tsx directly — both concerns now live in the shared TrendChartCard', () => {
    expect(ANIMATED_CHART).not.toContain("from '@/components/EnergyTrendChart'");
    expect(ANIMATED_CHART).not.toContain("from '@/components/ScrollDrawIn'");
    expect(ANIMATED_CHART).not.toMatch(/<EnergyTrendChart[\s/]/);
    expect(ANIMATED_CHART).not.toMatch(/<ScrollDrawIn[\s>]/);
    expect(ANIMATED_CHART).toContain("import { TrendChartCard } from '@/components/TrendChartCard'");
  });

  it('renders TrendChartCard configured for energy\'s real 1-5 scale, built from real check-in points', () => {
    expect(ANIMATED_CHART).toContain('<TrendChartCard');
    expect(ANIMATED_CHART).toContain('const ENERGY_MIN = 1');
    expect(ANIMATED_CHART).toContain('const ENERGY_MAX = 5');
    expect(ANIMATED_CHART).toContain('c.energy_level');
  });

  it('Home behavior is unchanged from the member\'s point of view: still exported by the same name, from the same file, still what app/dashboard/page.tsx imports', () => {
    expect(ANIMATED_CHART).toContain('export function AnimatedEnergyTrendChart');
    expect(DASHBOARD_PAGE).toContain(
      "import { AnimatedEnergyTrendChart } from '@/components/dashboard/AnimatedEnergyTrendChart'"
    );
  });
});

describe('ScrollDrawIn: resetKey lets a content change (e.g. a range switch) replay the wipe without a scroll crossing', () => {
  it('accepts an optional resetKey prop — a no-op for any caller that omits it', () => {
    expect(SCROLL_DRAW_IN).toMatch(/resetKey\?:\s*string \| number/);
  });

  it('skips the replay entirely on first render — only a real change triggers it', () => {
    expect(SCROLL_DRAW_IN).toContain('isFirstRender');
  });

  it('closes then reopens the clip-path via requestAnimationFrame when resetKey changes, so the CSS transition genuinely restarts', () => {
    const effectIdx = SCROLL_DRAW_IN.indexOf('resetKey === undefined');
    expect(effectIdx).toBeGreaterThan(-1);
    const nearby = SCROLL_DRAW_IN.slice(effectIdx, effectIdx + 300);
    expect(nearby).toContain('setDrawn(false)');
    expect(nearby).toContain('requestAnimationFrame(() => setDrawn(true))');
  });

  it('the resetKey effect bails out under reduced motion, same as the scroll-triggered path', () => {
    const effectIdx = SCROLL_DRAW_IN.indexOf('resetKey === undefined');
    expect(SCROLL_DRAW_IN.slice(effectIdx, effectIdx + 60)).toContain('reducedMotion');
  });
});

describe('RevealOnScroll: untouched — still a one-shot reveal, shared by every other Home section', () => {
  it('still disconnects after the first reveal (reveal-once behavior preserved)', () => {
    expect(REVEAL_ON_SCROLL).toContain('observer.disconnect()');
    expect(REVEAL_ON_SCROLL).toContain('setVisible(true)');
  });

  it('does not import or reference the scroll-draw-in replay logic — no shared state between the two mechanisms', () => {
    expect(REVEAL_ON_SCROLL).not.toContain('ScrollDrawIn');
    expect(REVEAL_ON_SCROLL).not.toContain('REPLAY_THRESHOLD');
  });

  it('the Home dashboard still wraps the Energy Trend section in RevealOnScroll for its own one-time fade/rise entrance', () => {
    const usageIdx = DASHBOARD_PAGE.indexOf('<AnimatedEnergyTrendChart');
    const lastOpenTag = DASHBOARD_PAGE.lastIndexOf('<RevealOnScroll', usageIdx);
    const lastCloseTag = DASHBOARD_PAGE.lastIndexOf('</RevealOnScroll>', usageIdx);
    expect(usageIdx).toBeGreaterThan(-1);
    expect(lastOpenTag).toBeGreaterThan(-1);
    // The nearest preceding RevealOnScroll tag must be an opening one that
    // hasn't already been closed before we reach the chart usage — i.e.
    // the chart genuinely sits inside it.
    expect(lastOpenTag).toBeGreaterThan(lastCloseTag);
  });

  it('RevealOnScroll wraps five other Home sections too — confirming the shared-mechanism check was actually done, not assumed', () => {
    const usageCount = (DASHBOARD_PAGE.match(/<RevealOnScroll/g) ?? []).length;
    expect(usageCount).toBeGreaterThanOrEqual(5);
  });
});
