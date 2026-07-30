import { describe, it, expect } from 'vitest';
import { matchExercise, normalizeExerciseName, type MatchCandidate } from '../lib/your-move/matching';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'ym-1',
    title: 'Barbell Squat',
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes'],
    hasVideo: true,
    ...overrides,
  };
}

describe('normalizeExerciseName', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeExerciseName('Barbell  Bench-Press (Flat)')).toBe('barbell bench press flat');
  });
});

describe('matchExercise', () => {
  it('confidently matches an exact name, case/punctuation-insensitive', () => {
    const result = matchExercise('Barbell Squat', ['quadriceps'], [candidate({ title: 'Barbell Squat' })]);
    expect(result.status).toBe('confident');
  });

  it('never confidently matches a similar-but-different movement — Barbell Squat vs Barbell Split Squat', () => {
    const result = matchExercise(
      'Barbell Squat',
      ['quadriceps'],
      [candidate({ id: 'ym-2', title: 'Barbell Split Squat' })]
    );
    expect(result.status).toBe('near_miss');
    if (result.status === 'near_miss') {
      expect(result.reasoning).toMatch(/split/i);
      expect(result.reasoning).toMatch(/movement/i);
    }
  });

  it('rejects as near-miss (not confident) when only equipment differs', () => {
    const result = matchExercise(
      'Barbell Row',
      ['back'],
      [candidate({ id: 'ym-3', title: 'Dumbbell Row' })]
    );
    expect(result.status).toBe('near_miss');
  });

  it('never near-misses two unrelated single-word names just because both are one token — real bug found against production data', () => {
    const result = matchExercise('Adductor', ['adductors'], [candidate({ id: 'ym-8', title: 'Burpee' })]);
    expect(result.status).toBe('unmatched');
  });

  it('reports unmatched when nothing is even close', () => {
    const result = matchExercise(
      'Nordic Hamstring Curl',
      ['hamstrings'],
      [candidate({ id: 'ym-4', title: 'Overhead Triceps Extension' })]
    );
    expect(result.status).toBe('unmatched');
  });

  it('reports unmatched when the only candidates have no video (never matches to a video-less Your Move entry)', () => {
    const result = matchExercise(
      'Barbell Squat',
      ['quadriceps'],
      [candidate({ title: 'Barbell Squat', hasVideo: false })]
    );
    expect(result.status).toBe('unmatched');
  });

  it('picks the exact match even when other close-but-wrong candidates are also present', () => {
    const result = matchExercise('Barbell Squat', ['quadriceps'], [
      candidate({ id: 'ym-5', title: 'Barbell Split Squat' }),
      candidate({ id: 'ym-6', title: 'Barbell Squat' }),
      candidate({ id: 'ym-7', title: 'Barbell Front Squat' }),
    ]);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') expect(result.candidate.id).toBe('ym-6');
  });

  it('is insensitive to whether muscle-group corroboration is present, but notes it in reasoning', () => {
    const withOverlap = matchExercise('Barbell Squat', ['quads'], [candidate({ muscleGroup: 'quads' })]);
    const withoutOverlap = matchExercise('Barbell Squat', ['back'], [candidate({ muscleGroup: 'quads' })]);
    expect(withOverlap.status).toBe('confident');
    expect(withoutOverlap.status).toBe('confident');
  });
});
