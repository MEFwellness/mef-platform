/**
 * Adaptive Coaching Direction, Part 3 — the coach escalation view. Pure, no
 * I/O.
 *
 * Part 1 already flags a thread `coach_escalated_at` when Root has offered
 * something as written, then as a smaller step, then as a reframe, and has
 * had no response to any of it. It also already raises one
 * intelligence_coach_alerts row saying so. What it never had is a place a
 * coach can look at the thread itself.
 *
 * This module builds that view, and it is deliberately the minimum honest
 * one: what the thread was about, how many approaches were tried, what she
 * did about each of them, and when Root gave up. Four behavioral facts.
 *
 * WHAT A COACH SEES HERE IS NOT HEALTH CONTENT, and that is a property of
 * the data rather than a promise. The only inputs are a thread row
 * (counters, slugs and dates) and the identifying keys out of
 * signal_evidence, which lib/coaching-direction/evidence.ts's closed
 * allowlist has already restricted to library identifiers and numbers. The
 * member's answers, her concern, her pain, her sleep and her food have no
 * path into this file: there is no field they could arrive in.
 *
 * A coach who needs the clinical picture has the whole member record one
 * scroll away on the same page. This section answers a different question,
 * which is what Root tried and what happened.
 */

import type { CoachingActionType, MemberResponse } from './types';

// ---------------------------------------------------------------------
// Plain language for the slugs.
// ---------------------------------------------------------------------

/**
 * What each hierarchy rule is, in a sentence a coach can read without
 * knowing the engine.
 *
 * Exhaustive over the ladder even though two entries can never appear here:
 * safety and re_entry are overrides and are structurally exempt from the
 * adaptation guardrails (lib/priority/select.ts), so neither can ever be
 * escalated. They are present so this map is total rather than partial, for
 * the same reason lib/weekly-review/copy.ts keeps a movement entry.
 */
export const ESCALATION_RULE_LABEL: Record<string, string> = {
  safety: 'An unresolved safety flag',
  re_entry: 'A welcome back after an absence',
  reset_plan_commitment: 'The daily action on her Reset Plan',
  implicated_driver: 'A driver the Case View has implicated',
  qualified_pattern: 'A confirmed pattern from her own data',
  incomplete_action: 'Something she started and left unfinished',
  behavioral_friction: 'A behavior she keeps getting stuck on',
  todays_focus: "The Coaching Brain's focus for the day",
  daily_reset: 'The Daily Reset itself',
  gentle_focus: 'Her own stated goal, offered gently',
};

/** What kind of thing the action asked for. */
export const ESCALATION_ACTION_TYPE_LABEL: Record<CoachingActionType, string> = {
  reset: 'a small daily reset action',
  nutrition: 'a food or water action',
  movement: 'a movement action',
  reflection: 'a noticing or reflection action',
  reconnect: 'an invitation to come back',
};

/** The friction kinds, which are the one thread item that is a readable slug. */
export const ESCALATION_FRICTION_LABEL: Record<string, string> = {
  daily_reset_incomplete: 'the Daily Reset being started and not finished',
  food_logging_lapsed: 'food logging that has gone quiet',
  chronic_save_for_later: 'the priority being saved for later again and again',
};

/**
 * What each item identifier IS, so a uuid on the screen is labelled rather
 * than bare. Keyed by rule, because the same position in a thread key means
 * a different kind of identifier per rule.
 */
export const ESCALATION_ITEM_LABEL: Record<string, string> = {
  reset_plan_commitment: 'Reset Plan',
  implicated_driver: 'Driver',
  qualified_pattern: 'Pattern pair',
  incomplete_action: 'Assessment',
  behavioral_friction: 'Behavior',
  todays_focus: 'Feed item',
};

/** What each recorded response means, for the small response tally. */
export const ESCALATION_RESPONSE_LABEL: Record<MemberResponse, string> = {
  done: 'Marked done',
  help: 'Asked for the smaller step',
  later: 'Saved for later',
  ignored: 'Seen, no action',
  not_seen: 'Never reached her screen',
};

/**
 * The evidence keys that IDENTIFY a signal, as opposed to measuring it.
 *
 * A coach asking "what was this about" wants the identifier, not the
 * strength numbers. Every one of these is already on
 * lib/coaching-direction/evidence.ts's allowlist, so this is a narrowing of
 * an allowlist rather than a new one, and nothing can be surfaced here that
 * was not already storable there.
 */
export const ESCALATION_SIGNAL_KEYS = [
  'signalKey',
  'signalType',
  'frictionKind',
  'driverId',
  'driverDomain',
  'pairKey',
  'assessmentKey',
  'flowKey',
  'featureKey',
  'planId',
] as const;

const SIGNAL_KEY_SET = new Set<string>(ESCALATION_SIGNAL_KEYS);

// ---------------------------------------------------------------------
// The view.
// ---------------------------------------------------------------------

export type EscalationResponseTally = {
  response: MemberResponse;
  label: string;
  count: number;
};

export type EscalationSignalKey = {
  key: string;
  value: string;
};

export type CoachingEscalationView = {
  threadKey: string;
  rule: string;
  /** Plain language, from ESCALATION_RULE_LABEL. */
  ruleLabel: string;
  actionType: CoachingActionType;
  /** Plain language, from ESCALATION_ACTION_TYPE_LABEL. */
  actionTypeLabel: string;
  /** What the specific item was, in plain language where the slug allows it. */
  itemLabel: string | null;
  /** Identifying keys out of the ledger's own sanitized evidence. Never a measurement, never a sentence. */
  signalKeys: EscalationSignalKey[];
  /** Framings tried, which is one more than the number of CHANGES. */
  approachesTried: number;
  /** Every response the ledger recorded for this thread, in the vocabulary's own order. */
  responses: EscalationResponseTally[];
  deliveredCount: number;
  escalatedAt: string;
  /** How many times this thread has reached a coach, including this one. */
  escalationCount: number;
  firstSelectedLocalDate: string | null;
  lastSelectedLocalDate: string | null;
};

/** One thread row, reduced to what this view is allowed to see. */
export type EscalatedThreadRow = {
  threadKey: string;
  rule: string;
  actionType: CoachingActionType;
  approachChanges: number;
  coachEscalatedAt: string;
  escalationCount: number;
  firstSelectedLocalDate: string | null;
  lastSelectedLocalDate: string | null;
};

/** One ledger row for that thread, reduced the same way. */
export type EscalatedThreadDecision = {
  threadKey: string;
  memberResponse: MemberResponse | null;
  signalEvidence: Record<string, string | number | boolean | null>;
};

const RESPONSE_ORDER: MemberResponse[] = ['done', 'help', 'later', 'ignored', 'not_seen'];

/**
 * The item part of a thread key, in plain language where the slug allows.
 *
 * Thread keys are '<rule>::<item or ->'. A friction kind is a readable
 * slug this build owns, so it becomes a phrase. Everything else is a
 * library identifier, so it is LABELLED rather than translated: inventing a
 * friendlier name for a driver uuid would mean resolving it, and resolving
 * it would mean this pure module reading the database.
 */
export function describeThreadItem(rule: string, threadKey: string): string | null {
  const item = threadKey.split('::').slice(1).join('::');
  if (!item || item === '-') return null;

  if (rule === 'behavioral_friction') {
    return ESCALATION_FRICTION_LABEL[item] ?? item;
  }
  const label = ESCALATION_ITEM_LABEL[rule];
  return label ? `${label}: ${item}` : item;
}

/**
 * The identifying keys across every ledger row for one thread, deduped and
 * in the declared order.
 *
 * Values are taken as the ledger stored them, which means they have already
 * been through sanitizeSignalEvidence's closed allowlist and its
 * no-whitespace slug rule. A boolean or a number is stringified; nothing
 * else can be present to stringify.
 */
export function collectSignalKeys(
  decisions: readonly EscalatedThreadDecision[]
): EscalationSignalKey[] {
  const seen = new Map<string, string>();
  for (const decision of decisions) {
    for (const key of ESCALATION_SIGNAL_KEYS) {
      if (seen.has(key)) continue;
      const value = decision.signalEvidence[key];
      if (value === undefined || value === null) continue;
      if (!SIGNAL_KEY_SET.has(key)) continue;
      seen.set(key, String(value));
    }
  }
  return [...seen.entries()].map(([key, value]) => ({ key, value }));
}

/**
 * One escalated thread, as the coach section renders it.
 *
 * `approachesTried` is approachChanges + 1 on purpose: a thread that has
 * changed approach twice was OFFERED three ways. Reporting the change count
 * would understate what Root actually tried by one every time.
 */
export function buildEscalationView(
  thread: EscalatedThreadRow,
  decisions: readonly EscalatedThreadDecision[]
): CoachingEscalationView {
  const mine = decisions.filter((decision) => decision.threadKey === thread.threadKey);

  const responses = RESPONSE_ORDER.map((response) => ({
    response,
    label: ESCALATION_RESPONSE_LABEL[response],
    count: mine.filter((decision) => decision.memberResponse === response).length,
  })).filter((tally) => tally.count > 0);

  return {
    threadKey: thread.threadKey,
    rule: thread.rule,
    ruleLabel: ESCALATION_RULE_LABEL[thread.rule] ?? 'A coaching thread',
    actionType: thread.actionType,
    actionTypeLabel: ESCALATION_ACTION_TYPE_LABEL[thread.actionType],
    itemLabel: describeThreadItem(thread.rule, thread.threadKey),
    signalKeys: collectSignalKeys(mine),
    approachesTried: thread.approachChanges + 1,
    responses,
    deliveredCount: mine.length,
    escalatedAt: thread.coachEscalatedAt,
    escalationCount: Math.max(thread.escalationCount, 1),
    firstSelectedLocalDate: thread.firstSelectedLocalDate,
    lastSelectedLocalDate: thread.lastSelectedLocalDate,
  };
}
