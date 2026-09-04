/**
 * The one gate between an unauthenticated request body and the fenced
 * Quick Wellness Check table.
 *
 * /api/guest-preview has no session to authorise it, because the visitor it
 * serves has no account. So a caller can send anything, and everything that
 * stops a stranger writing arbitrary content into a health-adjacent table
 * is here plus the database's own regex checks. These tests are what say
 * so.
 */

import { describe, expect, it } from 'vitest';
import {
  GUEST_WELLNESS_CHECK_OPTIONS,
  GUEST_WELLNESS_CHECK_QUESTIONS,
  isGuestQuizComplete,
  sanitizeGuestAnswers,
  toAnswerSlug,
  toAnswerSlugs,
} from '@/lib/guest-preview/questions';
import { GUEST_PREVIEW_QUESTION_ORDER } from '@/lib/guest-preview/types';

describe('the allowlist and the screen cannot disagree', () => {
  it('every question the screen asks has an option list, and they are the same list', () => {
    for (const key of GUEST_PREVIEW_QUESTION_ORDER) {
      const question = GUEST_WELLNESS_CHECK_QUESTIONS[key];
      expect(question).toBeTruthy();
      expect(GUEST_WELLNESS_CHECK_OPTIONS[key]).toEqual(
        question.options.map((option) => String(option.value))
      );
    }
  });

  it('asks exactly the seven questions the quiz walks through', () => {
    expect(Object.keys(GUEST_WELLNESS_CHECK_QUESTIONS).sort()).toEqual(
      [...GUEST_PREVIEW_QUESTION_ORDER].sort()
    );
  });
});

describe('sanitizeGuestAnswers drops everything it does not recognise', () => {
  it('keeps a real key with a real option', () => {
    expect(sanitizeGuestAnswers({ energy_level: '4' })).toEqual({ energy_level: '4' });
    expect(sanitizeGuestAnswers({ movement_today: 'full_session' })).toEqual({
      movement_today: 'full_session',
    });
  });

  it('drops a question this experience does not ask', () => {
    expect(sanitizeGuestAnswers({ blood_pressure: '120' })).toEqual({});
    expect(sanitizeGuestAnswers({ optional_notes: 'i have been having chest pain' })).toEqual({});
  });

  it('drops an option the question does not offer', () => {
    // Energy is 1 to 5. Pain is the only one that starts at 0.
    expect(sanitizeGuestAnswers({ energy_level: '0' })).toEqual({});
    expect(sanitizeGuestAnswers({ energy_level: '99' })).toEqual({});
    expect(sanitizeGuestAnswers({ pain_discomfort_level: '0' })).toEqual({
      pain_discomfort_level: '0',
    });
    expect(sanitizeGuestAnswers({ movement_today: 'marathon' })).toEqual({});
  });

  it('leaves a stranger nowhere at all to type prose', () => {
    const attempted = {
      energy_level: 'I have been getting chest pain when I climb the stairs',
      mood_level: '3',
    };
    expect(sanitizeGuestAnswers(attempted)).toEqual({ mood_level: '3' });
  });

  it('drops anything that is not a string, and survives junk input', () => {
    expect(sanitizeGuestAnswers({ energy_level: 4 })).toEqual({});
    expect(sanitizeGuestAnswers(null)).toEqual({});
    expect(sanitizeGuestAnswers('energy_level=4')).toEqual({});
    expect(sanitizeGuestAnswers([1, 2, 3])).toEqual({});
  });

  it('ignores a prototype-polluting key rather than treating it as a question', () => {
    expect(sanitizeGuestAnswers({ constructor: 'x', toString: '1' })).toEqual({});
  });
});

describe('answers become slugs, never numbers', () => {
  it('stores a level as its own digits', () => {
    expect(toAnswerSlug('energy_level', 4)).toEqual({ energy_level: '4' });
    expect(toAnswerSlug('pain_discomfort_level', 0)).toEqual({ pain_discomfort_level: '0' });
  });

  it('writes nothing for a question she has not answered', () => {
    expect(toAnswerSlug('mood_level', null)).toEqual({});
  });

  it('skips the unanswered questions when the whole set is sent', () => {
    expect(
      toAnswerSlugs({
        energy_level: 2,
        stress_level: null,
        movement_today: 'light',
      })
    ).toEqual({ energy_level: '2', movement_today: 'light' });
  });

  it('is complete only when all seven hold an offered value', () => {
    const full = {
      energy_level: 3,
      stress_level: 3,
      sleep_quality: 3,
      digestion_rating: 3,
      movement_today: 'light' as const,
      pain_discomfort_level: 0,
      mood_level: 3,
    };
    expect(isGuestQuizComplete(full)).toBe(true);
    expect(isGuestQuizComplete({ ...full, mood_level: null })).toBe(false);
  });
});
