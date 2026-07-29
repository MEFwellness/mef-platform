import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), 'utf-8');
}

function stripLeadingDocComment(source: string): string {
  return source.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
}

describe('"What We\'re Noticing" card headline — no longer names one assessment', () => {
  // Confirmed live: the card's content pulls from ANY active,
  // member-visible registry finding regardless of source
  // (onboarding baseline, body assessment, questionnaire, food lens,
  // wearable, primal pattern, unified assessment — see
  // registry_entries_source_feature_check) — never specifically the
  // Four Doctors assessment. There was no dynamic source-selection logic
  // to fix, just a flat hardcoded string naming one possible source.
  it('does not hardcode a single named assessment as the headline', () => {
    const card = read('../components/dashboard/WhatWereNoticingCard.tsx');
    expect(card).not.toMatch(/headline="Four Doctors Assessment"/);
    expect(stripLeadingDocComment(card)).not.toMatch(/Four Doctors Assessment/);
  });
});

describe('Dashboard "What Root Is Noticing" carousel — position affordance', () => {
  const dashboardSource = read('../app/dashboard/page.tsx');
  const carouselSource = read('../components/carousel/ScrollCarousel.tsx');

  it('wraps the four carousel cards in the shared ScrollCarousel, not a hand-rolled scroll div', () => {
    expect(dashboardSource).toMatch(/<ScrollCarousel>/);
    expect(dashboardSource).not.toMatch(
      /flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5/
    );
  });

  it('ScrollCarousel renders a position indicator that reflects real DOM children, not a static count', () => {
    expect(carouselSource).toMatch(/role="tablist"/);
    expect(carouselSource).toMatch(/MutationObserver/);
    // The count must come from the live scroll container's children, not
    // React's `children` prop count — a card can resolve to `null` after
    // Suspense settles (dashboard/page.tsx's own "no gap, no placeholder"
    // convention), which a static children-count would get wrong.
    expect(carouselSource).toMatch(/el\.children/);
  });

  it('updates the active dot on scroll and on DOM mutation (Suspense settling)', () => {
    expect(carouselSource).toMatch(/addEventListener\('scroll', measure/);
    expect(carouselSource).toMatch(/observer\.observe\(container, \{ childList: true \}\)/);
  });
});

describe('BackButton — real back navigation instead of a fixed forward Link', () => {
  // Confirmed live: "Back to Dashboard" was a plain
  // `<Link href="/dashboard">` — a forward push navigation to a NEW URL,
  // not the browser's actual back navigation. Next.js scrolls a pushed
  // page to the top by default (correct behavior for "new page"), which
  // is exactly why it looked like "back" reset her scroll position, while
  // the browser's own native back button/gesture (confirmed separately,
  // via page.goBack()) already preserved scroll correctly. The fix is not
  // new: components/BackButton.tsx already exists, already solves this
  // (`router.back()`, falling back to a fixed href only when there's no
  // in-app history), and is already used on 28 other pages — these five
  // just hadn't been converted.
  const pagesExpectedToUseBackButton = [
    '../app/noticing/page.tsx',
    '../app/root-map/page.tsx',
    '../app/recommendations/page.tsx',
    '../app/case/page.tsx',
    '../app/root-score/page.tsx',
  ];

  it.each(pagesExpectedToUseBackButton)('%s uses the shared BackButton, not a hardcoded Link', (relativePath) => {
    const source = read(relativePath);
    expect(source).toMatch(/<BackButton fallbackHref="\/dashboard" label="Back to Dashboard" \/>/);
    expect(source).not.toMatch(/>\s*Back to Dashboard\s*<\/Link>/);
  });

  it('components/BackButton.tsx itself is unchanged (reused, not forked)', () => {
    expect(existsSync(path.resolve(__dirname, '../components/BackButton.tsx'))).toBe(true);
    const backButton = read('../components/BackButton.tsx');
    expect(backButton).toMatch(/router\.back\(\)/);
    expect(backButton).toMatch(/window\.history\.length > 1/);
  });
});
