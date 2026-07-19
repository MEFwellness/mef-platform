/**
 * Primal Pattern Assessment — pure unit tests over lib/primal-pattern/
 * scoring.ts. No Supabase, no mocks: exercises exactly the scenarios the
 * Primal Pattern Assessment Foundation prompt calls out explicitly
 * (Polar / Variable / Equatorial, an exact three-point difference, within
 * two, skipped answers, both-answer selections) plus the questionnaire
 * data's own internal consistency (14 questions, unique numbers 1-14).
 */
import { describe, it, expect } from 'vitest';
import { PRIMAL_PATTERN_QUESTIONNAIRE } from '../lib/primal-pattern/questionnaire';
import {
  classifyPrimalPatternResult,
  scorePrimalPattern,
  totalAnsweredCount,
} from '../lib/primal-pattern/scoring';
import type { PrimalPatternAnswers } from '../lib/primal-pattern/types';

describe('Primal Pattern questionnaire data integrity', () => {
  it('has exactly 14 questions, numbered 1-14 with no gaps or duplicates', () => {
    const numbers = PRIMAL_PATTERN_QUESTIONNAIRE.questions
      .map((q) => q.number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('every question has non-empty A and B option text', () => {
    for (const question of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
      expect(question.optionA.trim().length).toBeGreaterThan(0);
      expect(question.optionB.trim().length).toBeGreaterThan(0);
      expect(question.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it('member-facing content contains no em dash characters', () => {
    for (const question of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
      expect(question.prompt).not.toContain('—');
      expect(question.optionA).not.toContain('—');
      expect(question.optionB).not.toContain('—');
    }
  });
});

describe('classifyPrimalPatternResult', () => {
  it('A exceeds B by exactly 3 -> Polar', () => {
    expect(classifyPrimalPatternResult(7, 4)).toBe('polar');
  });

  it('A exceeds B by more than 3 -> Polar', () => {
    expect(classifyPrimalPatternResult(14, 0)).toBe('polar');
  });

  it('A exceeds B by exactly 2 (within two) -> Variable', () => {
    expect(classifyPrimalPatternResult(6, 4)).toBe('variable');
  });

  it('tie -> Variable', () => {
    expect(classifyPrimalPatternResult(5, 5)).toBe('variable');
  });

  it('0-0 tie (everything skipped) -> Variable', () => {
    expect(classifyPrimalPatternResult(0, 0)).toBe('variable');
  });

  it('B exceeds A by exactly 2 (within two) -> Variable', () => {
    expect(classifyPrimalPatternResult(4, 6)).toBe('variable');
  });

  it('B exceeds A by exactly 3 -> Equatorial', () => {
    expect(classifyPrimalPatternResult(4, 7)).toBe('equatorial');
  });

  it('B exceeds A by more than 3 -> Equatorial', () => {
    expect(classifyPrimalPatternResult(0, 14)).toBe('equatorial');
  });
});

describe('scorePrimalPattern', () => {
  it('all A answers -> Polar, aCount 14, bCount 0, skipped 0, both 0', () => {
    const answers: PrimalPatternAnswers = {};
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) answers[q.number] = ['A'];

    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score).toEqual({
      aCount: 14,
      bCount: 0,
      bothCount: 0,
      skippedCount: 0,
      result: 'polar',
    });
  });

  it('all B answers -> Equatorial, aCount 0, bCount 14', () => {
    const answers: PrimalPatternAnswers = {};
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) answers[q.number] = ['B'];

    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score).toEqual({
      aCount: 0,
      bCount: 14,
      bothCount: 0,
      skippedCount: 0,
      result: 'equatorial',
    });
  });

  it('every question answered with both letters -> tie -> Variable, bothCount 14', () => {
    const answers: PrimalPatternAnswers = {};
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) answers[q.number] = ['A', 'B'];

    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score).toEqual({
      aCount: 14,
      bCount: 14,
      bothCount: 14,
      skippedCount: 0,
      result: 'variable',
    });
  });

  it('a fully skipped assessment (no answers at all) -> Variable, skippedCount 14', () => {
    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, {});
    expect(score).toEqual({
      aCount: 0,
      bCount: 0,
      bothCount: 0,
      skippedCount: 14,
      result: 'variable',
    });
  });

  it('an empty-array answer counts as skipped, same as a missing key', () => {
    const answers: PrimalPatternAnswers = { 1: [] };
    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score.skippedCount).toBe(14);
    expect(score.aCount).toBe(0);
    expect(score.bCount).toBe(0);
  });

  it('mixed answers with some skipped and one both-answer question compute exactly', () => {
    // Q1-Q7: A. Q8-Q10: B. Q11: both. Q12-Q14: skipped.
    const answers: PrimalPatternAnswers = {
      1: ['A'],
      2: ['A'],
      3: ['A'],
      4: ['A'],
      5: ['A'],
      6: ['A'],
      7: ['A'],
      8: ['B'],
      9: ['B'],
      10: ['B'],
      11: ['A', 'B'],
    };

    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    // aCount: Q1-7 (7) + Q11 (1) = 8. bCount: Q8-10 (3) + Q11 (1) = 4.
    expect(score.aCount).toBe(8);
    expect(score.bCount).toBe(4);
    expect(score.bothCount).toBe(1);
    expect(score.skippedCount).toBe(3);
    // diff = 8 - 4 = 4 >= 3 -> polar
    expect(score.result).toBe('polar');
  });

  it('exact three-point difference achieved through partial answers -> Polar boundary', () => {
    const answers: PrimalPatternAnswers = { 1: ['A'], 2: ['A'], 3: ['A'], 4: ['A'], 5: ['B'] };
    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score.aCount).toBe(4);
    expect(score.bCount).toBe(1);
    expect(score.skippedCount).toBe(9);
    expect(score.result).toBe('polar'); // diff = 3, exactly at the Polar threshold
  });

  it('a difference of two (one less than the threshold) stays Variable', () => {
    const answers: PrimalPatternAnswers = { 1: ['A'], 2: ['A'], 3: ['A'], 4: ['B'] };
    const score = scorePrimalPattern(PRIMAL_PATTERN_QUESTIONNAIRE, answers);
    expect(score.aCount).toBe(3);
    expect(score.bCount).toBe(1);
    expect(score.result).toBe('variable'); // diff = 2, within two
  });
});

describe('totalAnsweredCount', () => {
  it('counts only questions with at least one selected letter', () => {
    const answers: PrimalPatternAnswers = { 1: ['A'], 2: [], 3: ['A', 'B'] };
    expect(totalAnsweredCount(PRIMAL_PATTERN_QUESTIONNAIRE, answers)).toBe(2);
  });

  it('zero when nothing answered', () => {
    expect(totalAnsweredCount(PRIMAL_PATTERN_QUESTIONNAIRE, {})).toBe(0);
  });
});
