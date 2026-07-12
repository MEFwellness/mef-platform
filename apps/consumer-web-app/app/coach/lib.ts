/**
 * Shared data assembly for the coach pages — not a server action itself
 * (no 'use server'), just a plain helper called from Server Components
 * that composes the real actions/calculators that already exist:
 * getClientCheckins (app/actions/coach.ts), resolveLocalDate (app/actions/
 * checkin.ts), calculateWellnessIndex + detectInsights (lib/wellness/).
 * Nothing here fetches data a second way or recomputes a score — it only
 * assembles what those already return into one shape both the client
 * list and the client detail page consume.
 */

import type { Profile, DailyCheckin } from '@mef/shared-types-contracts';
import { getClientCheckins } from '@/app/actions/coach';
import { resolveLocalDate } from '@/app/actions/checkin';
import {
  calculateWellnessIndex,
  inputsFromCheckin,
  type WellnessIndexResult,
} from '@/lib/wellness/wellness-index';
import { detectInsights, type WellnessInsight } from '@/lib/wellness/insights';

export type ClientTrend = 'up' | 'down' | 'stable';

export type ClientSummary = {
  profile: Profile;
  checkins: DailyCheckin[]; // most recent first, as returned by getClientCheckins
  todaysLocalDate: string;
  todaysCheckin: DailyCheckin | null;
  hasCheckedInToday: boolean;
  lastCheckinDate: string | null;
  wellnessIndex: WellnessIndexResult | null;
  previousWellnessIndex: WellnessIndexResult | null;
  trend: ClientTrend;
  insights: WellnessInsight[];
  attentionReasons: string[];
};

/**
 * local_date is a plain YYYY-MM-DD calendar string — Date.UTC (not
 * `new Date(y, m, d)`, which is local-time and would shift by a day
 * around midnight depending on the server's own timezone) keeps this
 * pure calendar arithmetic. Same fix as app/dashboard/page.tsx's version.
 */
function previousLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return date.toISOString().slice(0, 10);
}

const DROP_THRESHOLD = 15; // points on the 0-100 index scale
const POOR_INDEX_THRESHOLD = 55; // matches scoreToStatus's 'poor' band boundary

export async function buildClientSummary(profile: Profile): Promise<ClientSummary> {
  const timezone = profile.timezone;
  const todaysLocalDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );

  const checkins = await getClientCheckins(profile.id);
  const todaysCheckin = checkins.find((c) => c.local_date === todaysLocalDate) ?? null;
  const yesterdaysLocalDate = previousLocalDate(todaysLocalDate);
  const previousCheckin = checkins.find((c) => c.local_date === yesterdaysLocalDate) ?? null;

  const wellnessIndex = calculateWellnessIndex(inputsFromCheckin(todaysCheckin));
  const previousWellnessIndex = calculateWellnessIndex(inputsFromCheckin(previousCheckin));

  let trend: ClientTrend = 'stable';
  if (wellnessIndex && previousWellnessIndex) {
    if (wellnessIndex.score > previousWellnessIndex.score) trend = 'up';
    else if (wellnessIndex.score < previousWellnessIndex.score) trend = 'down';
  }

  const insights = detectInsights([...checkins].reverse());

  const attentionReasons: string[] = [];
  if (!todaysCheckin) attentionReasons.push('Missed check-in today');
  if (wellnessIndex && wellnessIndex.score < POOR_INDEX_THRESHOLD) {
    attentionReasons.push('Daily Wellness Index below threshold');
  }
  if (
    wellnessIndex &&
    previousWellnessIndex &&
    wellnessIndex.score - previousWellnessIndex.score <= -DROP_THRESHOLD
  ) {
    attentionReasons.push('Sudden drop in wellness');
  }
  if (insights.some((i) => i.key === 'pain' && i.direction === 'declining')) {
    attentionReasons.push('Pain increasing');
  }
  if (insights.some((i) => i.key === 'stress' && i.direction === 'declining')) {
    attentionReasons.push('Stress increasing');
  }

  return {
    profile,
    checkins,
    todaysLocalDate,
    todaysCheckin,
    hasCheckedInToday: todaysCheckin !== null,
    lastCheckinDate: checkins[0]?.local_date ?? null,
    wellnessIndex,
    previousWellnessIndex,
    trend,
    insights,
    attentionReasons,
  };
}

export async function buildAllClientSummaries(clients: Profile[]): Promise<ClientSummary[]> {
  return Promise.all(clients.map((client) => buildClientSummary(client)));
}
