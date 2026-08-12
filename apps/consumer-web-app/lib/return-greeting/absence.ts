/**
 * The one absence ladder.
 *
 * Before the Priority Card there was exactly one absence-aware behavior in
 * the app: the Root Presence System's No-Guilt Return greeting, which
 * fires on a multi-day CHECK-IN gap (./copy.ts's
 * RETURN_GREETING_MIN_GAP_DAYS = 3) and is claimed once per gap episode in
 * member_return_greetings (migration 143). The Priority Card adds a second,
 * stronger absence behavior: a re-entry opening that suspends the normal
 * priority hierarchy entirely when the member has been genuinely ABSENT
 * (no sign-in at all) for a week or more.
 *
 * Those are two different measurements of two different things, and left
 * side by side they would have produced exactly the incoherence the build
 * brief warns about: a member returning after two weeks getting a warm
 * "I'm glad you're back" from one system while a second system
 * independently decided to take over her screen, each unaware of the
 * other. So this file, inside the Root Presence module rather than beside
 * it, is where BOTH thresholds live and where the precedence between them
 * is decided once.
 *
 * The reconciliation, stated plainly:
 *
 *   * There is still only ONE greeting sentence in the product
 *     (RETURN_GREETING_TEXT) and only ONE thing that may claim it
 *     (lib/coaching-engine/service.ts's resolveReturnGreeting, writing
 *     member_return_greetings). The Priority Card never writes that table
 *     and never authors a competing welcome line — when re-entry wins, the
 *     card speaks Root's same, already-established sentence.
 *   * A check-in gap is the WEAKER signal and keeps its existing, unchanged
 *     behavior: 3+ days without checking in earns the greeting, wherever
 *     the Morning Brief renders. Nothing about that changed here.
 *   * A sign-in absence is the STRONGER signal, because it means she was
 *     not in the app at all rather than simply not logging. 7+ days of it
 *     escalates the same episode from "greet her" to "suspend the ladder
 *     and rebuild gently", which is a change of degree in one system, not
 *     a second system.
 *
 * `classifyPresence` is the single entry point that returns which of those
 * three states a member is in, and it is deliberately the only place the
 * two thresholds are ever compared. It calls `isEligibleForReturnGreeting`
 * rather than re-testing the 3-day rule itself, so the greeting threshold
 * still has exactly one definition.
 *
 * Pure, no I/O — same draft/service split as the rest of this module and
 * every other engine in the codebase.
 */

import { isEligibleForReturnGreeting } from './gate';

/**
 * The re-entry threshold, named as the build brief requires rather than
 * inlined as a bare 7. Deliberately more than double the greeting's own
 * 3-day check-in gap: three days off is an ordinary rhythm interruption
 * that deserves a warm line and nothing more, while a full week with no
 * sign-in at all is a genuine absence, where showing her a stack of things
 * she did not do would be the single most likely reason she leaves again.
 */
export const RE_ENTRY_MIN_ABSENCE_DAYS = 7;

/**
 * Which absence state a member is in right now.
 *
 *   'present'         — normal. The priority hierarchy runs as usual and
 *                       no greeting is owed.
 *   'return_greeting' — a real multi-day check-in gap. Root Presence's
 *                       existing behavior, unchanged: she is greeted, and
 *                       the priority hierarchy still runs normally.
 *   're_entry'        — a genuine absence. The hierarchy is suspended and
 *                       the card carries a soft welcome back instead.
 */
export type PresenceState = 'present' | 'return_greeting' | 're_entry';

export type PresenceInput = {
  /**
   * Whole days between her last real check-in and today, or null if she
   * has never checked in at all. Exactly the value
   * `isEligibleForReturnGreeting` already takes.
   */
  daysSinceLastCheckin: number | null;
  /**
   * Whole days between her last sign-in BEFORE today and today, or null if
   * she has no earlier sign-in on record. Null is never re-entry: a member
   * who has never signed in before has no absence to return from, the same
   * fail-closed shape the greeting gate uses for a member who has never
   * checked in.
   *
   * Must exclude today's own sign-in. The visit that surfaces this state
   * has itself just written a `session_started` row, so counting it would
   * make every returning member look present.
   */
  daysSinceLastSignIn: number | null;
};

/**
 * The precedence, highest first. Re-entry outranks the greeting because it
 * is the same episode seen through a stronger signal, never a competing
 * claim about a different one.
 */
export function classifyPresence(input: PresenceInput): PresenceState {
  if (
    input.daysSinceLastSignIn !== null &&
    input.daysSinceLastSignIn >= RE_ENTRY_MIN_ABSENCE_DAYS
  ) {
    return 're_entry';
  }
  if (isEligibleForReturnGreeting(input.daysSinceLastCheckin)) {
    return 'return_greeting';
  }
  return 'present';
}

/** Convenience predicate for the priority engine's rule 0. */
export function isReEntry(input: PresenceInput): boolean {
  return classifyPresence(input) === 're_entry';
}
