/**
 * Coaching Intelligence Engine — level 1-4 generators. Pure functions, no
 * I/O: every generator takes the already-fetched CoachingObservation[]
 * (lib/coaching-insights/sources/) for a member's window and either
 * returns a CoachingInsightDraft or null. Never partial — a candidate
 * that doesn't clear its evidence bar is simply not returned, not
 * returned with a softened claim.
 *
 * "Never skip directly to a higher coaching level without sufficient
 * evidence" is enforced structurally here, not by convention: a level 2
 * generator requires LEVEL2_TRAILING_N real instances of the same
 * source+metric before it will even look at how many matched; a level 3
 * generator requires real co-occurring days across two different sources;
 * a level 4 generator requires real weekly buckets that each independently
 * clear their own minimum-data bar. Every threshold below has a comment
 * explaining why that number, not a different one — same discipline as
 * lib/food-lens/weeklyReport.ts and lib/food-lens/historyPatterns.ts's own
 * threshold constants.
 */

import * as copy from './copy';
import type {
  ActiveCoachingSourceId,
  CoachingDateRange,
  CoachingEvidence,
  CoachingInsightDraft,
  CoachingObservation,
  CoachingObservationDirection,
} from './types';

// A statement built from fewer than this many combined observations, or
// with a combined confidence below this floor, is too thin to say out
// loud — mirrors lib/food-lens/mealQuality.ts's LOW_CONFIDENCE_THRESHOLD
// (0.45) and lib/food-lens/historyPatterns.ts's minimum-data gates.
const MIN_STATEMENT_CONFIDENCE = 0.4;

// ---- Level 1 — Today's Insight ---------------------------------------------------

const TODAYS_INSIGHT_NUTRITION_METRICS = ['protein', 'carb', 'fat'];
const TODAYS_INSIGHT_CHECKIN_METRICS = ['digestion_rating', 'energy_level', 'stress_level'];

export function generateTodaysInsight(
  observations: CoachingObservation[],
  today: string
): CoachingInsightDraft | null {
  const todays = observations.filter((o) => o.localDate === today);

  const nutritionHit = todays.find(
    (o) =>
      o.sourceId === 'food_lens' &&
      TODAYS_INSIGHT_NUTRITION_METRICS.includes(o.metric) &&
      (o.direction === 'low' || o.direction === 'high')
  );
  const candidate =
    nutritionHit ??
    todays.find(
      (o) =>
        o.sourceId === 'daily_checkin' &&
        TODAYS_INSIGHT_CHECKIN_METRICS.includes(o.metric) &&
        (o.direction === 'low' || o.direction === 'high')
    );

  if (!candidate || candidate.confidence < MIN_STATEMENT_CONFIDENCE) return null;
  const direction = candidate.direction as 'low' | 'high';

  const statement =
    candidate.sourceId === 'food_lens'
      ? copy.todaysNutritionStatement(candidate.metric, direction)
      : copy.todaysCheckinStatement(candidate.metric, direction);

  return draftFrom(1, statement, [candidate], { from: today, to: today }, candidate.confidence);
}

// ---- Level 2 — Recent Pattern / Small Wins (trailing-N instance streak) ----------

const LEVEL2_TRAILING_N = 5;
// "Three of your last five" per the product brief's own example — a
// simple majority-plus-one bar, not a bare majority, so a near-even split
// (e.g. 3-of-5 vs. 2-of-5 on the complement) still reads as a real lean,
// not noise.
const LEVEL2_MIN_MATCHES = 3;

type TrailingCandidate = {
  sourceId: ActiveCoachingSourceId;
  metric: string;
  direction: CoachingObservationDirection;
  buildStatement: (matches: number, total: number) => string;
};

function trailingInstances(
  observations: CoachingObservation[],
  sourceId: ActiveCoachingSourceId,
  metric: string,
  trailingN: number
): CoachingObservation[] | null {
  const matching = observations
    .filter((o) => o.sourceId === sourceId && o.metric === metric)
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1)); // newest first

  if (matching.length < trailingN) return null; // not enough real instances yet — never partial-fill
  return matching.slice(0, trailingN);
}

function evaluateTrailingCandidate(
  observations: CoachingObservation[],
  candidate: TrailingCandidate,
  trailingN: number,
  minMatches: number
): { draft: CoachingInsightDraft; ratio: number } | null {
  const instances = trailingInstances(
    observations,
    candidate.sourceId,
    candidate.metric,
    trailingN
  );
  if (!instances) return null;

  const matched = instances.filter((o) => o.direction === candidate.direction);
  if (matched.length < minMatches) return null;

  const dates = instances.map((o) => o.localDate).sort();
  const confidence = averageConfidence(matched);
  if (confidence < MIN_STATEMENT_CONFIDENCE) return null;

  const statement = candidate.buildStatement(matched.length, instances.length);
  const draft = draftFrom(
    2,
    statement,
    matched,
    { from: dates[0]!, to: dates[dates.length - 1]! },
    confidence,
    instances.length
  );
  return { draft, ratio: matched.length / instances.length };
}

function bestOf(
  observations: CoachingObservation[],
  candidates: TrailingCandidate[],
  trailingN: number,
  minMatches: number
): CoachingInsightDraft | null {
  let best: { draft: CoachingInsightDraft; ratio: number } | null = null;
  for (const candidate of candidates) {
    const result = evaluateTrailingCandidate(observations, candidate, trailingN, minMatches);
    if (result && (!best || result.ratio > best.ratio)) best = result;
  }
  return best?.draft ?? null;
}

const RECENT_PATTERN_CANDIDATES: TrailingCandidate[] = [
  {
    sourceId: 'food_lens',
    metric: 'protein',
    direction: 'low',
    buildStatement: (m, t) => copy.repeatedNutritionStatement(m, t, 'protein', 'low'),
  },
  {
    sourceId: 'food_lens',
    metric: 'carb',
    direction: 'high',
    buildStatement: (m, t) => copy.repeatedNutritionStatement(m, t, 'carb', 'high'),
  },
  {
    sourceId: 'food_lens',
    metric: 'fat',
    direction: 'low',
    buildStatement: (m, t) => copy.repeatedNutritionStatement(m, t, 'fat', 'low'),
  },
  {
    sourceId: 'daily_checkin',
    metric: 'digestion_rating',
    direction: 'low',
    buildStatement: (m, t) =>
      copy.repeatedCheckinStatement(m, t, 'digestion_rating', 'low', 'recent'),
  },
  {
    sourceId: 'daily_checkin',
    metric: 'energy_level',
    direction: 'low',
    buildStatement: (m, t) => copy.repeatedCheckinStatement(m, t, 'energy_level', 'low', 'recent'),
  },
];

export function generateRecentPattern(
  observations: CoachingObservation[]
): CoachingInsightDraft | null {
  return bestOf(observations, RECENT_PATTERN_CANDIDATES, LEVEL2_TRAILING_N, LEVEL2_MIN_MATCHES);
}

const SMALL_WIN_CANDIDATES: TrailingCandidate[] = [
  {
    sourceId: 'food_lens',
    // A comparison's direction is 'neutral' exactly when it matched the
    // member's Primal Pattern target (see sources/nutritionSource.ts) —
    // never a "no data" filler, so this is real positive evidence.
    metric: 'protein',
    direction: 'neutral',
    buildStatement: (m, t) => copy.repeatedNutritionMatchStatement(m, t),
  },
  {
    sourceId: 'daily_checkin',
    metric: 'digestion_rating',
    direction: 'high',
    buildStatement: (m, t) =>
      copy.repeatedCheckinStatement(m, t, 'digestion_rating', 'high', 'recent'),
  },
  {
    sourceId: 'daily_checkin',
    metric: 'energy_level',
    direction: 'high',
    buildStatement: (m, t) => copy.repeatedCheckinStatement(m, t, 'energy_level', 'high', 'recent'),
  },
  {
    sourceId: 'progress_history',
    metric: 'momentum_state',
    direction: 'positive',
    buildStatement: (m, t) => copy.repeatedMomentumStatement(m, t),
  },
];

export function generateSmallWin(observations: CoachingObservation[]): CoachingInsightDraft | null {
  return bestOf(observations, SMALL_WIN_CANDIDATES, LEVEL2_TRAILING_N, LEVEL2_MIN_MATCHES);
}

// ---- Weekly Observation (trailing-7-calendar-day majority, distinct window from Level 2's trailing-N-instances) ----

// A 7-day window realistically has at most 7 check-ins — 4 is the
// smallest count where "most of them" is still a meaningful claim rather
// than 2-of-3.
const WEEKLY_MIN_DAYS_WITH_DATA = 4;
// A clear majority, not a bare 50/50 split.
const WEEKLY_MIN_MATCH_RATIO = 0.6;

const WEEKLY_CANDIDATES: Array<{
  sourceId: ActiveCoachingSourceId;
  metric: string;
  direction: CoachingObservationDirection;
}> = [
  { sourceId: 'daily_checkin', metric: 'digestion_rating', direction: 'low' },
  { sourceId: 'daily_checkin', metric: 'energy_level', direction: 'low' },
  { sourceId: 'daily_checkin', metric: 'stress_level', direction: 'high' },
  { sourceId: 'food_lens', metric: 'protein', direction: 'low' },
];

export function generateWeeklyObservation(
  observations: CoachingObservation[],
  today: string
): CoachingInsightDraft | null {
  const weekStart = shiftDate(today, -6);
  let best: { draft: CoachingInsightDraft; ratio: number } | null = null;

  for (const candidate of WEEKLY_CANDIDATES) {
    const week = observations.filter(
      (o) =>
        o.sourceId === candidate.sourceId &&
        o.metric === candidate.metric &&
        o.localDate >= weekStart &&
        o.localDate <= today
    );
    if (week.length < WEEKLY_MIN_DAYS_WITH_DATA) continue;

    const matched = week.filter((o) => o.direction === candidate.direction);
    const ratio = matched.length / week.length;
    if (ratio < WEEKLY_MIN_MATCH_RATIO) continue;

    const confidence = averageConfidence(matched);
    if (confidence < MIN_STATEMENT_CONFIDENCE) continue;

    const statement =
      candidate.direction === 'low' || candidate.direction === 'high'
        ? copy.repeatedCheckinStatement(
            matched.length,
            week.length,
            candidate.metric,
            candidate.direction,
            'this week'
          )
        : null;
    if (!statement) continue;

    const draft = draftFrom(
      2,
      statement,
      matched,
      { from: weekStart, to: today },
      confidence,
      week.length
    );
    if (!best || ratio > best.ratio) best = { draft, ratio };
  }

  return best?.draft ?? null;
}

// ---- Level 3 — Things Worth Watching (cross-feature) ------------------------------

// At least this many days must show the full protein-light + relatively-
// low-hydration combination before a correlation claim is made at all.
const LEVEL3_MIN_COOCCURRENCES = 3;
// Of the days showing that combination, at least this share must also
// show low afternoon energy for the claim to hold — a clear majority, not
// "sometimes."
const LEVEL3_MIN_OUTCOME_RATIO = 0.6;
// The minimum number of hydration readings needed before "relatively low"
// (a within-member median split) is a meaningful comparison rather than a
// guess from 1-2 data points.
const LEVEL3_MIN_HYDRATION_READINGS = 5;

export function generateThingsWorthWatching(
  observations: CoachingObservation[]
): CoachingInsightDraft | null {
  const proteinLowDates = new Set(
    observations
      .filter((o) => o.sourceId === 'food_lens' && o.metric === 'protein' && o.direction === 'low')
      .map((o) => o.localDate)
  );
  const waterObservations = observations.filter(
    (o) => o.sourceId === 'daily_checkin' && o.metric === 'water_cups'
  );
  const energyByDate = new Map(
    observations
      .filter((o) => o.sourceId === 'daily_checkin' && o.metric === 'energy_level')
      .map((o) => [o.localDate, o] as const)
  );

  if (proteinLowDates.size === 0 || waterObservations.length < LEVEL3_MIN_HYDRATION_READINGS)
    return null;

  const waterValues = waterObservations.map((o) => o.value as number).sort((a, b) => a - b);
  const median = waterValues[Math.floor(waterValues.length / 2)]!;
  const relativelyLowWaterDates = new Set(
    waterObservations.filter((o) => (o.value as number) < median).map((o) => o.localDate)
  );

  const cooccurring = [...proteinLowDates].filter(
    (d) => relativelyLowWaterDates.has(d) && energyByDate.has(d)
  );
  if (cooccurring.length < LEVEL3_MIN_COOCCURRENCES) return null;

  const lowEnergyDays = cooccurring.filter((d) => energyByDate.get(d)!.direction === 'low');
  const ratio = lowEnergyDays.length / cooccurring.length;
  if (ratio < LEVEL3_MIN_OUTCOME_RATIO) return null;

  const involvedObs = [
    ...observations.filter(
      (o) =>
        cooccurring.includes(o.localDate) && o.sourceId === 'food_lens' && o.metric === 'protein'
    ),
    ...waterObservations.filter((o) => cooccurring.includes(o.localDate)),
    ...cooccurring.map((d) => energyByDate.get(d)!),
  ];
  const confidence = Math.min(1, cooccurring.length / (LEVEL3_MIN_COOCCURRENCES * 2)) * ratio;
  if (confidence < MIN_STATEMENT_CONFIDENCE) return null;

  const sortedDates = [...cooccurring].sort();
  const statement = copy.proteinHydrationEnergyWatchStatement(cooccurring.length);

  return draftFrom(
    3,
    statement,
    involvedObs,
    { from: sortedDates[0]!, to: sortedDates[sortedDates.length - 1]! },
    confidence,
    cooccurring.length
  );
}

// ---- Level 4 — long-term trend (weekly-windowed) -----------------------------------

// The product brief's own example is a 4-week trend — the minimum span
// short enough to be actionable but long enough that a single good/bad
// week can't drive the whole claim.
const LEVEL4_WEEKS = 4;
const LEVEL4_MIN_CHECKINS_PER_WEEK = 2;
const LEVEL4_MIN_MEALS_PER_WEEK = 1;
// A quarter-point move on a 1-5 self-rated scale, averaged across a whole
// week, is a real shift — smaller than that is within ordinary day-to-day
// noise on a 5-point scale.
const LEVEL4_MIN_DIGESTION_IMPROVEMENT = 0.25;

function weekBucket(today: string, weeksAgo: number): CoachingDateRange {
  return { from: shiftDate(today, -(weeksAgo * 7 + 6)), to: shiftDate(today, -(weeksAgo * 7)) };
}

export function generateWeeklyTrendObservation(
  observations: CoachingObservation[],
  today: string
): CoachingInsightDraft | null {
  // weeks[0] = oldest of the 4, weeks[3] = most recent (this week).
  const weeks = Array.from({ length: LEVEL4_WEEKS }, (_, i) =>
    weekBucket(today, LEVEL4_WEEKS - 1 - i)
  );

  const weeklyStats = weeks.map((range) => {
    const digestion = observations.filter(
      (o) =>
        o.sourceId === 'daily_checkin' &&
        o.metric === 'digestion_rating' &&
        o.localDate >= range.from &&
        o.localDate <= range.to
    );
    const mealDates = new Set(
      observations
        .filter(
          (o) => o.sourceId === 'food_lens' && o.localDate >= range.from && o.localDate <= range.to
        )
        .map((o) => o.sourceRecordId)
    );
    return { range, digestion, mealCount: mealDates.size };
  });

  const insufficientWeek = weeklyStats.some(
    (w) =>
      w.digestion.length < LEVEL4_MIN_CHECKINS_PER_WEEK || w.mealCount < LEVEL4_MIN_MEALS_PER_WEEK
  );
  if (insufficientWeek) return null;

  const digestionAvg = (obs: CoachingObservation[]) =>
    obs.reduce((sum, o) => sum + (o.value as number), 0) / obs.length;

  const firstHalfDigestion =
    (digestionAvg(weeklyStats[0]!.digestion) + digestionAvg(weeklyStats[1]!.digestion)) / 2;
  const secondHalfDigestion =
    (digestionAvg(weeklyStats[2]!.digestion) + digestionAvg(weeklyStats[3]!.digestion)) / 2;
  const firstHalfMeals = (weeklyStats[0]!.mealCount + weeklyStats[1]!.mealCount) / 2;
  const secondHalfMeals = (weeklyStats[2]!.mealCount + weeklyStats[3]!.mealCount) / 2;

  const digestionImproved =
    secondHalfDigestion - firstHalfDigestion >= LEVEL4_MIN_DIGESTION_IMPROVEMENT;
  const consistencyIncreased = secondHalfMeals > firstHalfMeals;
  if (!digestionImproved || !consistencyIncreased) return null;

  const allDigestion = weeklyStats.flatMap((w) => w.digestion);
  const confidence = Math.min(0.9, 0.6 + (secondHalfDigestion - firstHalfDigestion) / 4);

  return draftFrom(
    4,
    copy.digestionConsistencyTrendStatement(LEVEL4_WEEKS),
    allDigestion,
    { from: weeks[0]!.from, to: weeks[LEVEL4_WEEKS - 1]!.to },
    confidence,
    allDigestion.length + weeklyStats.reduce((sum, w) => sum + w.mealCount, 0),
    ['daily_checkin', 'food_lens']
  );
}

// ---- shared helpers -----------------------------------------------------------------

function averageConfidence(observations: CoachingObservation[]): number {
  if (observations.length === 0) return 0;
  return observations.reduce((sum, o) => sum + o.confidence, 0) / observations.length;
}

function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function draftFrom(
  level: 1 | 2 | 3 | 4,
  statement: string,
  observations: CoachingObservation[],
  dateRange: CoachingDateRange,
  confidence: number,
  observationCountOverride?: number,
  dataSourcesOverride?: ActiveCoachingSourceId[]
): CoachingInsightDraft {
  const dataSources = dataSourcesOverride ?? [...new Set(observations.map((o) => o.sourceId))];
  const observationCount = observationCountOverride ?? observations.length;
  const evidence: CoachingEvidence = {
    dataSources,
    dateRange,
    observationCount,
    confidence,
    refs: observations.slice(0, 12).map((o) => ({ type: o.sourceId, id: o.sourceRecordId })),
  };
  const explanation = copy.buildExplanation({
    dataSources,
    dateRangeFrom: dateRange.from,
    dateRangeTo: dateRange.to,
    observationCount,
    confidence,
  });
  return { level, statement, explanation, evidence };
}
