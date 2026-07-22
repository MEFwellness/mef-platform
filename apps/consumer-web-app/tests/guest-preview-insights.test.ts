import { describe, it, expect } from 'vitest';
import { buildGuestPreviewInsight, countAnsweredQuestions } from '@/lib/guest-preview/insights';
import { EMPTY_GUEST_PREVIEW_ANSWERS } from '@/lib/guest-preview/types';

describe('guest preview insights (non-diagnostic, client-only)', () => {
  it('countAnsweredQuestions counts only non-null fields', () => {
    expect(countAnsweredQuestions(EMPTY_GUEST_PREVIEW_ANSWERS)).toBe(0);
    expect(
      countAnsweredQuestions({ ...EMPTY_GUEST_PREVIEW_ANSWERS, energy_level: 4, mood_level: 3 })
    ).toBe(2);
  });

  it('tiers "steady" when the answered fields skew positive', () => {
    const insight = buildGuestPreviewInsight({
      energy_level: 5,
      sleep_quality: 5,
      digestion_rating: 4,
      mood_level: 5,
      stress_level: 1,
      pain_discomfort_level: 0,
      movement_today: 'moderate',
    });
    expect(insight.tier).toBe('steady');
  });

  it('tiers "stretched" when the answered fields skew negative', () => {
    const insight = buildGuestPreviewInsight({
      energy_level: 1,
      sleep_quality: 1,
      digestion_rating: 2,
      mood_level: 1,
      stress_level: 5,
      pain_discomfort_level: 5,
      movement_today: 'none',
    });
    expect(insight.tier).toBe('stretched');
  });

  it('inverts stress so a high (worse) value lowers the tier rather than raising it', () => {
    const lowStress = buildGuestPreviewInsight({
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      stress_level: 1,
    });
    const highStress = buildGuestPreviewInsight({
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      stress_level: 5,
    });
    expect(lowStress.tier).toBe('steady');
    expect(highStress.tier).toBe('stretched');
  });

  it('uses hedged copy when fewer than 4 questions were answered', () => {
    const insight = buildGuestPreviewInsight({
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      energy_level: 3,
      mood_level: 3,
    });
    expect(insight.answeredCount).toBe(2);
    expect(insight.headline).toMatch(/early look/i);
  });

  it('disclaims diagnosis rather than asserting one, and never mentions treatment or scoring', () => {
    const insight = buildGuestPreviewInsight({
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      energy_level: 2,
      stress_level: 4,
    });
    const text = `${insight.headline} ${insight.observation} ${insight.disclaimer}`.toLowerCase();
    // The only permitted "diagnos*" mention is the explicit disclaimer that
    // this is NOT one — never an affirmative diagnostic claim.
    expect(insight.disclaimer).toMatch(/not a diagnosis/i);
    expect(text).not.toMatch(/treat/);
    expect(text).not.toMatch(/\bscore\b/);
  });

  it('falls back to a neutral tier when nothing was answered', () => {
    const insight = buildGuestPreviewInsight(EMPTY_GUEST_PREVIEW_ANSWERS);
    expect(insight.answeredCount).toBe(0);
    expect(insight.tier).toBe('mixed');
  });
});
