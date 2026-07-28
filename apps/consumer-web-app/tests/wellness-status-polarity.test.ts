/**
 * TRENDS_METRIC_POLARITY (2026-07-28, Trends direction-sentence follow-up):
 * whether a higher raw value is better or worse for each of the six
 * Progress-page Trends metrics — needed so the chart-window direction
 * sentence (app/progress/directionSentence.ts) never says "increasing"
 * is good news for a metric where it isn't. Derived from this file's own
 * classifier functions (the same ones the dashboard's status colors
 * already use), not hand-assumed — this test locks in the real, checked
 * values rather than what seemed intuitive. Digestion in particular is
 * checked explicitly: digestionStatus is the same directFivePointStatus
 * function moodStatus/energyStatus/sleepQualityStatus use (high = good),
 * so a higher digestion_rating means BETTER digestion, not more symptoms.
 */
import { describe, it, expect } from 'vitest';
import { TRENDS_METRIC_POLARITY } from '../lib/wellness/status';

describe('TRENDS_METRIC_POLARITY', () => {
  it('energy, mood, sleep_quality, and digestion are higher_is_better', () => {
    expect(TRENDS_METRIC_POLARITY.energy).toBe('higher_is_better');
    expect(TRENDS_METRIC_POLARITY.mood).toBe('higher_is_better');
    expect(TRENDS_METRIC_POLARITY.sleep_quality).toBe('higher_is_better');
    expect(TRENDS_METRIC_POLARITY.digestion).toBe('higher_is_better');
  });

  it('stress and pain are higher_is_worse — a higher value is worse, not better', () => {
    expect(TRENDS_METRIC_POLARITY.stress).toBe('higher_is_worse');
    expect(TRENDS_METRIC_POLARITY.pain).toBe('higher_is_worse');
  });
});
