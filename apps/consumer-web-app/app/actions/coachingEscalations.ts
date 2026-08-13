'use server';

/**
 * Adaptive Coaching Direction Part 3 — the coach's two actions for a
 * flagged coaching thread.
 *
 * Reads only, plus one resolve. Nothing here computes anything: the
 * escalation was decided by Part 1's adaptation guardrails, the counts come
 * out of the outcome ledger, and the view is assembled by the pure builder
 * in lib/coaching-direction/escalation.ts.
 *
 * AUTHORIZATION, the same way every other coach-facing action in this
 * codebase does it. The READ uses the coach's own session-scoped client, so
 * migration 150's `coach_read_assigned_coaching_threads` policy is the real
 * boundary: an id for a member this coach is not assigned to simply returns
 * no rows, not a permissions error. The RESOLVE goes through migration
 * 152's `resolve_coaching_escalation` function, which checks the coach
 * relationship with the same two database functions those policies use. In
 * neither case is an application-level check the thing standing between one
 * coach and another coach's member.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveMemberTimezone, trackProductEvent } from '@/lib/analytics/track';
import { buildEscalationView } from '@/lib/coaching-direction/escalation';
import type { CoachingEscalationView } from '@/lib/coaching-direction/escalation';
import {
  ESCALATION_COOLDOWN_DAYS,
  getThreadActionType,
  listDecisionsForThreads,
  listEscalatedThreadRows,
  resolveCoachingEscalation,
} from '@/lib/coaching-direction/escalationData';
import { coachingServiceRoleClient } from '@/lib/coaching-direction/serviceRole';
import type { ActionResult } from './auth';

export type { CoachingEscalationView };

/**
 * Every thread Root has flagged for one member, newest first.
 *
 * Returns an empty array for every failure mode there is: no session, no
 * escalations, a member this coach cannot see, or migration 152 not applied
 * yet. The coach section renders its own empty state from that, which is
 * the honest thing to show in all four cases: Root has flagged nothing that
 * this coach can act on.
 */
export async function getClientCoachingEscalationsAction(
  clientId: string
): Promise<CoachingEscalationView[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const threads = await listEscalatedThreadRows(supabase, clientId);
    if (threads.length === 0) return [];

    const decisions = await listDecisionsForThreads(
      supabase,
      clientId,
      threads.map((thread) => thread.threadKey)
    );

    return threads.map((thread) => buildEscalationView(thread, decisions));
  } catch (error) {
    console.error('getClientCoachingEscalationsAction failed', error);
    return [];
  }
}

/**
 * The coach clears one flag.
 *
 * Two side effects and no more: the database function resolves the thread
 * (clearing the flag, resetting the counters, and setting the cooldown),
 * and one behavioral analytics event is recorded.
 *
 * THE EVENT IS WRITTEN THROUGH THE SERVICE-ROLE CONNECTION, with source
 * 'coach'. member_wellness_events (migration 63) has a member insert policy
 * and a coach READ policy, and no coach insert policy. The event belongs in
 * the member's own stream, because that is where the escalation it closes
 * was recorded, so the choice is between widening that health-adjacent
 * table's write surface for one behavioral row or using the connection
 * migration 149 already names as trusted infrastructure. The second is the
 * smaller change. Absent the key, the resolve still succeeds and the event
 * is simply not written, which is the correct degradation.
 */
export async function resolveCoachingEscalationAction(
  clientId: string,
  threadKey: string
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (typeof threadKey !== 'string' || threadKey.length === 0 || threadKey.length > 200) {
    return { error: 'That thread could not be identified.' };
  }

  // Read before resolving: the resolve clears the flag, and the event wants
  // to say which KIND of thing was resolved. Taken from the row rather than
  // from the browser.
  const actionType = await getThreadActionType(supabase, clientId, threadKey);

  const { resolved, error } = await resolveCoachingEscalation(
    supabase,
    clientId,
    threadKey,
    ESCALATION_COOLDOWN_DAYS
  );

  if (error) return { error: 'That could not be resolved right now. Please try again.' };
  if (!resolved) return { error: 'That thread is no longer flagged.' };

  try {
    const analytics = coachingServiceRoleClient();
    if (analytics) {
      const timezone = await resolveMemberTimezone(analytics, clientId);
      await trackProductEvent(analytics, {
        memberId: clientId,
        eventType: 'coaching_escalation_resolved',
        timezone,
        source: 'coach',
        // Which KIND of thing was resolved, from the closed set, read off
        // the row above. Never the thread key, never what the thread was
        // about. Built additively because exactOptionalPropertyTypes is on.
        ...(actionType ? { payload: { actionType } } : {}),
      });
    }
  } catch (analyticsError) {
    console.error('coaching_escalation_resolved event failed', analyticsError);
  }

  return {};
}
