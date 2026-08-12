/**
 * Adaptive Coaching Direction — the guardrails. Pure, no I/O, so what the
 * engine does when it is not working can be tested without a database, the
 * same draft/service split every other engine in this codebase uses.
 *
 * Three rules, and each one exists to stop a specific failure:
 *
 *   1. SAME PRIORITY IGNORED THREE DAYS RUNNING → change approach.
 *      An engine that keeps saying the same sentence to someone who is not
 *      answering is not adaptive, it is a nag. On the third consecutive
 *      ignored day the thread moves to its next framing.
 *
 *   2. TWO APPROACH CHANGES WITH NO MEMBER RESPONSE → escalate to a coach
 *      and stop selecting it. At that point Root has tried the thing, a
 *      smaller version of the thing, and a reframing of the thing, and has
 *      learned only that it is not landing. Continuing is the failure
 *      mode; handing it to a person is the correct answer.
 *
 *   3. YESTERDAY'S ACTION WAS COMPLETED → prefer a follow-on.
 *      When she finished something and the same thing is still a live
 *      candidate today, continuing it beats starting an unrelated one.
 *      This only ever REORDERS candidates the hierarchy already admits; it
 *      can never promote something the hierarchy declined, and it can
 *      never outrank the safety or re-entry overrides.
 *
 * Nothing here reads or touches health content. It operates entirely on
 * counters.
 */

import type { CoachingThreadState, MemberResponse } from './types';
import { isEngagedResponse } from './types';

/** Consecutive ignored days before the engine must change how it is asking. */
export const IGNORES_BEFORE_APPROACH_CHANGE = 3;

/** Approach changes with no response before the thread goes to a coach. */
export const CHANGES_BEFORE_ESCALATION = 2;

/**
 * The framings, in order. Named as data so the copy layer, the schema
 * check constraint and the tests all read the same three values.
 *
 *   0 AS_WRITTEN  the priority exactly as its rule produced it.
 *   1 SMALLER     the rule's own smaller step promoted to be the priority.
 *                 Every rule already authors one for "Help me", so this
 *                 invents no new copy and makes no new claim.
 *   2 REFRAMED    the same priority, offered with an explicit way out of
 *                 it. Root naming that its own suggestion has not landed,
 *                 rather than naming anything about her.
 */
export const APPROACH_AS_WRITTEN = 0;
export const APPROACH_SMALLER = 1;
export const APPROACH_REFRAMED = 2;
export const MAX_APPROACH = APPROACH_REFRAMED;

/** The one escalation reason this build writes. A slug, never prose. */
export const ESCALATION_REASON_NO_RESPONSE = 'no_response_after_two_changes';

/**
 * '<rule>::<priority key>'. The stable identity of one continuing
 * coaching conversation, across days and across framings. A rule with no
 * specific item (the re-entry opening, the two fallback halves) has one
 * thread of its own rather than a thread per day, which is what makes
 * "the same fallback, ignored three days running" a fact the engine can
 * see.
 */
export function threadKeyFor(rule: string, priorityKey: string | null): string {
  return `${rule}::${priorityKey ?? '-'}`;
}

export type AdaptationOutcome = {
  /** The framing to use now. */
  approach: number;
  /** True when this run is the moment the approach changed. */
  changed: boolean;
  /** True when this run is the moment the thread must be handed to a coach. */
  escalate: boolean;
  /** True when the thread may not be selected at all, now or ever again. */
  blocked: boolean;
};

const UNTOUCHED: AdaptationOutcome = {
  approach: APPROACH_AS_WRITTEN,
  changed: false,
  escalate: false,
  blocked: false,
};

/**
 * What should happen to one thread the engine is about to consider.
 *
 * Deliberately takes the thread state rather than the member id: this is
 * the whole decision, and it is a function of four counters. An already
 * escalated thread is blocked without further thought, which is what makes
 * "stop selecting it" a property of the data rather than a promise.
 */
export function adaptThread(thread: CoachingThreadState | null): AdaptationOutcome {
  if (!thread) return UNTOUCHED;

  if (thread.coachEscalatedAt) {
    return { approach: thread.approach, changed: false, escalate: false, blocked: true };
  }

  if (thread.consecutiveIgnored < IGNORES_BEFORE_APPROACH_CHANGE) {
    return { approach: thread.approach, changed: false, escalate: false, blocked: false };
  }

  // Three ignored days. The approach must change.
  const approach = Math.min(thread.approach + 1, MAX_APPROACH);
  const changes = thread.approachChanges + 1;

  // Two changes, and nothing she did in between counted as a response.
  // Root has run out of honest things to try on its own.
  const escalate =
    changes >= CHANGES_BEFORE_ESCALATION && thread.responsesSinceLastChange === 0;

  return { approach, changed: true, escalate, blocked: escalate };
}

/**
 * How a thread's counters move after a response is recorded. Pure so the
 * arithmetic is testable without a database; ./data.ts applies it.
 *
 * Only 'ignored' advances the ignore streak. 'not_seen' is deliberately
 * inert in both directions: a day she never opened the app is not evidence
 * about the priority, and treating it as either a rejection or a response
 * would corrupt both guardrails.
 */
export function threadCountersAfterResponse(
  thread: CoachingThreadState,
  response: MemberResponse
): Pick<CoachingThreadState, 'consecutiveIgnored' | 'responsesSinceLastChange'> {
  if (response === 'not_seen') {
    return {
      consecutiveIgnored: thread.consecutiveIgnored,
      responsesSinceLastChange: thread.responsesSinceLastChange,
    };
  }

  if (response === 'ignored') {
    return {
      consecutiveIgnored: thread.consecutiveIgnored + 1,
      responsesSinceLastChange: thread.responsesSinceLastChange,
    };
  }

  // She touched the card. The streak is over and the change she was shown
  // is now a change she has responded to.
  return {
    consecutiveIgnored: 0,
    responsesSinceLastChange: thread.responsesSinceLastChange + (isEngagedResponse(response) ? 1 : 0),
  };
}

/**
 * Yesterday's decision, reduced to the only two facts the follow-on rule
 * needs. Deliberately not the whole record: this rule may not see the
 * evidence, the copy or the rule, only whether the thing was finished.
 */
export type FollowOnContext = {
  threadKey: string;
  completed: boolean;
};

export function followOnThreadKey(context: FollowOnContext | null): string | null {
  if (!context || !context.completed) return null;
  return context.threadKey;
}
