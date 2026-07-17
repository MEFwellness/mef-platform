/**
 * Trend Classification (section 3) — one deterministic trend per Daily
 * Wellness Index metric, comparing last_30_days vs previous_30_days
 * (long enough to call something "gradual," per the milestone's own
 * "improved over the last three weeks" example) with last_7_days used
 * only to catch a fresh, newly-emerging change the 30-day comparison
 * would otherwise wash out. Reuses computeMetricCandidates directly
 * (lib/wellness/wellness-index.ts) — the exact same per-day scoring the
 * Daily Wellness Index and lib/wellness/insights.ts already use — so a
 * "declining" trend here never disagrees with what the metric's own
 * status band already says.
 *
 * Returns null (no draft) whenever evidence is insufficient — this
 * engine never fabricates a trend from a handful of check-ins.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  computeMetricCandidates,
  inputsFromCheckin,
  scoreToStatus,
  type WellnessMetricKey,
} from '../wellness/wellness-index';
import { areaLabel, areaLabelLower } from './copy';
import {
  confidenceFromSample,
  strengthFromDelta,
  average,
  MIN_SAMPLE_FOR_WINDOW,
} from './confidence';
import { windowRange, sliceByLocalDate, checkinRangeEvidence } from './windows';
import type { WellnessInsightDraft } from './types';

const DECLINE_THRESHOLD = 10;
const IMPROVE_THRESHOLD = 10;
const NEWLY_EMERGING_DROP = 10;

function scoreForCheckin(c: DailyCheckin, area: WellnessMetricKey): number | null {
  return computeMetricCandidates(inputsFromCheckin(c)).find((m) => m.key === area)?.score ?? null;
}
function scoresForArea(checkins: DailyCheckin[], area: WellnessMetricKey): number[] {
  return checkins.map((c) => scoreForCheckin(c, area)).filter((v): v is number => v !== null);
}

function reasoningTitle(area: WellnessMetricKey, state: string): string {
  return `${area.toUpperCase()}_${state.toUpperCase()}`;
}

/**
 * Direction-appropriate verbs for the RAW metric itself, not the
 * normalized wellness score this file's own delta math runs on. For
 * stress and pain, a HIGHER score means LESS stress/pain — so a
 * "declining" score means the raw value is actually increasing (getting
 * worse), the opposite of what "X has been declining" would read as to a
 * member. Mirrors lib/wellness/insights.ts's own trendMessage, which
 * already gets this right for its simpler two-half-split detector; kept
 * as a real fix here (not a rebuild) so this richer 30-vs-30-day engine's
 * language is never backwards for the same two metrics.
 */
function trendVerb(area: WellnessMetricKey, scoreDirection: 'improving' | 'declining'): string {
  const scoreWorsened = scoreDirection === 'declining';
  if (area === 'stress') return scoreWorsened ? 'increasing' : 'decreasing';
  if (area === 'pain') return scoreWorsened ? 'worsening' : 'easing';
  return scoreWorsened ? 'declining' : 'improving';
}

/** Past-participle form of trendVerb, for "quietly {verb} this week" phrasing. */
function trendVerbPast(area: WellnessMetricKey, scoreDirection: 'improving' | 'declining'): string {
  const scoreWorsened = scoreDirection === 'declining';
  if (area === 'stress') return scoreWorsened ? 'increased' : 'decreased';
  if (area === 'pain') return scoreWorsened ? 'worsened' : 'eased';
  return scoreWorsened ? 'declined' : 'improved';
}

/** "trending {word}" — also flipped for stress/pain so it always describes which way the RAW metric itself moved, never the abstract score. */
function trendDirectionWord(
  area: WellnessMetricKey,
  scoreDirection: 'improving' | 'declining'
): 'upward' | 'downward' {
  const scoreWorsened = scoreDirection === 'declining';
  const isInverse = area === 'stress' || area === 'pain';
  const rawIncreased = isInverse ? scoreWorsened : !scoreWorsened;
  return rawIncreased ? 'upward' : 'downward';
}

export function classifyMetricTrend(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  area: WellnessMetricKey
): WellnessInsightDraft | null {
  const last30Range = windowRange(asOfLocalDate, 'last_30_days');
  const prev30Range = windowRange(asOfLocalDate, 'previous_30_days');
  const last7Range = windowRange(asOfLocalDate, 'last_7_days');

  const last30Checkins = sliceByLocalDate(checkinsOldestFirst, last30Range);
  const prev30Checkins = sliceByLocalDate(checkinsOldestFirst, prev30Range);

  const last30Scores = scoresForArea(last30Checkins, area);
  const prev30Scores = scoresForArea(prev30Checkins, area);

  if (
    last30Scores.length < MIN_SAMPLE_FOR_WINDOW.last_30_days ||
    prev30Scores.length < MIN_SAMPLE_FOR_WINDOW.previous_30_days
  ) {
    return null; // insufficient_data — never fabricate a trend from too little history
  }

  const last30Avg = average(last30Scores)!;
  const prev30Avg = average(prev30Scores)!;
  const delta = last30Avg - prev30Avg;
  const absDelta = Math.abs(delta);

  const last30Status = scoreToStatus(last30Avg);
  const prev30Status = scoreToStatus(prev30Avg);

  const last30PoorShare =
    last30Scores.filter((s) => scoreToStatus(s) === 'poor').length / last30Scores.length;
  const last30GoodShare =
    last30Scores.filter((s) => scoreToStatus(s) === 'good').length / last30Scores.length;

  const last7Checkins = sliceByLocalDate(checkinsOldestFirst, last7Range);
  const last7Scores = scoresForArea(last7Checkins, area);
  const restOf30Scores = scoresForArea(
    last30Checkins.filter((c) => c.local_date < last7Range.start),
    area
  );

  const label = areaLabel(area);
  const labelLower = areaLabelLower(area);
  const sampleSize = last30Scores.length + prev30Scores.length;
  const confidence = confidenceFromSample(sampleSize);
  const evidence = checkinRangeEvidence([...prev30Checkins, ...last30Checkins]);

  // recurring_pattern: a persistent problem across BOTH full months, not a fresh decline.
  if (last30Status === 'poor' && prev30Status === 'poor') {
    return {
      insightType: 'trend',
      wellnessArea: area,
      trendState: 'recurring_pattern',
      trendStrength: strengthFromDelta(absDelta),
      patternKey: `trend_${area}`,
      title: `${label} has been a sustained concern`,
      memberSummary: `${label} has stayed in a difficult range across the last two months — this looks like an ongoing pattern rather than a one-off rough patch.`,
      coachDetail: `${label} averaged ${last30Avg.toFixed(0)}/100 over the last 30 days and ${prev30Avg.toFixed(0)}/100 the 30 days before that — both in the 'poor' band. Recurring, not a fresh decline.`,
      confidence,
      severity: 'important',
      timeWindow: 'last_30_days',
      evidenceRefs: evidence,
      reasoningCodes: [reasoningTitle(area, 'recurring_pattern')],
      recommendedCoachingResponse: `Keep ${labelLower} coaching gentle and consistency-focused rather than intensifying it further.`,
      recommendedCoachAction: `Review ${labelLower} history with this member directly — a 60-day sustained pattern is worth a conversation.`,
      memberVisible: true,
    };
  }

  // newly_emerging: a fresh 7-day drop that wasn't already present in the rest of the last 30 days.
  if (last7Scores.length >= MIN_SAMPLE_FOR_WINDOW.last_7_days && restOf30Scores.length >= 5) {
    const last7Avg = average(last7Scores)!;
    const restAvg = average(restOf30Scores)!;
    const recentDrop = restAvg - last7Avg;
    if (recentDrop >= NEWLY_EMERGING_DROP && scoreToStatus(restAvg) !== 'poor') {
      return {
        insightType: 'trend',
        wellnessArea: area,
        trendState: 'newly_emerging',
        trendStrength: strengthFromDelta(recentDrop),
        patternKey: `trend_${area}`,
        title: `${label} has quietly ${trendVerbPast(area, 'declining')} this week`,
        memberSummary: `${label} looks a little different over the last week compared to the weeks before — worth keeping an eye on.`,
        coachDetail: `${label}'s last-7-day average (${last7Avg.toFixed(0)}/100) is meaningfully below the rest of the last 30 days (${restAvg.toFixed(0)}/100) — a new development, not a continuation of an existing pattern.`,
        confidence: confidenceFromSample(last7Scores.length + restOf30Scores.length, 0.5, 20),
        severity: 'notable',
        timeWindow: 'last_7_days',
        evidenceRefs: checkinRangeEvidence(last7Checkins),
        reasoningCodes: [reasoningTitle(area, 'newly_emerging')],
        recommendedCoachingResponse: `A lighter, recovery-oriented approach to ${labelLower} today would be reasonable.`,
        recommendedCoachAction: `Worth a check-in about what changed recently for this member.`,
        memberVisible: true,
      };
    }
  }

  if (delta <= -DECLINE_THRESHOLD) {
    return {
      insightType: 'trend',
      wellnessArea: area,
      trendState: 'declining',
      trendStrength: strengthFromDelta(absDelta),
      patternKey: `trend_${area}`,
      title: `${label} has been ${trendVerb(area, 'declining')}`,
      memberSummary: `${label} has been trending ${trendDirectionWord(area, 'declining')} over the last month compared to the month before.`,
      coachDetail: `${label} averaged ${last30Avg.toFixed(0)}/100 over the last 30 days, down from ${prev30Avg.toFixed(0)}/100 the prior 30 days (${delta.toFixed(0)} point change).`,
      confidence,
      severity: absDelta >= 20 ? 'important' : 'notable',
      timeWindow: 'last_30_days',
      evidenceRefs: evidence,
      reasoningCodes: [reasoningTitle(area, 'declining')],
      recommendedCoachingResponse: `Lean toward easier, more encouraging ${labelLower} coaching until this trend turns.`,
      recommendedCoachAction: `Flag ${labelLower} as a discussion topic at the next check-in.`,
      memberVisible: true,
    };
  }

  if (delta >= IMPROVE_THRESHOLD) {
    return {
      insightType: 'trend',
      wellnessArea: area,
      trendState: 'improving',
      trendStrength: strengthFromDelta(absDelta),
      patternKey: `trend_${area}`,
      title: `${label} has been ${trendVerb(area, 'improving')}`,
      memberSummary: `${label} has been trending ${trendDirectionWord(area, 'improving')} over the last month compared to the month before.`,
      coachDetail: `${label} averaged ${last30Avg.toFixed(0)}/100 over the last 30 days, up from ${prev30Avg.toFixed(0)}/100 the prior 30 days (+${delta.toFixed(0)} points).`,
      confidence,
      severity: 'info',
      timeWindow: 'last_30_days',
      evidenceRefs: evidence,
      reasoningCodes: [reasoningTitle(area, 'improving')],
      recommendedCoachingResponse: `Reinforce what's working for ${labelLower} rather than introducing something new.`,
      recommendedCoachAction: `A good moment to acknowledge this progress with the member.`,
      memberVisible: true,
    };
  }

  // inconsistent: real volatility (a meaningful share of both good and poor days) with no net direction.
  if (last30PoorShare >= 0.25 && last30GoodShare >= 0.25) {
    return {
      insightType: 'trend',
      wellnessArea: area,
      trendState: 'inconsistent',
      trendStrength: strengthFromDelta(absDelta),
      patternKey: `trend_${area}`,
      title: `${label} has been inconsistent`,
      memberSummary: `${label} has been up and down over the last month rather than following one clear direction.`,
      coachDetail: `${label} shows both good and poor days within the last 30 (${Math.round(last30GoodShare * 100)}% good, ${Math.round(last30PoorShare * 100)}% poor) with no net trend (${delta.toFixed(0)} point change).`,
      confidence,
      severity: 'notable',
      timeWindow: 'last_30_days',
      evidenceRefs: evidence,
      reasoningCodes: [reasoningTitle(area, 'inconsistent')],
      recommendedCoachingResponse: `Look for what's different between ${labelLower}'s good days and its harder ones.`,
      recommendedCoachAction: `Worth exploring what varies day to day for this member.`,
      memberVisible: true,
    };
  }

  // stable: no meaningful net change — still worth surfacing for "area to maintain" reasoning, kept low-severity.
  return {
    insightType: 'trend',
    wellnessArea: area,
    trendState: 'stable',
    trendStrength: strengthFromDelta(absDelta),
    patternKey: `trend_${area}`,
    title: `${label} has stayed steady`,
    memberSummary: `${label} has stayed about the same over the last month.`,
    coachDetail: `${label} averaged ${last30Avg.toFixed(0)}/100 over the last 30 days vs. ${prev30Avg.toFixed(0)}/100 the prior 30 days — no meaningful change.`,
    confidence,
    severity: 'info',
    timeWindow: 'last_30_days',
    evidenceRefs: evidence,
    reasoningCodes: [reasoningTitle(area, 'stable')],
    recommendedCoachingResponse: null,
    recommendedCoachAction: null,
    memberVisible: true,
  };
}

export function classifyAllMetricTrends(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  areas: WellnessMetricKey[]
): WellnessInsightDraft[] {
  return areas
    .map((area) => classifyMetricTrend(checkinsOldestFirst, asOfLocalDate, area))
    .filter((draft): draft is WellnessInsightDraft => draft !== null);
}
