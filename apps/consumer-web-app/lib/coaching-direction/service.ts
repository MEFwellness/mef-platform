/**
 * Adaptive Coaching Direction — orchestration.
 *
 * Three jobs, and none of them is deciding anything. The decision is made
 * by the pure engine in lib/priority/select.ts; this file supplies it with
 * state, persists what it decided, and carries out the two side effects it
 * asked for.
 *
 *   1. Resolve outstanding outcomes. Every delivered decision before today
 *      that never got a response becomes 'ignored' or 'not_seen'. This is
 *      what makes "ignored three days running" a fact rather than an
 *      inference, and it needs no cron: the next render the member does is
 *      the moment the answer becomes knowable.
 *   2. Persist the decision and its thread state.
 *   3. Raise a coach notification when a thread escalates, and when the
 *      safety override fires.
 *
 * THE COACH NOTIFICATION PATH IS NOT NEW. It is intelligence_coach_alerts
 * (migration 34), which already has a member-session insert policy, an
 * assigned-coach read policy, a dedup-and-reopen upsert
 * (lib/intelligence-engine/data.ts's upsertCoachAlert) that protects a
 * coach's dismissal, and a surface the coach already reads. This build
 * writes two of its existing alert types and adds none.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertCoachAlert } from '../intelligence-engine/data';
import { resolveMemberTimezone, trackProductEvent } from '../analytics/track';
import { incrementEscalationCount } from './escalationData';
import { getDailyPriority } from '../priority/data';
import type { SelectedPriority } from '../priority/types';
import type { ThreadChange } from '../priority/select';
import {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  applyApproachChange,
  escalateCoachingThread,
  getCoachingDecision,
  listUnresolvedDecisions,
  recordCoachingDecision,
  recordCoachingResponse,
  touchCoachingThread,
} from './data';
import type { CoachingDecisionRecord, MemberResponse } from './types';

// ---------------------------------------------------------------------
// 1) Resolving outstanding outcomes.
// ---------------------------------------------------------------------

/**
 * Turns every unresolved past decision into 'ignored' or 'not_seen'.
 *
 * The distinction comes from member_daily_priorities.shown_at, which
 * migration 148 already claims atomically the first time the card actually
 * reaches her. A row with shown_at set means the card was on her screen
 * and she did none of the three things; a row without it means she never
 * saw it, which is not evidence about the priority at all.
 *
 * Getting this wrong in the lenient direction would be harmless. Getting
 * it wrong in the strict direction would mean a member who was away for a
 * week came back to find Root had quietly decided she had rejected the
 * same suggestion five times.
 */
export async function resolveOutstandingOutcomes(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<void> {
  const unresolved = await listUnresolvedDecisions(supabase, memberId, todayLocalDate);
  if (unresolved.length === 0) return;

  for (const decision of unresolved) {
    const priority = await getDailyPriority(supabase, memberId, decision.localDate);
    // A done/saved status without a recorded response can only happen for
    // a row written before this build shipped. Reading the status is the
    // honest reconstruction; falling back to shown_at is the honest answer
    // for everything else.
    const response: MemberResponse =
      priority?.status === 'done'
        ? 'done'
        : priority?.status === 'saved'
          ? 'later'
          : priority?.shownAt
            ? 'ignored'
            : 'not_seen';

    await recordCoachingResponse(supabase, memberId, decision.localDate, response);
  }
}

// ---------------------------------------------------------------------
// 2) Persisting the decision.
// ---------------------------------------------------------------------

export type PersistDecisionInput = {
  selected: SelectedPriority;
  threadChanges: ThreadChange[];
  isFollowOn: boolean;
  localDate: string;
};

/**
 * Writes the ledger row, the thread row, and any approach changes or
 * escalations the engine asked for.
 *
 * Order matters. The thread changes are applied FIRST, because the
 * approach the ledger records is the approach the member was actually
 * shown, and an escalated thread must be marked escalated even though it
 * is not the thread that won.
 */
export async function persistCoachingDecision(
  supabase: SupabaseClient,
  memberId: string,
  input: PersistDecisionInput
): Promise<CoachingDecisionRecord | null> {
  for (const change of input.threadChanges) {
    if (change.kind === 'approach_change') {
      await applyApproachChange(supabase, memberId, change.threadKey, change.approach);
      continue;
    }
    const escalated = await escalateCoachingThread(
      supabase,
      memberId,
      change.threadKey,
      change.approach,
      change.reason
    );
    // Only notify on the transition. escalateCoachingThread's own
    // `is null` guard is what makes that true across concurrent renders,
    // and it is the same guard that makes the count and the analytics
    // event below exactly one per escalation rather than one per render.
    if (escalated) {
      await notifyCoachOfEscalation(supabase, memberId, change.threadKey);
      // Part 3. Both are best effort and both are separate from the flag
      // itself, so a deploy that lands before migration 152 loses the
      // count and the event, never the escalation.
      await incrementEscalationCount(supabase, memberId, change.threadKey);
      await trackEscalation(supabase, memberId, change.actionType);
    }
  }

  await touchCoachingThread(supabase, memberId, {
    threadKey: input.selected.threadKey,
    rule: input.selected.rule,
    actionType: input.selected.actionType,
    approach: input.selected.approach,
    localDate: input.localDate,
  });

  const existing = await getCoachingDecision(supabase, memberId, input.localDate);
  if (existing) return existing;

  return recordCoachingDecision(
    supabase,
    memberId,
    {
      localDate: input.localDate,
      rule: input.selected.rule,
      actionType: input.selected.actionType,
      threadKey: input.selected.threadKey,
      approach: input.selected.approach,
      isFollowOn: input.isFollowOn,
      signalEvidence: input.selected.evidence,
    },
    DEFAULT_COMPARISON_WINDOW_DAYS
  );
}

// ---------------------------------------------------------------------
// 3) The coach notification path.
// ---------------------------------------------------------------------

/**
 * A thread Root could not make land.
 *
 * Uses the existing 'recurring_barriers' alert type, which migration 34
 * defines as a recurring barrier to adherence and which
 * lib/intelligence-engine/alerts.ts already raises from low completion of
 * suggested daily coaching actions. A coaching thread that survived two
 * approach changes with no response is precisely that, so this widens no
 * vocabulary and adds no second escalation path.
 *
 * The alert names the thread key and nothing else. A thread key is a rule
 * slug and a library identifier; it carries no health content, and a coach
 * with the real record in front of them does not need this alert to
 * summarize it.
 */
async function notifyCoachOfEscalation(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string
): Promise<void> {
  try {
    await upsertCoachAlert(
      supabase,
      memberId,
      {
        alertType: 'recurring_barriers',
        severity: 'notable',
        title: 'A coaching thread stopped landing',
        reason:
          `Root offered this priority as written, then as a smaller step, and had no response to either. ` +
          `It has been set aside and will not be shown again. Thread: ${threadKey}.`,
        alertKey: `coaching_direction_escalation::${threadKey}`,
        evidenceRefs: [],
        sourceRefs: [],
      },
      // An event, not a recomputed condition: the intelligence engine's own
      // sweep must never close this one on the next page view (migration 192).
      'coaching_direction'
    );
  } catch (error) {
    console.error('notifyCoachOfEscalation failed', error);
  }
}

/**
 * The Part 3 analytics event for an escalation.
 *
 * Behavioral only: which KIND of action stopped landing, from the closed
 * set in ./types.ts. Deliberately NOT the thread key, which would let a
 * rollup name one member's specific continuing conversation, and
 * deliberately not the escalation reason, the rule's copy or any evidence.
 *
 * Rides the same one-per-escalation transition guard as the coach alert
 * above, so a thread that stays escalated for a month produces one event.
 */
async function trackEscalation(
  supabase: SupabaseClient,
  memberId: string,
  actionType: string
): Promise<void> {
  try {
    const timezone = await resolveMemberTimezone(supabase, memberId);
    await trackProductEvent(supabase, {
      memberId,
      eventType: 'coaching_thread_escalated',
      timezone,
      payload: { actionType },
    });
  } catch (error) {
    console.error('trackEscalation failed', error);
  }
}

/**
 * The safety override fired.
 *
 * Uses the existing 'needs_review' alert type. Deduped on the
 * classification id, so the alert is raised once per unresolved flag and
 * not once per day she opens the app while it is open.
 *
 * The alert says a flag is open and points at the row. It does NOT restate
 * the concern, the level, the urgency or the category: the Coach Review
 * Queue entry that the check-in itself already created holds all of that,
 * a coach reads it there, and copying health content into a second table
 * is exactly the duplication this build exists not to do.
 */
export async function notifyCoachOfSafetyFlag(
  supabase: SupabaseClient,
  memberId: string,
  safetyClassificationId: string
): Promise<void> {
  try {
    await upsertCoachAlert(
      supabase,
      memberId,
      {
        alertType: 'needs_review',
        severity: 'important',
        title: 'An unresolved check-in safety flag is open',
        reason:
          'A safety classification raised by this member\'s daily check-in has not been acknowledged. ' +
          'Root has stopped asking anything of her while it is open. The full record is in the Coach Review Queue.',
        alertKey: `coaching_direction_safety::${safetyClassificationId}`,
        evidenceRefs: [],
        sourceRefs: [],
      },
      'coaching_direction'
    );
  } catch (error) {
    console.error('notifyCoachOfSafetyFlag failed', error);
  }
}

/**
 * Records what she did about today's action. Called by the card's three
 * server actions, so the ledger and the card's own status row can never
 * disagree about what happened.
 */
export async function recordCardResponse(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  response: MemberResponse
): Promise<void> {
  try {
    await recordCoachingResponse(supabase, memberId, localDate, response);
  } catch (error) {
    console.error('recordCardResponse failed', error);
  }
}
