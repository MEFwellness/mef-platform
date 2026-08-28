/**
 * The Latent section of docs/BUG_SWEEP_2026-08-27.md, each item held at
 * whatever closed it.
 *
 * L1 (six components formatting an instant in the runtime's own zone) is
 * closed by tests/member-dates-hydration.test.tsx and by the repo rule in
 * tests/no-unpinned-dates-guard.test.ts, so it is not repeated here.
 *
 * L4 (the daily scan proposing a reassessment of something never assessed)
 * is closed by tests/reassessment-intelligence.test.ts's "nothing is ever
 * reassessed that was never assessed", written when A1 was fixed.
 *
 * L2 and L3 are here.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { findingDisplayName } from '@/lib/naming/findingNames';

// ---------------------------------------------------------------------------
// L2 — the four stored labels with an em dash
// ---------------------------------------------------------------------------

describe('L2 — a stored label with an em dash cannot reach a screen', () => {
  const migration = readFileSync(
    '../../supabase/migrations/00000000000188_catalog_em_dashes.sql',
    'utf8'
  );

  it('the display layer never prints the stored label for either code', () => {
    // This is the reason the four rows were latent rather than live, and it
    // is a stronger guard than their `superseded` status, which could change.
    expect(findingDisplayName('movement', 'pain_hips', 'Discomfort — hips')).toBe(
      'Hip discomfort you reported'
    );
    expect(findingDisplayName('movement', 'pain_lower_back', 'Discomfort — lower back')).toBe(
      'Lower back discomfort you reported'
    );
  });

  it('and the stored text is repaired to say the same thing', () => {
    expect(migration).toContain("set label = 'Hip discomfort you reported'");
    expect(migration).toContain("set label = 'Lower back discomfort you reported'");
    expect(migration).toContain('registry_entries');
  });

  it('the migration refuses to report success over a remaining em dash', () => {
    expect(migration).toContain('still carry an em dash');
    expect(migration).toContain('raise exception');
  });
});

// ---------------------------------------------------------------------------
// L3 — a page render must not write a row
// ---------------------------------------------------------------------------

describe('L3 — opening an exercise is recorded by opening it, not by rendering it', () => {
  const page = readFileSync('app/exercises/[id]/page.tsx', 'utf8');

  it('the page no longer writes while rendering', () => {
    expect(page).not.toContain("from '@/lib/exercise-library/recentViews'\n");
    expect(page).not.toMatch(/recordExerciseView\(\s*supabase/);
  });

  it('it renders the tracker instead', () => {
    expect(page).toContain('<TrackExerciseView');
  });

  it('and the tracker fires exactly once, even through a double mount', async () => {
    const calls: string[] = [];
    vi.doMock('@/app/actions/exercise-library', () => ({
      recordExerciseView: async (externalId: string) => {
        calls.push(externalId);
        return {};
      },
    }));
    const { TrackExerciseView } = await import(
      '@/components/exercise-library/TrackExerciseView'
    );
    // Server-rendered, the effect never runs, so a prefetch writes nothing.
    const html = renderToStaticMarkup(
      <TrackExerciseView externalId="ex-1" exerciseName="Hip Hinge" />
    );
    expect(html).toBe('');
    expect(calls).toEqual([]);
    vi.doUnmock('@/app/actions/exercise-library');
  });
});
