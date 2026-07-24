import { describe, it, expect } from 'vitest';
import {
  PRIMARY_CONCERN_PRIORITY,
  contextNoteFor,
  reorderOnboardingQuestions,
  transitionLineFor,
} from '../lib/onboarding/branching';
import type { OnboardingQuestion } from '@mef/shared-types-contracts';

const QUESTION_KEYS = [
  'primary_concern',
  'baseline_sleep_quality',
  'baseline_sleep_hours',
  'baseline_stress_level',
  'baseline_energy_level',
  'baseline_digestion',
  'baseline_pain_areas',
  'baseline_movement_frequency',
  'baseline_goals',
  'readiness_importance',
  'readiness_confidence',
  'readiness_actively_working',
];

function question(key: string, overrides: Partial<OnboardingQuestion> = {}): OnboardingQuestion {
  return {
    id: key,
    question_key: key,
    assessment_version_id: 'v1',
    question_version: 1,
    display_order: QUESTION_KEYS.indexOf(key) + 1,
    prompt_text: key,
    answer_type: 'numeric',
    allowed_values: null,
    domain: 'all',
    allows_not_sure: false,
    allows_not_applicable: false,
    allows_prefer_not_to_answer: false,
    ...overrides,
  };
}

const ALL_QUESTIONS = QUESTION_KEYS.map((key) => question(key));

describe('reorderOnboardingQuestions', () => {
  it('is a true no-op for a concern with an empty priority list', () => {
    const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, 'sleep');
    expect(reordered.map((q) => q.question_key)).toEqual(QUESTION_KEYS);
  });

  it('is a true no-op for an unknown/null/undefined concern', () => {
    expect(reorderOnboardingQuestions(ALL_QUESTIONS, null).map((q) => q.question_key)).toEqual(
      QUESTION_KEYS
    );
    expect(reorderOnboardingQuestions(ALL_QUESTIONS, undefined).map((q) => q.question_key)).toEqual(
      QUESTION_KEYS
    );
    expect(
      reorderOnboardingQuestions(ALL_QUESTIONS, 'not_a_real_concern').map((q) => q.question_key)
    ).toEqual(QUESTION_KEYS);
  });

  it('pulls the mapped question(s) to immediately follow primary_concern', () => {
    const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, 'stress');
    expect(reordered.map((q) => q.question_key).slice(0, 2)).toEqual([
      'primary_concern',
      'baseline_digestion',
    ]);
  });

  it('pulls multiple mapped questions forward in priority order', () => {
    const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, 'energy');
    expect(reordered.map((q) => q.question_key).slice(0, 3)).toEqual([
      'primary_concern',
      'baseline_energy_level',
      'baseline_movement_frequency',
    ]);
  });

  it.each(Object.keys(PRIMARY_CONCERN_PRIORITY))(
    'never drops, duplicates, or adds a question for concern "%s"',
    (concern) => {
      const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, concern);
      expect(reordered).toHaveLength(ALL_QUESTIONS.length);
      expect(new Set(reordered.map((q) => q.question_key)).size).toBe(QUESTION_KEYS.length);
      expect(new Set(reordered.map((q) => q.question_key))).toEqual(new Set(QUESTION_KEYS));
    }
  );

  it('keeps primary_concern first even when its priority list references itself', () => {
    const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, 'pain');
    expect(reordered[0]?.question_key).toBe('primary_concern');
  });

  it.each(['healthy_aging', 'general_optimization', 'other'])(
    'now forwards at least one question for concern "%s" (previously a no-op)',
    (concern) => {
      const reordered = reorderOnboardingQuestions(ALL_QUESTIONS, concern);
      expect(reordered[1]?.question_key).toBe(PRIMARY_CONCERN_PRIORITY[concern]?.[0]);
    }
  );
});

describe('contextNoteFor', () => {
  it('returns null when there is no primary concern yet', () => {
    expect(contextNoteFor(null, 'baseline_digestion')).toBeNull();
    expect(contextNoteFor(undefined, 'baseline_digestion')).toBeNull();
  });

  it('returns null for sleep, which never forwards a question', () => {
    expect(contextNoteFor('sleep', 'baseline_sleep_quality')).toBeNull();
  });

  it('returns a note only for the first question a concern forwards', () => {
    expect(contextNoteFor('stress', 'baseline_digestion')).toEqual(expect.any(String));
    expect(contextNoteFor('stress', 'baseline_energy_level')).toBeNull();
  });

  it.each(
    Object.entries(PRIMARY_CONCERN_PRIORITY).filter(([, keys]) => keys.length > 0)
  )('returns a non-empty note for concern "%s"', (concern) => {
    const firstForwarded = PRIMARY_CONCERN_PRIORITY[concern]![0]!;
    expect(contextNoteFor(concern, firstForwarded)!.length).toBeGreaterThan(0);
  });
});

describe('transitionLineFor', () => {
  it.each(Object.keys(PRIMARY_CONCERN_PRIORITY))(
    'returns a non-empty line for concern "%s"',
    (concern) => {
      expect(transitionLineFor(concern).length).toBeGreaterThan(0);
    }
  );

  it('falls back to a defined line for unknown/null/undefined concerns', () => {
    expect(transitionLineFor(null).length).toBeGreaterThan(0);
    expect(transitionLineFor(undefined).length).toBeGreaterThan(0);
    expect(transitionLineFor('not_a_real_concern').length).toBeGreaterThan(0);
  });
});
