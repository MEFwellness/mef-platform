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
import { createClient } from '@/lib/supabase/server';
import { loadProgramAttention } from '@/lib/program-lifecycle/coachAttention';
import { loadFeedbackAttention } from '@/lib/programs/feedback/attention';

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

/**
 * The four reasons this file itself produces, named once.
 *
 * They are constants rather than inline strings because the client page's
 * merged "Worth discussing" section maps them onto canonical facts, so an
 * alert and a reason describing the same thing are shown once
 * (lib/coach-week/flags.ts). The other reasons on the list come from
 * lib/programs/feedback/attention.ts and
 * lib/program-lifecycle/coachAttention.ts, which already export theirs.
 *
 * "No check-in logged today" replaced "Missed check-in today" on
 * 2026-09-05. The old wording claimed a decision she may not have made:
 * the day is not over, and an absent row cannot tell "she chose not to"
 * from "she has not opened the app yet". The list and the client page both
 * read this constant, so they cannot come to say it differently.
 */
export const NO_CHECKIN_TODAY_REASON = 'No check-in logged today';
export const WELLNESS_BELOW_THRESHOLD_REASON = 'Daily Wellness Index below threshold';
export const WELLNESS_DROP_REASON = 'Sudden drop in wellness';
export const PAIN_INCREASING_REASON = 'Pain increasing';
export const STRESS_INCREASING_REASON = 'Stress increasing';

export async function buildClientSummary(
  profile: Profile,
  /** Program lifecycle reasons for this client, already fetched in one batched read by buildAllClientSummaries. Omitted when a caller builds one summary on its own. */
  extraAttentionReasons: string[] = []
): Promise<ClientSummary> {
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

  // Program lifecycle (migration 172) and a member's own report about an
  // exercise (migration 177) both reach the coach through the attention
  // surface that already exists rather than through a second notification
  // system. They lead the list because a member who reported pain outranks
  // a missed check-in.
  const attentionReasons: string[] = [...extraAttentionReasons];
  if (!todaysCheckin) attentionReasons.push(NO_CHECKIN_TODAY_REASON);
  if (wellnessIndex && wellnessIndex.score < POOR_INDEX_THRESHOLD) {
    attentionReasons.push(WELLNESS_BELOW_THRESHOLD_REASON);
  }
  if (
    wellnessIndex &&
    previousWellnessIndex &&
    wellnessIndex.score - previousWellnessIndex.score <= -DROP_THRESHOLD
  ) {
    attentionReasons.push(WELLNESS_DROP_REASON);
  }
  if (insights.some((i) => i.key === 'pain' && i.direction === 'declining')) {
    attentionReasons.push(PAIN_INCREASING_REASON);
  }
  if (insights.some((i) => i.key === 'stress' && i.direction === 'declining')) {
    attentionReasons.push(STRESS_INCREASING_REASON);
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
  const supabase = createClient();
  const memberIds = clients.map((client) => client.id);
  // Two batched reads, not two per client. Both land on the same
  // attentionReasons list rather than each inventing a surface: see
  // lib/program-lifecycle/coachAttention.ts and
  // lib/programs/feedback/attention.ts.
  const [programAttention, feedbackAttention] = await Promise.all([
    loadProgramAttention(supabase, memberIds, new Date().toISOString().slice(0, 10)),
    loadFeedbackAttention(supabase, memberIds),
  ]);
  return Promise.all(
    clients.map((client) =>
      buildClientSummary(client, [
        // Safety first in the list, because it is read top down.
        ...(feedbackAttention.get(client.id) ?? []),
        ...(programAttention.get(client.id) ?? []),
      ])
    )
  );
}
