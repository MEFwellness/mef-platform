/**
 * Guard test for /progress's Suspense streaming restructure (2026-07-29
 * follow-up, "make /progress feel instant" Part 1). app/progress/page.tsx
 * is a real Next.js Server Component (top-level `redirect()`/cookies-
 * based auth) — it can't be rendered in vitest either (same constraint
 * documented in tests/setup/test-clients.ts), so this is a source-scan
 * guard: it asserts the specific restructure that makes streaming work is
 * in place — the two slow engines (Wellness Story/recalculateIntelligenceCore,
 * Wellness Patterns/recalculateWellnessIntelligence) and the new
 * Recommendations section are each read inside their own component, never
 * inside the page's own top-level Promise.all, and each is wrapped in its
 * own <Suspense> boundary.
 *
 * Non-vacuous by construction: run this against the pre-restructure
 * version of page.tsx (git stash) and it fails, because the very thing it
 * checks for absence of (the two slow calls back in the main batch) is
 * exactly what was there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const source = readFileSync(path.join(APP_ROOT, 'app/progress/page.tsx'), 'utf-8');

describe('/progress — slow sections stream independently instead of blocking the page', () => {
  it('does not call getMyWellnessStorySummary or getMyWellnessPatterns directly on the page', () => {
    expect(source).not.toMatch(/getMyWellnessStorySummary\s*\(/);
    expect(source).not.toMatch(/getMyWellnessPatterns\s*\(/);
  });

  it('wraps WellnessStorySection in its own Suspense boundary', () => {
    expect(source).toMatch(/<Suspense fallback=\{<WellnessStorySectionSkeleton \/>\}>\s*<WellnessStorySection \/>\s*<\/Suspense>/);
  });

  it('wraps WellnessPatternsSection in its own Suspense boundary', () => {
    expect(source).toMatch(
      /<Suspense fallback=\{<WellnessPatternsSectionSkeleton \/>\}>\s*<WellnessPatternsSection \/>\s*<\/Suspense>/
    );
  });

  it('wraps the new RecommendationsSection in its own Suspense boundary', () => {
    expect(source).toMatch(
      /<Suspense fallback=\{<RecommendationsSectionSkeleton \/>\}>\s*<RecommendationsSection \/>\s*<\/Suspense>/
    );
  });

  it('the main Promise.all batch no longer includes the two slow engines', () => {
    // The batch is followed by a one-line `shows` helper now (Visibility
    // Layer, 2026-08-17), so this anchors on the batch's own closing rather
    // than on whatever happens to be the next statement.
    const batchMatch = source.match(/await Promise\.all\(\[([\s\S]*?)\n  \]\);/);
    expect(batchMatch).not.toBeNull();
    expect(batchMatch![1]).not.toMatch(/getMyWellnessStorySummary|getMyWellnessPatterns/);
  });
});

describe('Recommendations section reads the precomputed result, not a live compute', () => {
  const sectionSource = readFileSync(
    path.join(APP_ROOT, 'app/progress/RecommendationsSection.tsx'),
    'utf-8'
  );

  it('calls getMyRecommendationsWithFreshness (the staleness-aware read), not getMyRecommendations directly', () => {
    expect(sectionSource).toMatch(/getMyRecommendationsWithFreshness\s*\(/);
  });
});
