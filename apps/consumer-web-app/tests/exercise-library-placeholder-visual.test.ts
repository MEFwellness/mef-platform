import { describe, it, expect } from 'vitest';
import { getPlaceholderVisual } from '../lib/exercise-library/placeholderVisual';

describe('getPlaceholderVisual', () => {
  it('is deterministic — same exercise always yields the same mark and tone (a member reloading the grid must not see cards reshuffle their look)', () => {
    const exercise = { primaryMuscle: 'quads', category: 'legs' };
    const first = getPlaceholderVisual(exercise);
    const second = getPlaceholderVisual({ ...exercise });
    expect(second).toEqual(first);
  });

  it('maps primary muscle to the matching body region mark — reuses bodyRegions.ts, no new muscle vocabulary invented', () => {
    expect(getPlaceholderVisual({ primaryMuscle: 'quads', category: null }).mark).toBe('lower_body');
    expect(getPlaceholderVisual({ primaryMuscle: 'chest', category: null }).mark).toBe('upper_body');
    expect(getPlaceholderVisual({ primaryMuscle: 'abs', category: null }).mark).toBe('core');
    expect(getPlaceholderVisual({ primaryMuscle: 'full_body', category: null }).mark).toBe('full_body');
  });

  it('falls back to the default mark for a null or unrecognized muscle, never throwing', () => {
    expect(getPlaceholderVisual({ primaryMuscle: null, category: null }).mark).toBe('default');
    expect(getPlaceholderVisual({ primaryMuscle: 'not-a-real-muscle-xyz', category: null }).mark).toBe('default');
  });

  it('tone is always one of the four brand-palette variants', () => {
    const categories = ['legs', 'chest', 'core', 'back', 'yoga', 'cardio', 'strength', null];
    for (const category of categories) {
      const { tone } = getPlaceholderVisual({ primaryMuscle: null, category });
      expect([0, 1, 2, 3]).toContain(tone);
    }
  });

  it('tone varies across categories — a results grid does not render one repeated tile (non-vacuous: checked against exercise_catalog\'s real production category vocabulary, which spreads across all 4 tones, not just one)', () => {
    const realCategories = [
      'core',
      'legs',
      'strength',
      'full body',
      'yoga',
      'chest',
      'arms',
      'back',
      'shoulders',
      'cardio',
    ];
    const tones = new Set(realCategories.map((category) => getPlaceholderVisual({ primaryMuscle: null, category }).tone));
    expect(tones.size).toBeGreaterThan(1);
  });

  it('two exercises sharing a muscle group but different categories can still get different tones (mark and tone vary independently)', () => {
    const a = getPlaceholderVisual({ primaryMuscle: 'chest', category: 'strength' });
    const b = getPlaceholderVisual({ primaryMuscle: 'chest', category: 'yoga' });
    expect(a.mark).toBe(b.mark);
    expect(a.tone).not.toBe(b.tone);
  });
});
