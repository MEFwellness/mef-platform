/**
 * Adaptive Coaching Direction — the vocabulary.
 *
 * This module is the DECISION LAYER's memory, not an intelligence system.
 * It computes no correlation, no driver state, no trend, no score and no
 * content. It records which of the Priority Card's existing rules won, on
 * which framing, and what the member did about it, so a later grading pass
 * can ask whether any of it helped.
 *
 * The selection hierarchy itself still lives in lib/priority/select.ts,
 * which is the card's one ladder. Nothing here is a second ladder.
 */

/**
 * What KIND of thing an action asks for. Deliberately a small, closed set:
 * a grading pass needs to compare "did reset actions land better than
 * reflection actions" without ever reading what any individual action
 * said.
 *
 * 'movement' is in the schema and is deliberately NOT emittable. There are
 * no movement sessions in this product yet, so an action typed as movement
 * would be an action with nothing behind it. `isEmittableActionType`
 * below is the guard, and lib/priority/select.ts drops any candidate that
 * fails it and carries on down the ladder rather than showing it.
 */
export const COACHING_ACTION_TYPES = [
  'reset',
  'nutrition',
  'movement',
  'reflection',
  'reconnect',
] as const;

export type CoachingActionType = (typeof COACHING_ACTION_TYPES)[number];

export function isCoachingActionType(value: unknown): value is CoachingActionType {
  return typeof value === 'string' && (COACHING_ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * The one action type the engine may never emit, named as data rather
 * than inlined as a literal, so the guard, the schema comment and the
 * test all read the same value.
 */
export const BLOCKED_ACTION_TYPES: readonly CoachingActionType[] = ['movement'];

export const BLOCKED_ACTION_TYPE_REASON =
  'Movement sessions do not exist in this product yet, so a movement action would have nothing behind it.';

export function isEmittableActionType(value: CoachingActionType): boolean {
  return !BLOCKED_ACTION_TYPES.includes(value);
}

/**
 * What the member did about a delivered action.
 *
 *   done      she marked it done
 *   help      she opened the smaller step
 *   later     she set it aside for today
 *   ignored   the card reached her and she did none of the above
 *   not_seen  the card was never actually shown to her
 *
 * The last two are genuinely different facts. Collapsing them would make
 * the adaptation guardrails treat a day she never opened the app as a day
 * she declined, which is the single most likely way an adaptive system
 * becomes a nagging one.
 */
export const MEMBER_RESPONSES = ['done', 'help', 'later', 'ignored', 'not_seen'] as const;

export type MemberResponse = (typeof MEMBER_RESPONSES)[number];

export function isMemberResponse(value: unknown): value is MemberResponse {
  return typeof value === 'string' && (MEMBER_RESPONSES as readonly string[]).includes(value);
}

/** The three the member can actually produce by touching the card. */
export const CARD_RESPONSES = ['done', 'help', 'later'] as const;

export type CardResponse = (typeof CARD_RESPONSES)[number];

/**
 * Which responses count as "the member responded" for the escalation
 * guardrail. Setting something aside IS a response: she saw it, considered
 * it and made a decision about it. Only silence is silence.
 */
export function isEngagedResponse(response: MemberResponse | null): boolean {
  return response === 'done' || response === 'help' || response === 'later';
}

/**
 * One thread's adaptation state, as read from member_coaching_threads.
 * Counters and dates only.
 */
export type CoachingThreadState = {
  threadKey: string;
  rule: string;
  actionType: CoachingActionType;
  /** 0 as written, 1 its own smaller step, 2 the reframe. See ./adaptation.ts. */
  approach: number;
  approachChanges: number;
  consecutiveIgnored: number;
  responsesSinceLastChange: number;
  firstSelectedLocalDate: string | null;
  lastSelectedLocalDate: string | null;
  coachEscalatedAt: string | null;
  coachEscalationReason: string | null;
  /**
   * The local date before which a coach-resolved thread may not be
   * selected again (Part 3, migration 152). Null when the thread has never
   * been escalated, or has been escalated and not yet resolved.
   *
   * Read through its own fail-closed query
   * (lib/coaching-direction/escalationData.ts's listThreadCooldowns) rather
   * than through the thread row's own column list, so that before
   * migration 152 exists this is simply never set and the engine behaves
   * exactly as Part 1 did.
   */
  escalationCooldownUntil: string | null;
};

/**
 * Evidence is signal KEYS and numeric METRICS only. The type is as narrow
 * as the rule: no nested objects, no arrays, no free strings beyond short
 * slugs. ./evidence.ts enforces it at runtime; this only makes the
 * intent visible at the call site.
 */
export type SignalEvidence = Record<string, string | number | boolean | null>;

/** One delivered decision, as read from member_coaching_decisions. */
export type CoachingDecisionRecord = {
  id: string;
  localDate: string;
  rule: string;
  actionType: CoachingActionType;
  threadKey: string;
  approach: number;
  isFollowOn: boolean;
  signalEvidence: SignalEvidence;
  memberResponse: MemberResponse | null;
  respondedAt: string | null;
  comparisonReferenceDate: string;
  comparisonWindowDays: number;
  comparisonAfterCompleteOn: string;
};

/** What ./service.ts writes when the engine delivers a decision. */
export type RecordDecisionInput = {
  localDate: string;
  rule: string;
  actionType: CoachingActionType;
  threadKey: string;
  approach: number;
  isFollowOn: boolean;
  signalEvidence: SignalEvidence;
};
