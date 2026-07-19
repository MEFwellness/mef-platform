import { describe, it, expect } from 'vitest';
import {
  generateRecentPattern,
  generateSmallWin,
  generateTodaysInsight,
  generateThingsWorthWatching,
  generateWeeklyObservation,
  generateWeeklyTrendObservation,
} from '../lib/coaching-insights/levels';
import type {
  ActiveCoachingSourceId,
  CoachingObservation,
  CoachingObservationDirection,
} from '../lib/coaching-insights/types';

const TODAY = '2031-03-15';

function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let idCounter = 0;
function obs(
  daysAgo: number,
  sourceId: ActiveCoachingSourceId,
  metric: string,
  direction: CoachingObservationDirection,
  value: number | string,
  confidence = 0.9
): CoachingObservation {
  idCounter += 1;
  return {
    sourceId,
    localDate: shiftDate(TODAY, -daysAgo),
    metric,
    direction,
    value,
    confidence,
    sourceRecordId: `obs-${idCounter}`,
  };
}

describe('generateTodaysInsight (Level 1 — single observation)', () => {
  it('returns null with no observations at all', () => {
    expect(generateTodaysInsight([], TODAY)).toBeNull();
  });

  it('returns null when today only has neutral (matching) readings', () => {
    const observations = [obs(0, 'food_lens', 'protein', 'neutral', 'moderate')];
    expect(generateTodaysInsight(observations, TODAY)).toBeNull();
  });

  it('returns null when the only notable reading is from a prior day, not today', () => {
    const observations = [obs(1, 'food_lens', 'protein', 'low', 'low')];
    expect(generateTodaysInsight(observations, TODAY)).toBeNull();
  });

  it('prefers a Food Lens reading over a check-in reading when both exist today', () => {
    const observations = [
      obs(0, 'daily_checkin', 'energy_level', 'low', 2),
      obs(0, 'food_lens', 'protein', 'low', 'low'),
    ];
    const draft = generateTodaysInsight(observations, TODAY);
    expect(draft).not.toBeNull();
    expect(draft!.level).toBe(1);
    expect(draft!.statement).toContain('protein');
    expect(draft!.evidence.observationCount).toBe(1);
    expect(draft!.evidence.dateRange).toEqual({ from: TODAY, to: TODAY });
  });

  it('falls back to a check-in reading when no Food Lens signal exists today', () => {
    const observations = [obs(0, 'daily_checkin', 'digestion_rating', 'low', 2)];
    const draft = generateTodaysInsight(observations, TODAY);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toContain('digestion comfort');
  });
});

describe('generateRecentPattern (Level 2 — trailing 5 instances)', () => {
  it('returns null with fewer than 5 instances of any metric', () => {
    const observations = [
      obs(0, 'food_lens', 'protein', 'low', 'low'),
      obs(1, 'food_lens', 'protein', 'low', 'low'),
    ];
    expect(generateRecentPattern(observations)).toBeNull();
  });

  it('returns null with 5 instances but fewer than 3 matching', () => {
    const observations = [
      obs(0, 'food_lens', 'protein', 'low', 'low'),
      obs(1, 'food_lens', 'protein', 'low', 'low'),
      obs(2, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(3, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(4, 'food_lens', 'protein', 'neutral', 'moderate'),
    ];
    expect(generateRecentPattern(observations)).toBeNull();
  });

  it('returns the exact "3 of your last 5" statement per the product brief when the bar is met', () => {
    const observations = [
      obs(0, 'food_lens', 'protein', 'low', 'low'),
      obs(1, 'food_lens', 'protein', 'low', 'low'),
      obs(2, 'food_lens', 'protein', 'low', 'low'),
      obs(3, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(4, 'food_lens', 'protein', 'neutral', 'moderate'),
    ];
    const draft = generateRecentPattern(observations);
    expect(draft).not.toBeNull();
    expect(draft!.level).toBe(2);
    expect(draft!.statement).toBe(
      '3 of your last 5 meals read lighter in protein than your pattern target.'
    );
    expect(draft!.evidence.observationCount).toBe(5);
    expect(draft!.evidence.dataSources).toEqual(['food_lens']);
  });

  it('only considers the trailing 5 — a 6th, older instance never pads the count', () => {
    const observations = [
      obs(0, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(1, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(2, 'food_lens', 'protein', 'neutral', 'moderate'),
      obs(3, 'food_lens', 'protein', 'low', 'low'),
      obs(4, 'food_lens', 'protein', 'low', 'low'),
      // Older than the trailing 5 — even though this is 'low', it must not count.
      obs(5, 'food_lens', 'protein', 'low', 'low'),
    ];
    expect(generateRecentPattern(observations)).toBeNull();
  });

  it('picks the candidate with the strongest match ratio when several qualify', () => {
    const digestionLow = [0, 1, 2].map((d) =>
      obs(d, 'daily_checkin', 'digestion_rating', 'low', 2)
    );
    const digestionNeutral = [3, 4].map((d) =>
      obs(d, 'daily_checkin', 'digestion_rating', 'neutral', 3)
    );
    const proteinLow = [0, 1, 2, 3].map((d) => obs(d, 'food_lens', 'protein', 'low', 'low'));
    const proteinNeutral = [obs(4, 'food_lens', 'protein', 'neutral', 'moderate')];

    const draft = generateRecentPattern([
      ...digestionLow,
      ...digestionNeutral,
      ...proteinLow,
      ...proteinNeutral,
    ]);
    expect(draft).not.toBeNull();
    // Protein's ratio (4/5) beats digestion's ratio (3/5).
    expect(draft!.statement).toContain('protein');
  });
});

describe('generateWeeklyObservation (7-calendar-day majority, distinct from the trailing-5 window)', () => {
  it('returns null with fewer than 4 check-ins in the last 7 days', () => {
    const observations = [
      obs(0, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(2, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(4, 'daily_checkin', 'digestion_rating', 'low', 2),
    ];
    expect(generateWeeklyObservation(observations, TODAY)).toBeNull();
  });

  it('returns null when the majority bar (60%) is not cleared', () => {
    const observations = [
      obs(0, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(1, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(2, 'daily_checkin', 'digestion_rating', 'neutral', 3),
      obs(3, 'daily_checkin', 'digestion_rating', 'neutral', 3),
    ];
    expect(generateWeeklyObservation(observations, TODAY)).toBeNull();
  });

  it('returns a "this week" statement when at least 60% of the week matches', () => {
    const observations = [
      obs(0, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(1, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(2, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(3, 'daily_checkin', 'digestion_rating', 'neutral', 3),
    ];
    const draft = generateWeeklyObservation(observations, TODAY);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toContain('This week');
    expect(draft!.evidence.dateRange).toEqual({ from: shiftDate(TODAY, -6), to: TODAY });
  });

  it('ignores a check-in older than 7 days when evaluating the week', () => {
    const observations = [
      obs(0, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(1, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(2, 'daily_checkin', 'digestion_rating', 'low', 2),
      obs(8, 'daily_checkin', 'digestion_rating', 'low', 2), // outside the 7-day window
    ];
    // Only 3 real readings fall inside the window — below WEEKLY_MIN_DAYS_WITH_DATA(4).
    expect(generateWeeklyObservation(observations, TODAY)).toBeNull();
  });
});

describe('generateThingsWorthWatching (Level 3 — cross-feature)', () => {
  function buildCoOccurringScenario(matchingEnergyLowDays: number, totalCoOccurringDays: number) {
    const observations: CoachingObservation[] = [];
    // 5 high-water baseline days (value 8) so the low-water days (value 3)
    // always stay a clear minority and the median always lands at 8,
    // regardless of totalCoOccurringDays (tested up to 5 here) — keeps
    // the "relatively low" split meaningful without depending on exact
    // counts lining up with the median index.
    [10, 11, 12, 13, 14].forEach((daysAgo) =>
      observations.push(obs(daysAgo, 'daily_checkin', 'water_cups', 'neutral', 8))
    );

    for (let i = 0; i < totalCoOccurringDays; i++) {
      const daysAgo = 3 + i;
      observations.push(obs(daysAgo, 'daily_checkin', 'water_cups', 'neutral', 3));
      observations.push(obs(daysAgo, 'food_lens', 'protein', 'low', 'low'));
      const energyDirection = i < matchingEnergyLowDays ? 'low' : 'high';
      observations.push(
        obs(
          daysAgo,
          'daily_checkin',
          'energy_level',
          energyDirection,
          i < matchingEnergyLowDays ? 2 : 4
        )
      );
    }
    return observations;
  }

  it('returns null with fewer than 5 hydration readings', () => {
    const observations = [
      obs(0, 'daily_checkin', 'water_cups', 'neutral', 3),
      obs(0, 'food_lens', 'protein', 'low', 'low'),
      obs(0, 'daily_checkin', 'energy_level', 'low', 2),
    ];
    expect(generateThingsWorthWatching(observations)).toBeNull();
  });

  it('returns null with fewer than 3 co-occurring days', () => {
    // Only enough water readings to compute a median, but re-using days 3-5
    // is limited to 2 co-occurring days here.
    const observations = buildCoOccurringScenario(2, 2);
    expect(generateThingsWorthWatching(observations)).toBeNull();
  });

  it('returns null when the low-energy outcome ratio on co-occurring days is below 60%', () => {
    // 3 co-occurring days, only 1 shows low energy (33%) — below the bar.
    const observations = buildCoOccurringScenario(1, 3);
    expect(generateThingsWorthWatching(observations)).toBeNull();
  });

  it("returns the cross-feature statement matching the product brief's own example when the evidence holds", () => {
    // 4 co-occurring days, all 4 show low energy (100%) — clears every bar.
    const observations = buildCoOccurringScenario(4, 4);
    const draft = generateThingsWorthWatching(observations);
    expect(draft).not.toBeNull();
    expect(draft!.level).toBe(3);
    expect(draft!.statement).toContain('lighter in protein');
    expect(draft!.statement).toContain('hydration is lower');
    expect(draft!.statement).toContain('lower afternoon energy');
    expect(draft!.evidence.dataSources.sort()).toEqual(['daily_checkin', 'food_lens']);
    expect(draft!.evidence.observationCount).toBe(4);
  });
});

describe('generateSmallWin (positive-leaning Level 2)', () => {
  it('returns null without a qualifying positive streak', () => {
    expect(generateSmallWin([])).toBeNull();
  });

  it('recognizes a repeated momentum-improving streak as a small win', () => {
    const observations = [0, 1, 2, 3, 4].map((d) =>
      obs(d, 'progress_history', 'momentum_state', d < 3 ? 'positive' : 'neutral', 60)
    );
    const draft = generateSmallWin(observations);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toContain('momentum');
  });

  it('recognizes a repeated Primal Pattern match streak as a small win', () => {
    const observations = [0, 1, 2, 3, 4].map((d) =>
      obs(d, 'food_lens', 'protein', d < 3 ? 'neutral' : 'low', 'moderate')
    );
    const draft = generateSmallWin(observations);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toContain('matched the eating pattern');
  });
});

describe('generateWeeklyTrendObservation (Level 4 — 4-week windowed trend)', () => {
  function buildFourWeekTrend(options: {
    week0Digestion: number[];
    week1Digestion: number[];
    week2Digestion: number[];
    week3Digestion: number[];
    week0Meals: number;
    week1Meals: number;
    week2Meals: number;
    week3Meals: number;
  }): CoachingObservation[] {
    const observations: CoachingObservation[] = [];
    // week0 = 21-27 days ago (oldest), week3 = 0-6 days ago (most recent).
    const weekOffsets = [21, 14, 7, 0];
    const digestionSets = [
      options.week0Digestion,
      options.week1Digestion,
      options.week2Digestion,
      options.week3Digestion,
    ];
    const mealCounts = [
      options.week0Meals,
      options.week1Meals,
      options.week2Meals,
      options.week3Meals,
    ];

    weekOffsets.forEach((baseOffset, weekIndex) => {
      digestionSets[weekIndex]!.forEach((rating, i) => {
        observations.push(
          obs(baseOffset + i, 'daily_checkin', 'digestion_rating', 'neutral', rating)
        );
      });
      for (let m = 0; m < mealCounts[weekIndex]!; m++) {
        observations.push(obs(baseOffset + m, 'food_lens', 'protein', 'neutral', 'moderate'));
      }
    });
    return observations;
  }

  it('returns null when any of the 4 weeks lacks the minimum check-ins or meals', () => {
    const observations = buildFourWeekTrend({
      week0Digestion: [3],
      week1Digestion: [3, 3],
      week2Digestion: [4, 4],
      week3Digestion: [4, 5],
      week0Meals: 1,
      week1Meals: 1,
      week2Meals: 2,
      week3Meals: 2,
    });
    // week0 only has 1 digestion rating — below LEVEL4_MIN_CHECKINS_PER_WEEK(2).
    expect(generateWeeklyTrendObservation(observations, TODAY)).toBeNull();
  });

  it('returns null when digestion has not meaningfully improved', () => {
    const observations = buildFourWeekTrend({
      week0Digestion: [3, 3],
      week1Digestion: [3, 3],
      week2Digestion: [3, 3],
      week3Digestion: [3, 3],
      week0Meals: 1,
      week1Meals: 1,
      week2Meals: 2,
      week3Meals: 2,
    });
    expect(generateWeeklyTrendObservation(observations, TODAY)).toBeNull();
  });

  it('returns null when meal-logging consistency has not increased even if digestion improved', () => {
    const observations = buildFourWeekTrend({
      week0Digestion: [3, 3],
      week1Digestion: [3, 3],
      week2Digestion: [4, 4],
      week3Digestion: [5, 5],
      week0Meals: 2,
      week1Meals: 2,
      week2Meals: 2,
      week3Meals: 2,
    });
    expect(generateWeeklyTrendObservation(observations, TODAY)).toBeNull();
  });

  it("returns the long-term trend statement matching the product brief's own example when both trends hold", () => {
    const observations = buildFourWeekTrend({
      week0Digestion: [3, 3],
      week1Digestion: [3, 3],
      week2Digestion: [4, 4],
      week3Digestion: [5, 5],
      week0Meals: 1,
      week1Meals: 1,
      week2Meals: 2,
      week3Meals: 3,
    });
    const draft = generateWeeklyTrendObservation(observations, TODAY);
    expect(draft).not.toBeNull();
    expect(draft!.level).toBe(4);
    expect(draft!.statement).toContain('digestion ratings have gradually improved');
    expect(draft!.statement).toContain('meal-logging consistency has increased');
    expect(draft!.evidence.dataSources.sort()).toEqual(['daily_checkin', 'food_lens']);
  });
});
