/**
 * Which real session the Movement screen offers a member today.
 *
 * WHAT THIS REPLACED. Until now that screen generated a session of its own
 * from a hardcoded catalog of sixteen invented exercises: no video, no
 * coaching behind them, and not a thing a member could actually be shown.
 * It is gone. The screen now offers one of the six Root Movement sessions,
 * which are real rows with real exercises and real video.
 *
 * NOTHING NEW WAS INVENTED TO DO IT. The choice is made by
 * selectFallbackMovementSession (lib/coaching-direction/movement.ts), the
 * same function the Priority Card already uses when it offers a session:
 * the one she has gone longest without completing, ties broken by the
 * fixed seeded order. So the screen and the card can never suggest by two
 * different rules.
 *
 * Returns null when there are no live sessions, which is what happens
 * before migration 153 reaches an environment. The screen then simply has
 * no suggestion on it, and the Root Movement list card carries it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MovementSessionSummary } from '@mef/shared-types-contracts';
import {
  isMovementSessionKey,
  selectFallbackMovementSession,
  type MovementSessionKey,
} from '../coaching-direction/movement';
import { getSessionLastCompletedMap, listSessionSummaries } from './data';

export type SuggestedMovementSession = {
  sessionKey: MovementSessionKey;
  summary: MovementSessionSummary;
};

export async function getSuggestedMovementSession(
  supabase: SupabaseClient,
  memberId: string
): Promise<SuggestedMovementSession | null> {
  const [summaries, lastCompleted] = await Promise.all([
    listSessionSummaries(supabase),
    getSessionLastCompletedMap(supabase, memberId),
  ]);

  // A key this build does not recognise is skipped rather than offered
  // with no fixed tie-break position, exactly as loadMovementInput does.
  const known = summaries.filter((s) => isMovementSessionKey(s.template.session_key));
  if (known.length === 0) return null;

  const chosen = selectFallbackMovementSession(
    known.map((s) => ({
      sessionKey: s.template.session_key as MovementSessionKey,
      name: s.template.name,
      lastCompletedLocalDate: lastCompleted.get(s.template.session_key)?.slice(0, 10) ?? null,
    }))
  );
  if (!chosen) return null;

  const summary = known.find((s) => s.template.session_key === chosen.sessionKey);
  if (!summary) return null;

  return { sessionKey: chosen.sessionKey, summary };
}

/**
 * Root Movement sessions she has finished in the last seven days.
 *
 * Counted from member_movement_session_runs, the table that records a real
 * completion of a real session. The Weekly Goal tile used to count rows in
 * movement_sessions, which is where the generated placeholder session was
 * written, so it counted completions of exercises nobody could see. It
 * counts the sessions she actually did now.
 *
 * A rolling seven days by timestamp, matching what the tile has always
 * claimed ("this week" as the last seven days, not a calendar week), so no
 * timezone reasoning is needed for a number that is only ever a count.
 */
export async function countRecentMovementSessionCompletions(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('member_movement_session_runs')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .gte('completed_at', since);

  if (error) {
    console.error('countRecentMovementSessionCompletions failed', error);
    return 0;
  }
  return count ?? 0;
}
