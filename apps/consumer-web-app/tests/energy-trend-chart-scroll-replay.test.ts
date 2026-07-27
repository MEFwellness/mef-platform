/**
 * Animation task (2026-07-27), item 1: the Energy Trend chart's line
 * draw-in used to fire once on mount, regardless of scroll position — if
 * it was below the fold at page load, the animation had already
 * finished, unseen, before the member scrolled to it. Now it replays
 * every time the card enters the viewport.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source,
 * same discipline as the other animation/scale tests in this suite. The
 * real no-flicker/no-replay-while-visible/reduced-motion behavior is
 * verified live via Playwright, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const ANIMATED_CHART = source('components/dashboard/AnimatedEnergyTrendChart.tsx');
const REVEAL_ON_SCROLL = source('components/dashboard/RevealOnScroll.tsx');
const DASHBOARD_PAGE = source('app/dashboard/page.tsx');

describe('AnimatedEnergyTrendChart: replays on every scroll into view, not just once on mount', () => {
  it('uses its own IntersectionObserver, not a plain mount-time requestAnimationFrame', () => {
    expect(ANIMATED_CHART).toContain('new IntersectionObserver(');
    expect(ANIMATED_CHART).not.toContain('requestAnimationFrame(');
  });

  it('resets to not-drawn when the card is no longer intersecting (the "scrolls out of view" reset)', () => {
    expect(ANIMATED_CHART).toMatch(/if \(!entry\.isIntersecting && current\) return false;/);
  });

  it('replays (sets drawn) when the card starts intersecting again', () => {
    expect(ANIMATED_CHART).toMatch(/if \(entry\.isIntersecting && !current\) return true;/);
  });

  it('does not update state when the intersection state has not actually changed — the guard against replaying while already fully on screen', () => {
    // The third branch of the reducer-style setDrawn callback must be a
    // no-op (`return current`), not fall through to an unconditional set.
    expect(ANIMATED_CHART).toMatch(/return current;\s*\n\s*}\);/);
  });

  it('observes with a single fixed threshold — no threshold array, no scroll-linked continuous updates, which is what keeps it from flickering on a slow or reversed scroll', () => {
    expect(ANIMATED_CHART).toContain('REPLAY_THRESHOLD');
    expect(ANIMATED_CHART).toMatch(/threshold:\s*REPLAY_THRESHOLD/);
    expect(ANIMATED_CHART).not.toMatch(/threshold:\s*\[/);
  });

  it('the observer is never disconnected inside the callback itself — only the effect cleanup (unmount) disconnects it, unlike RevealOnScroll\'s one-shot disconnect-on-reveal', () => {
    const callbackStart = ANIMATED_CHART.indexOf('(entries) => {');
    const callbackEnd = ANIMATED_CHART.indexOf('{ threshold: REPLAY_THRESHOLD }');
    const callbackBody = ANIMATED_CHART.slice(callbackStart, callbackEnd);
    expect(callbackBody).not.toContain('disconnect');
    // Only the effect's own cleanup function disconnects it.
    expect(ANIMATED_CHART).toMatch(/return \(\) => observer\.disconnect\(\);/);
  });

  it('skips the observer and the clip-path style entirely under prefers-reduced-motion, rendering the finished chart', () => {
    expect(ANIMATED_CHART).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    expect(ANIMATED_CHART).toMatch(/if \(reduced\) {\s*\n\s*setDrawn\(true\);\s*\n\s*return;/);
    expect(ANIMATED_CHART).toMatch(/reducedMotion\s*\n?\s*\?\s*undefined/);
  });

  it('only transitions on the way in (drawn) — resetting closed is instant, avoiding a visible "wipe closed" flicker at the scroll boundary', () => {
    expect(ANIMATED_CHART).toMatch(/transition:\s*drawn\s*\?\s*'clip-path 1\.1s ease-out'\s*:\s*'none'/);
  });

  it('passes showBars to the underlying chart (item 2 wired into the Home instance)', () => {
    expect(ANIMATED_CHART).toMatch(/<EnergyTrendChart checkins={checkins} showBars \/>/);
  });
});

describe('RevealOnScroll: untouched — still a one-shot reveal, shared by every other Home section', () => {
  it('still disconnects after the first reveal (reveal-once behavior preserved)', () => {
    expect(REVEAL_ON_SCROLL).toContain('observer.disconnect()');
    expect(REVEAL_ON_SCROLL).toContain('setVisible(true)');
  });

  it('does not import or reference the Energy Trend chart\'s replay logic — no shared state between the two mechanisms', () => {
    expect(REVEAL_ON_SCROLL).not.toContain('EnergyTrendChart');
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
