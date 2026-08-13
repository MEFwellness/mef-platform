/**
 * The Weekly Root Review — the privacy boundary, in code.
 *
 * Identical discipline to lib/coaching-direction/evidence.ts and
 * lib/analytics/track.ts, and stricter in one respect: nothing in a review
 * row or a week focus row may be a STRING except a slug from a closed set
 * declared in this codebase. There is no allowlisted free-string field at
 * all, so there is no field a sentence could arrive in.
 *
 * WHAT MAY BE STORED. Which observation kind was earned. Which language
 * tier the publishing system assigned it. That system's own key for the
 * signal (a metric key, a pattern state signal key, a friction kind, a
 * thread key). Its own state slug. Numbers.
 *
 * WHAT MAY NEVER BE STORED, under any key. A check-in answer. A
 * questionnaire response. A pain location. A sleep number as content
 * rather than as a metric of a published signal. A food name. A nutrition
 * detail. A concern category. A safety classification level. Any composed
 * member-facing sentence, including one this feature itself wrote.
 *
 * The last clause is the unusual one and it is deliberate. ./copy.ts is a
 * pure function of the plan, so the review a member reads on Friday is the
 * review she read on Monday without a single word of it having been
 * written to the database. That removes the entire class of bug where a
 * stored sentence turns out to have interpolated something it should not
 * have.
 */

import { isCoachingActionType } from '../coaching-direction/types';
import type { CoachingActionType } from '../coaching-direction/types';
import { QUESTION_KEYS, isQuestionKey, isAnswerOption } from './questions';
import {
  FOCUS_REASONS,
  isFocusReason,
  isObservationKind,
  isWorkedKind,
} from './types';
import type {
  ReviewObservation,
  ReviewPlan,
  ReviewShape,
  ReviewWorked,
  WeekFocus,
} from './types';

/**
 * Every metric key that may appear on an observation, a worked item, or a
 * focus's source evidence. Adding one is the deliberate act of deciding a
 * new behavioral number is worth remembering.
 *
 * Note what is NOT here: no metric name that describes a health VALUE. A
 * count of Daily Resets is behavior. A sleep score is not, and there is
 * deliberately no key it could be stored under. Where an observation needs
 * the strength of a published signal it stores `confidence` and
 * `occurrenceCount`, which are properties of the signal's evidence, not of
 * her body.
 */
export const ALLOWED_METRIC_KEYS = [
  // Consistency.
  'thisWeekResets',
  'priorWeekResets',

  // A published pattern state's own strength.
  'confidence',
  'occurrenceCount',
  'spanDays',

  // The Reset Plan's own weekly classification.
  'normalCount',
  'difficultCount',
  'notTodayCount',
  'loggedCount',

  // The friction signals service's own counts.
  'starts',
  'completions',
  'completionRate',

  // The Part 1 outcome ledger.
  'delivered',
  'acted',
  'ignored',
  'notSeen',
] as const;

export type AllowedMetricKey = (typeof ALLOWED_METRIC_KEYS)[number];

const ALLOWED_METRICS = new Set<string>(ALLOWED_METRIC_KEYS);

/**
 * Every source-evidence key a week focus may carry. Same closed-set rule.
 * String values here must additionally pass `isSlugLike`.
 */
export const ALLOWED_FOCUS_EVIDENCE_KEYS = [
  'signalKey',
  'frictionKind',
  'metricKey',
  'state',
  'tier',
  'confidence',
  'occurrenceCount',
  'delivered',
  'acted',
  'ignored',
  'thisWeekResets',
  'priorWeekResets',
] as const;

const ALLOWED_FOCUS_EVIDENCE = new Set<string>(ALLOWED_FOCUS_EVIDENCE_KEYS);

/**
 * Longest a stored slug may be, and the shape it must have. Same 48 as the
 * two sanitizers this mirrors, and the same reasoning: every legitimate
 * value is an identifier, and an identifier never contains whitespace,
 * while a sentence fragment always will.
 */
export const MAX_SLUG_LENGTH = 48;

export function isSlugLike(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && !/\s/.test(value);
}

/** Numbers only, finite only. Drops rather than throws. */
export function sanitizeMetrics(metrics: Record<string, unknown>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (!ALLOWED_METRICS.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    clean[key] = value;
  }
  return clean;
}

function sanitizeTier(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function sanitizeSlug(value: unknown): string | null {
  return typeof value === 'string' && isSlugLike(value) ? value : null;
}

export function sanitizeObservation(input: unknown): ReviewObservation | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isObservationKind(raw.kind)) return null;
  return {
    kind: raw.kind,
    tier: sanitizeTier(raw.tier),
    signalKey: sanitizeSlug(raw.signalKey),
    state: sanitizeSlug(raw.state),
    metrics: sanitizeMetrics((raw.metrics as Record<string, unknown>) ?? {}),
  };
}

export function sanitizeWorked(input: unknown): ReviewWorked | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isWorkedKind(raw.kind)) return null;
  return {
    kind: raw.kind,
    actionType: isCoachingActionType(raw.actionType) ? (raw.actionType as CoachingActionType) : null,
    metrics: sanitizeMetrics((raw.metrics as Record<string, unknown>) ?? {}),
  };
}

export function sanitizeFocusEvidence(
  evidence: Record<string, unknown>
): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (!ALLOWED_FOCUS_EVIDENCE.has(key)) continue;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) clean[key] = value;
      continue;
    }
    if (typeof value === 'string' && isSlugLike(value)) clean[key] = value;
    // Objects, arrays, booleans and functions never reach the database.
    // Nested structure is exactly how an upstream evidence summary would
    // smuggle a sentence through.
  }
  return clean;
}

export function sanitizeFocus(input: unknown, weekStart: string): WeekFocus | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const actionType = isCoachingActionType(raw.actionType)
    ? (raw.actionType as CoachingActionType)
    : null;
  const threadKey = sanitizeSlug(raw.threadKey);
  if (!actionType && !threadKey) return null;

  return {
    weekStart,
    actionType,
    threadKey,
    reason: isFocusReason(raw.reason) ? raw.reason : FOCUS_REASONS[0],
    sourceEvidence: sanitizeFocusEvidence((raw.sourceEvidence as Record<string, unknown>) ?? {}),
  };
}

/** At most two, both from the closed question set, no duplicates. */
export function sanitizeQuestionKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const value of input) {
    if (!isQuestionKey(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    keys.push(value);
    if (keys.length === MAX_QUESTIONS) break;
  }
  return keys;
}

/** Most weeks ask nothing. Two is the ceiling the brief sets, and it is a real ceiling, enforced here rather than trusted at the call site. */
export const MAX_QUESTIONS = 2;

/** At most 4 observations on a full review, exactly 1 on a thin one. */
export const MAX_OBSERVATIONS = 4;
export const MIN_FULL_OBSERVATIONS = 2;

/**
 * The one function that builds a storable plan, and the one function that
 * reads one back. Both directions go through the same sanitizers, so a row
 * written by an older build (or by hand) can never render something the
 * current vocabulary would refuse to store.
 */
export function sanitizePlan(input: unknown, weekStart: string): ReviewPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const shape: ReviewShape = raw.shape === 'thin' ? 'thin' : 'full';
  const focus = sanitizeFocus(raw.focus, weekStart);
  if (!focus) return null;

  const observations = (Array.isArray(raw.observations) ? raw.observations : [])
    .map(sanitizeObservation)
    .filter((o): o is ReviewObservation => o !== null)
    .slice(0, MAX_OBSERVATIONS);

  const worked = (Array.isArray(raw.worked) ? raw.worked : [])
    .map(sanitizeWorked)
    .filter((w): w is ReviewWorked => w !== null);

  return {
    shape,
    observations,
    worked,
    focus,
    questionKeys: sanitizeQuestionKeys(raw.questionKeys),
  };
}

/**
 * Her stored answers. A map of question key to option slug, both from
 * closed sets. An unrecognized key or option is dropped, which is what
 * makes the stored map unable to hold anything a member typed.
 */
export function sanitizeAnswers(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isQuestionKey(key)) continue;
    if (typeof value !== 'string') continue;
    if (!isAnswerOption(key, value)) continue;
    clean[key] = value;
  }
  return clean;
}

/** Exported for the privacy test, which asserts the two closed sets never grow a free-text field. */
export const PLAN_VOCABULARY = {
  metricKeys: ALLOWED_METRIC_KEYS,
  focusEvidenceKeys: ALLOWED_FOCUS_EVIDENCE_KEYS,
  questionKeys: QUESTION_KEYS,
} as const;
