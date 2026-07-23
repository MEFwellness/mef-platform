/**
 * Unit tests for the Question Generator (Prompt 13) — pure, coach-facing
 * only. Confirms every conversation type has questions, they reference the
 * real topic label (never generic filler with no context), and the result
 * is capped at 2 so the Coach Workspace never dumps a wall of questions.
 */
import { describe, it, expect } from 'vitest';
import { generateQuestionsForCandidate } from '../lib/root-coaching-engine/questions';
import type { ConversationType } from '../lib/root-coaching-engine/types';

const ALL_TYPES: ConversationType[] = [
  'first_observation',
  'repeated_signal',
  'improving_trend',
  'worsening_trend',
  'conflicting_information',
  'new_assessment_available',
  'reassessment',
  'experiment_follow_up',
  'experiment_success',
  'experiment_unsuccessful',
];

describe('generateQuestionsForCandidate', () => {
  it.each(ALL_TYPES)('%s returns 1-2 questions, at least one referencing the real topic label', (type) => {
    const questions = generateQuestionsForCandidate(type, 'your sleep', 'seed-a');
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(2);
    expect(questions.some((q) => q.includes('your sleep'))).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const a = generateQuestionsForCandidate('improving_trend', 'your mood', 'topic::1');
    const b = generateQuestionsForCandidate('improving_trend', 'your mood', 'topic::1');
    expect(a).toEqual(b);
  });
});
