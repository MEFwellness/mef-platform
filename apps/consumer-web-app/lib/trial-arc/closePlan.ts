/**
 * DAY 7, the privacy and honesty boundary, in code.
 *
 * The same discipline as ./recapPlan.ts, and it runs in BOTH directions: a
 * plan is sanitized on the way into the database and again on the way out,
 * so a row written by an older build, by a script, or by hand can never
 * render something the current vocabulary would refuse to store.
 *
 * WHAT MAY BE STORED. A completion branch. A focus kind. A slug from a
 * closed set declared in this codebase (a Life Signal Check signal, a
 * Readiness Pulse pattern, a public entry pattern key, a next step, a door
 * name). Finite counts.
 *
 * WHAT MAY NEVER BE STORED, under any key. A check-in answer. A pain
 * location. A free text goal. An assessment answer. A URL. Any composed
 * member-facing sentence, including one this feature itself wrote. The
 * doors carry a door NAME, never an address: ./closeCopy.ts is handed the
 * addresses at render time from lib/config/conversionLinks.ts, so a link
 * that changes in Vercel changes on a close composed last week too.
 *
 * THE DOORS ARE DEDUPLICATED AND THE LEAD IS FORCED TO BE ONE OF THEM.
 * A plan naming a lead door it does not offer would render a screen leading
 * with a button that is not on it. That is fixed here, in one place, on the
 * way in and on the way out, rather than trusted from whatever composed it.
 *
 * DROPS RATHER THAN THROWS, except where dropping would produce a lie. A
 * malformed focus becomes the thin branch pointed at the free arc's start,
 * which is the honest reading of "I cannot tell what her focus is", never a
 * signal picked to fill the gap. A plan that cannot be made sense of at all
 * comes back null and the caller treats that as "no close".
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import { isTrialArcRecapNextStep } from './recapTypes';
import {
  isCloseSignal,
  isPublicEntryPatternKey,
  isReadinessPattern,
  isTrialArcCloseCompletion,
  isTrialArcCloseDoor,
  isTrialArcCloseFocusKind,
  TRIAL_ARC_CLOSE_DOORS,
  type TrialArcCloseCounts,
  type TrialArcCloseDoor,
  type TrialArcCloseFocus,
  type TrialArcClosePlan,
} from './closeTypes';

/**
 * The honest fallback focus when a stored one cannot be read.
 *
 * It points at Core Values Snapshot, which is where the free arc begins, so
 * the worst a corrupted focus can do is invite her back to the first
 * conversation. It can never invent a signal she did not name.
 */
const UNREADABLE_FOCUS: TrialArcCloseFocus = { kind: 'thin', nextStep: 'core_values_snapshot' };

export function sanitizeCloseFocus(input: unknown): TrialArcCloseFocus {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return UNREADABLE_FOCUS;
  const raw = input as Record<string, unknown>;
  if (!isTrialArcCloseFocusKind(raw.kind)) return UNREADABLE_FOCUS;

  if (raw.kind === 'signal') {
    // A signal focus with no signal is not a focus. It falls back to the
    // thin branch rather than rendering a card with a blank subject.
    if (!isCloseSignal(raw.signal)) return UNREADABLE_FOCUS;
    return {
      kind: 'signal',
      signal: raw.signal,
      readinessPattern: isReadinessPattern(raw.readinessPattern) ? raw.readinessPattern : null,
    };
  }

  return {
    kind: 'thin',
    nextStep: isTrialArcRecapNextStep(raw.nextStep) ? raw.nextStep : 'core_values_snapshot',
  };
}

function wholeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function sanitizeCloseCounts(input: unknown): TrialArcCloseCounts {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    trialDays: wholeCount(raw.trialDays),
    checkinDays: wholeCount(raw.checkinDays),
    // Three free conversations, and no arithmetic anywhere can make it four.
    conversations: Math.min(3, wholeCount(raw.conversations)),
  };
}

/**
 * The doors, deduplicated and in the order this build shows them.
 *
 * Sorted into TRIAL_ARC_CLOSE_DOORS' own order rather than the order they
 * arrived in, because "which door leads" is a separate stored fact and the
 * list is only the set that exists. The renderer puts the lead door first.
 */
export function sanitizeCloseDoors(input: unknown): TrialArcCloseDoor[] {
  const raw = Array.isArray(input) ? input : [];
  const found = new Set(raw.filter(isTrialArcCloseDoor));
  return TRIAL_ARC_CLOSE_DOORS.filter((door) => found.has(door));
}

/**
 * The one function that builds a storable plan and the one that reads one
 * back.
 *
 * THE CONVERSATION DOOR IS THE FLOOR. A plan with no readable door at all
 * gets the conversation door, because that link always resolves (see
 * lib/config/conversionLinks.ts) and a close with no way forward on it is
 * not a close. It is the membership door, and only the membership door,
 * that is genuinely allowed to be absent.
 */
export function sanitizeClosePlan(input: unknown): TrialArcClosePlan | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!isTrialArcCloseCompletion(raw.completion)) return null;

  const doors = sanitizeCloseDoors(raw.doors);
  const offered: TrialArcCloseDoor[] = doors.length > 0 ? doors : ['conversation'];

  // The lead has to be a door that is actually on the screen. A stored lead
  // naming a door that is not offered falls back to the first one that is.
  const storedLead = isTrialArcCloseDoor(raw.leadDoor) ? raw.leadDoor : null;
  const leadDoor = storedLead && offered.includes(storedLead) ? storedLead : offered[0]!;

  return {
    completion: raw.completion,
    arrivalPatternKey: isPublicEntryPatternKey(raw.arrivalPatternKey)
      ? (raw.arrivalPatternKey as PublicEntryPatternKey)
      : null,
    focus: sanitizeCloseFocus(raw.focus),
    doors: offered,
    leadDoor,
    counts: sanitizeCloseCounts(raw.counts),
  };
}

/**
 * Exported for the guard test, which asserts these closed sets never grow a
 * free-text field, rather than only asserting that today's sanitizer
 * happens to drop one.
 */
export const CLOSE_VOCABULARY = {
  doors: [...TRIAL_ARC_CLOSE_DOORS],
  focusKinds: ['signal', 'thin'],
  completions: ['full', 'partial'],
} as const;
