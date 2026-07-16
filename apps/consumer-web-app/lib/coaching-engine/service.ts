/**
 * Orchestrates the Daily Morning Brief — idempotent per (member,
 * local_date), same "generate once, read forever after" pattern
 * lib/feed/service.ts's getOrCreateTodaysFeed already established for the
 * Daily Coaching Feed. Two callers use this identically:
 *  - on-demand, under the member's own session, the first time they open
 *    Dashboard or Today on a new local_date (app/actions/coaching-engine.ts)
 *  - app/api/cron/daily-coaching-scan's service-role client, which
 *    pre-warms every active member's brief once a day so it's already
 *    waiting rather than generated on their first tap
 * Both paths call this exact function so there is only ever one
 * generation path to keep correct.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MorningBrief } from '@mef/shared-types-contracts';
import { getCoachingFocusDecision } from '../brain/service';
import { currentStreakLength } from '../ai/agents/accountability';
import { composeMorningBrief } from './morningBrief';
import {
  getHabitLogsForDateForMember,
  getMorningBrief,
  insertMorningBrief,
  listActiveHabitsForMember,
  listRecentCheckinsForMember,
} from './data';

export async function getOrCreateTodaysMorningBrief(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  firstName: string
): Promise<MorningBrief | null> {
  const existing = await getMorningBrief(supabase, memberId, localDate);
  if (existing) return existing;

  try {
    const [decision, recentCheckins, activeHabits, habitLogsToday] = await Promise.all([
      getCoachingFocusDecision(supabase, memberId, localDate),
      listRecentCheckinsForMember(supabase, memberId, localDate),
      listActiveHabitsForMember(supabase, memberId),
      getHabitLogsForDateForMember(supabase, memberId, localDate),
    ]);

    const composed = composeMorningBrief({
      firstName,
      localDate,
      decision,
      recentCheckins,
      activeHabits,
      habitLogsToday,
      currentStreak: currentStreakLength(recentCheckins),
    });

    return await insertMorningBrief(supabase, memberId, localDate, composed);
  } catch (err) {
    // Best-effort, same discipline as recalculateIntelligenceCore /
    // updateNarrativeForEvent — a Morning Brief failing to generate must
    // never break the Dashboard/Today page render that asked for it.
    console.error('getOrCreateTodaysMorningBrief failed', err);
    return null;
  }
}
