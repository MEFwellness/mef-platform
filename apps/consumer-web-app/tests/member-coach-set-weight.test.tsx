/**
 * WHAT SHE READS WHEN HER COACH HAS SET A WEIGHT, and what she reads when
 * he has not.
 *
 * The second half matters as much as the first. Every program in existence
 * before migration 178 carries no prescribed weight, so the field she has
 * been using since Prompt 7 must render exactly as it did: no new line, no
 * new number, nothing about a coach. The new line appears only where a
 * coach has approved a draft with a number on it.
 *
 * Rendered, not grepped. The assertions are on the HTML a member's browser
 * would receive.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CoachAssignedWorkoutExercise } from '@mef/shared-types-contracts';

vi.mock('@/app/actions/exercise-feedback', () => ({
  // The prefill is a read that happens after paint. Server rendering never
  // reaches it, which is exactly the state this test is asserting on.
  getLoggedWeightPrefillAction: async () => null,
  logExerciseWeightAction: async () => ({}),
}));

import { ExerciseWeightField } from '../components/coach-program-builder/ExerciseWeightField';

type FieldExercise = Pick<
  CoachAssignedWorkoutExercise,
  'id' | 'unilateral' | 'load' | 'load_unit' | 'logged_load' | 'logged_load_unit' | 'logged_load_per_side'
>;

function field(overrides: Partial<FieldExercise> = {}): string {
  const exercise: FieldExercise = {
    id: 'exercise-1',
    unilateral: false,
    load: null,
    load_unit: null,
    logged_load: null,
    logged_load_unit: null,
    logged_load_per_side: false,
    ...overrides,
  };
  return renderToStaticMarkup(<ExerciseWeightField exercise={exercise} />);
}

describe('no coach-set weight: exactly what Prompt 7 shipped', () => {
  it('says nothing about a coach and prefills nothing', () => {
    const html = field();
    expect(html).not.toContain('Your coach set');
    expect(html).not.toContain('data-coach-set-load');
    expect(html).toContain('Weight used');
    expect(html).toContain('placeholder="Optional"');
    expect(html).toContain(
      'Log the weight you used. It helps your coach and the app plan your next weeks just right for you.'
    );
    // The input opens empty.
    expect(html).toMatch(/id="weight-exercise-1"[^>]*value=""/);
  });

  it('a load column holding a word rather than a number is not a target', () => {
    for (const load of ['bodyweight', 'red band', '', '   ', '0']) {
      const html = field({ load });
      expect(html, load).not.toContain('Your coach set');
    }
  });
});

describe('a coach-set weight', () => {
  it('says whose number it is, and opens the field on it', () => {
    const html = field({ load: '25', load_unit: 'lbs' });
    expect(html).toContain('data-coach-set-load="true"');
    expect(html).toContain('Your coach set: 25 lbs');
    expect(html).toMatch(/id="weight-exercise-1"[^>]*value="25"/);
  });

  it('says per side when the exercise is per side', () => {
    const html = field({ load: '15', load_unit: 'lbs', unilateral: true });
    expect(html).toContain('Your coach set: 15 lbs per side');
  });

  it('reads in kilos when that is what the coach set', () => {
    const html = field({ load: '12.5', load_unit: 'kg' });
    expect(html).toContain('Your coach set: 12.5 kg');
  });

  it('does not overwrite a weight she has already logged today', () => {
    const html = field({ load: '25', load_unit: 'lbs', logged_load: 22.5, logged_load_unit: 'lbs' });
    expect(html).toMatch(/id="weight-exercise-1"[^>]*value="22.5"/);
    // And it still tells her what her coach asked for.
    expect(html).toContain('Your coach set: 25 lbs');
  });

  it('is still optional, and still says nothing about being required', () => {
    const html = field({ load: '25', load_unit: 'lbs' });
    expect(html).not.toContain('required');
    expect(html).toContain('placeholder="Optional"');
  });

  it('uses no em dash anywhere', () => {
    const html = field({ load: '25', load_unit: 'lbs', unilateral: true });
    expect(html).not.toContain('—');
    expect(html).not.toContain('–');
  });
});
