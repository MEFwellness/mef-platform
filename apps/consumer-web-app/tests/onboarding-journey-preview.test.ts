import { describe, it, expect } from 'vitest';
import { buildJourneyPreview } from '@/lib/onboarding/journeyPreview';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

function concern(value: string): OnboardingAnswerInput {
  return { question_key: 'primary_concern', question_version: 1, answer_status: 'answered', value };
}

describe('buildJourneyPreview', () => {
  it('names Movement & Posture Analysis for pain/movement/healthy_aging concerns', () => {
    for (const value of ['pain', 'movement', 'healthy_aging']) {
      expect(buildJourneyPreview([concern(value)]).personalized.title).toBe(
        'Movement & Posture Analysis'
      );
    }
  });

  it('names Pattern Recognition for stress/energy/performance/sleep concerns', () => {
    for (const value of ['stress', 'energy', 'performance', 'sleep']) {
      expect(buildJourneyPreview([concern(value)]).personalized.title).toBe('Pattern Recognition');
    }
  });

  it('names Lifestyle Insights for digestion/weight/habits concerns', () => {
    for (const value of ['digestion', 'weight', 'habits']) {
      expect(buildJourneyPreview([concern(value)]).personalized.title).toBe('Lifestyle Insights');
    }
  });

  it('falls back to Root Score for a broad concern or no concern at all', () => {
    expect(buildJourneyPreview([concern('general_optimization')]).personalized.title).toBe(
      'Root Score'
    );
    expect(buildJourneyPreview([concern('other')]).personalized.title).toBe('Root Score');
    expect(buildJourneyPreview([]).personalized.title).toBe('Root Score');
  });

  it('personalizes the chapter body with the concern when one was answered', () => {
    const preview = buildJourneyPreview([concern('stress')]);
    expect(preview.personalized.body).toMatch(/reducing stress/i);
  });

  it('always includes the Wellness Timeline and Daily Check-ins chapters', () => {
    const preview = buildJourneyPreview([]);
    expect(preview.timeline.title).toBe('Your Wellness Timeline begins today');
    expect(preview.checkins.title).toBe('Daily Check-ins');
  });

  it('mentions reassessments, coaching, and progress tracking in the closing line', () => {
    const preview = buildJourneyPreview([]);
    expect(preview.closing).toMatch(/reassessment/i);
    expect(preview.closing).toMatch(/coach/i);
    expect(preview.closing).toMatch(/progress tracking/i);
  });
});
