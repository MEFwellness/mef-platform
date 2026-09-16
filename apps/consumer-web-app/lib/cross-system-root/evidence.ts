/**
 * RECENCY AND RESOLUTION. Current client information matters more than old
 * history, and a settled symptom must never be presented as a live one.
 *
 * WHY THIS IS ITS OWN FILE. Prompt 3's matcher asked one question of a
 * member's rows: does the latest value clear the threshold. That is the
 * right question for counting against a floor and the wrong one for
 * bringing an area to a coach's attention, because "she had this a year ago
 * and has answered Never twice since" and "she has this now" are the same
 * answer to that question and completely different things to say out loud.
 *
 * THE FIVE STATES, and what decides each. All five carry information, and
 * blending any two of them into one status would throw away the thing a
 * coach actually needs:
 *
 *   CURRENT       the latest row says it is happening, and it is recent.
 *   RECENT        the latest row says it is happening, a little while back.
 *   HISTORICAL    the latest row says it is happening, but it is old, so
 *                 nothing since has confirmed or closed it.
 *   RESOLVED      she reported it once and the latest row says nought.
 *                 This is the bloating case from the brief: present a year
 *                 ago, answered Never on the last two assessments, and it
 *                 appears as history rather than as support.
 *   NOT OBSERVED  the map sent Root to look and there was nothing there.
 *                 An expected finding that is absent is a real finding.
 *
 * A ROW THAT HAS ONLY EVER SAID NOUGHT IS NOT EVIDENCE OF ANYTHING and
 * produces no state at all. She has consistently said no, and turning that
 * into "resolved" would invent a symptom she never had.
 */

import { isPresent } from '@/lib/cross-system-patterns/match';
import type { SignalRecord } from '@/lib/cross-system-signals/types';

/** The five states, kept apart rather than blended into one status. */
export type EvidenceState = 'current' | 'recent' | 'historical' | 'resolved' | 'not_observed';

/**
 * How recent counts as current, and how recent counts as recent.
 *
 * THESE ARE WINDOWS, AND THEY ARE NAMED. A counted claim always says the
 * window it counted, which is this repository's own standing rule, so every
 * coach facing line built on these prints the number of days.
 */
export const CURRENT_WINDOW_DAYS = 30;
export const RECENT_WINDOW_DAYS = 90;

/** Whole days between two bare YYYY-MM-DD local days. Never reads a clock. */
export function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.MAX_SAFE_INTEGER;
  return Math.round((b - a) / 86_400_000);
}

/** One signal and side, with everything she has ever said about it. */
export type SignalHistory = {
  signalSlug: string;
  side: SignalRecord['side'];
  /** Oldest first. */
  rows: SignalRecord[];
  latest: SignalRecord;
};

/**
 * Her rows grouped the way a coach reads them.
 *
 * A LEFT HIP AND A RIGHT HIP STAY TWO HISTORIES, the same grouping key the
 * Signals list and the matcher already use, because they are two things a
 * coach treats separately.
 */
export function groupHistories(records: readonly SignalRecord[]): SignalHistory[] {
  const grouped = new Map<string, SignalRecord[]>();
  for (const record of records) {
    const key = `${record.signalSlug}::${record.side ?? 'none'}`;
    const held = grouped.get(key);
    if (held) held.push(record);
    else grouped.set(key, [record]);
  }

  const out: SignalHistory[] = [];
  for (const rows of grouped.values()) {
    const ordered = [...rows].sort(compareCaptured);
    const latest = ordered[ordered.length - 1]!;
    out.push({
      signalSlug: latest.signalSlug,
      side: latest.side,
      rows: ordered,
      latest,
    });
  }
  return out;
}

function compareCaptured(a: SignalRecord, b: SignalRecord): number {
  if (a.capturedOn !== b.capturedOn) return a.capturedOn.localeCompare(b.capturedOn);
  return a.capturedAt.localeCompare(b.capturedAt);
}

/**
 * Which state one signal's history is in, as of a reference day.
 *
 * Returns null where the history says nothing worth saying: she has only
 * ever reported the thing as absent.
 */
export function evidenceStateOf(
  history: SignalHistory,
  referenceDay: string
): EvidenceState | null {
  const latest = history.latest;

  if (!isPresent(latest)) {
    // THE LATEST ROW SAYS NO. If an earlier one said yes, that is a
    // resolution and it belongs in history. If none ever did, she has
    // simply always said no and there is nothing to report.
    const everPresent = history.rows.some((row) => isPresent(row));
    return everPresent ? 'resolved' : null;
  }

  const age = daysBetween(latest.capturedOn, referenceDay);
  // A row dated AFTER the reference day is still current. A member in a
  // timezone ahead of the day the lookup was triggered from is the ordinary
  // case, not an error, and treating her newest answer as stale would be
  // exactly backwards.
  if (age <= CURRENT_WINDOW_DAYS) return 'current';
  if (age <= RECENT_WINDOW_DAYS) return 'recent';
  return 'historical';
}

/** True for the two states that mean "this is live". */
export function isLiveState(state: EvidenceState): boolean {
  return state === 'current' || state === 'recent';
}
