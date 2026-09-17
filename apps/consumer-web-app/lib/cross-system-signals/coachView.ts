/**
 * What the coach's Signals section shows, built from stored rows.
 *
 * PURE. It is handed the records and the library and it returns a shape.
 * No query, no clock, no severity invented anywhere: the value on a row is
 * the value the member gave or the coach tapped, and nothing here grades,
 * ranks or interprets one.
 *
 * NO CORRELATION LIVES HERE, and there is no field one could arrive in.
 * The relationship definitions and the pattern cards are Prompt 3. This
 * groups by category, shows the latest value per signal, and opens onto
 * the older dated entries for that signal. That is all.
 *
 * THE SOURCE IS ALWAYS VISIBLE, on the latest row and on every older one,
 * because a value with no provenance is an assertion rather than a
 * finding.
 */

import { findBodyArea, findCategory } from './library';
import type { SignalLibrary, SignalRecord, SignalSide } from './types';
import { isPresent } from '@/lib/cross-system-patterns/match';
import {
  CURRENT_WINDOW_DAYS,
  compareCaptured,
  daysBetween,
  evidenceStateOf,
} from '@/lib/cross-system-root/evidence';
import {
  STATE_LABELS,
  SUPERSEDED_ANSWER_LINE,
  answerBasisLine,
  currentlySupportedByLine,
} from '@/lib/cross-system-root/copy';

/** How a side reads on the screen. Not a lookup table in a component, so every surface says it the same way. */
export const SIDE_LABELS: Record<SignalSide, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
  not_applicable: 'N/A',
};

/** One dated observation, as a row in a signal's history. */
export type SignalHistoryEntry = {
  id: string;
  valueLabel: string;
  sourceLabel: string;
  capturedOn: string;
  note: string | null;
  /** The exact stimulus the member was answering, when the source had one. */
  sourceQuestionPrompt: string | null;
  /**
   * WHICH FREE TEXT SURFACE THE WORDS ARRIVED ON, for a row that came out
   * of a sentence, and null for every row that did not.
   *
   * WHY THE SOURCE LABEL IS NOT ENOUGH. Every classified complaint files
   * under one of two sources, "Reported by the member" or "Reported to the
   * coach", and before this build exactly one surface existed so a coach
   * could safely assume where it came from. Nine surfaces write here now.
   * "She said this in her Evening Reflection" and "she said this in a
   * message to me" are different things to a coach, and the row has to be
   * able to say which.
   */
  complaintSurfaceLabel: string | null;
  sideLabel: string | null;
  entryMode: SignalRecord['entryMode'];
  /**
   * For a Body Systems Survey answer the survey rule judged: why it is, or
   * is not, an active signal. Null for an Often or Almost always answer
   * from her newest sitting, which needs no explaining, and for every row
   * that is not a survey answer.
   */
  ruleLine: string | null;
};

/** One standardized signal for one member: its latest value, and everything before it. */
export type SignalGroupRow = {
  signalSlug: string;
  signalName: string;
  /** Where on the body, when the signal has a where. */
  bodyAreaLabel: string | null;
  sideLabel: string | null;
  latest: SignalHistoryEntry;
  /** Older entries, newest first. Empty when this signal has been recorded once. */
  history: SignalHistoryEntry[];
  /** Every distinct source this signal has ever come from, in the order first seen. */
  sourceLabels: string[];
  /**
   * Its state on her timeline today, in Root's own words ("Current",
   * "Reported before, not current"), or null when the view was built with
   * no reference day or she has only ever said it is absent.
   */
  stateLabel: string | null;
  /**
   * "Currently supported by: ..." naming every source whose own latest word
   * on this signal is present, recent, and not closed by a later answer.
   * Null when no source currently supports it.
   */
  supportLine: string | null;
};

/** One category's rows. */
export type SignalCategoryGroup = {
  categoryKey: string;
  categoryLabel: string;
  position: number;
  rows: SignalGroupRow[];
};

export type CoachSignalsView = {
  groups: SignalCategoryGroup[];
  /** How many distinct standardized signals this member has. */
  signalCount: number;
  /** How many dated rows sit behind them. */
  entryCount: number;
  /** The most recent capture day across everything, or null when she has none. */
  latestCapturedOn: string | null;
};

const EMPTY_VIEW: CoachSignalsView = {
  groups: [],
  signalCount: 0,
  entryCount: 0,
  latestCapturedOn: null,
};

function entryOf(record: SignalRecord): SignalHistoryEntry {
  return {
    id: record.id,
    valueLabel: record.valueLabel,
    sourceLabel: record.sourceLabel,
    capturedOn: record.capturedOn,
    note: record.note,
    sourceQuestionPrompt: record.sourceQuestionPrompt,
    complaintSurfaceLabel: record.complaintSurfaceLabel,
    sideLabel: sideLabelOf(record.side),
    entryMode: record.entryMode,
    ruleLine: ruleLineOf(record),
  };
}

function ruleLineOf(record: SignalRecord): string | null {
  const verdict = record.questionnaire;
  if (!verdict) return null;
  if (verdict.superseded) return SUPERSEDED_ANSWER_LINE;
  if (verdict.basis === 'often_or_more') return null;
  return answerBasisLine(verdict.basis, {
    supportingSourceLabels: verdict.supportingSourceLabels,
    relatedTitles: [],
  });
}

/**
 * THE SOURCES THAT SUPPORT A SIGNAL NOW.
 *
 * Per source, that source's own latest row. It supports the signal when it
 * is present, it is within Root's current window of the reference day, and
 * no row from ANY source captured after it says the signal is absent. That
 * last condition is what keeps "she wrote about headaches last week, and
 * her survey since says Never" from claiming both.
 */
export function currentSupportingSources(
  rows: readonly SignalRecord[],
  referenceDay: string
): string[] {
  const ordered = [...rows].sort(compareCaptured);
  let lastClosing: SignalRecord | null = null;
  for (const row of ordered) if (!isPresent(row)) lastClosing = row;

  const latestBySource = new Map<string, SignalRecord>();
  for (const row of ordered) latestBySource.set(row.sourceKey, row);

  const labels: string[] = [];
  for (const row of latestBySource.values()) {
    if (!isPresent(row)) continue;
    if (daysBetween(row.capturedOn, referenceDay) > CURRENT_WINDOW_DAYS) continue;
    if (lastClosing && compareCaptured(row, lastClosing) < 0) continue;
    if (!labels.includes(row.sourceLabel)) labels.push(row.sourceLabel);
  }
  return labels;
}

/**
 * A side reads on a row only when it says something. Every ingested
 * questionnaire signal carries no side at all, and 'not_applicable' on a
 * coach entry is the coach saying the question does not arise, so neither
 * earns a chip beside the name.
 */
export function sideLabelOf(side: SignalSide | null): string | null {
  if (side === null || side === 'not_applicable') return null;
  return SIDE_LABELS[side];
}

/**
 * Newest first, by the day the row names and then by the instant behind
 * it, so two rows captured on one day still read in the order they
 * happened.
 */
function newestFirst(a: SignalRecord, b: SignalRecord): number {
  // The exact reverse of Root's own order, tie break included, so the row
  // this list calls latest is the row Root's evidence reads as latest.
  return compareCaptured(b, a);
}

/**
 * Groups a member's signals by category, one row per standardized signal.
 *
 * TWO ROWS FOR ONE NAME ON DIFFERENT SIDES STAY TWO ROWS. A right hip and
 * a left hip are two things a coach treats separately, so the grouping key
 * is the name AND the side rather than the name alone. A signal with no
 * side is its own row, and can never merge with a sided one.
 */
export function buildCoachSignalsView(
  records: readonly SignalRecord[],
  library: SignalLibrary,
  options: { referenceDay?: string } = {}
): CoachSignalsView {
  if (records.length === 0) return EMPTY_VIEW;

  const byKey = new Map<string, SignalRecord[]>();
  for (const record of records) {
    const key = `${record.signalSlug}::${record.side ?? 'none'}`;
    const held = byKey.get(key);
    if (held) held.push(record);
    else byKey.set(key, [record]);
  }

  const byCategory = new Map<string, SignalGroupRow[]>();
  let entryCount = 0;
  let latestCapturedOn: string | null = null;

  for (const group of byKey.values()) {
    const ordered = [...group].sort(newestFirst);
    const latest = ordered[0];
    if (!latest) continue;
    entryCount += ordered.length;
    if (latestCapturedOn === null || latest.capturedOn > latestCapturedOn) {
      latestCapturedOn = latest.capturedOn;
    }

    const sourceLabels: string[] = [];
    for (const record of ordered) {
      if (!sourceLabels.includes(record.sourceLabel)) sourceLabels.push(record.sourceLabel);
    }

    let stateLabel: string | null = null;
    let supportLine: string | null = null;
    if (options.referenceDay) {
      const oldestFirst = [...group].sort(compareCaptured);
      const state = evidenceStateOf(
        {
          signalSlug: latest.signalSlug,
          side: latest.side,
          rows: oldestFirst,
          latest: oldestFirst[oldestFirst.length - 1]!,
        },
        options.referenceDay
      );
      stateLabel = state ? STATE_LABELS[state] : null;
      const supporting = currentSupportingSources(group, options.referenceDay);
      supportLine = supporting.length > 0 ? currentlySupportedByLine(supporting) : null;
    }

    const row: SignalGroupRow = {
      signalSlug: latest.signalSlug,
      signalName: latest.signalName,
      bodyAreaLabel: findBodyArea(library, latest.bodyAreaKey)?.displayName ?? null,
      sideLabel: sideLabelOf(latest.side),
      latest: entryOf(latest),
      history: ordered.slice(1).map(entryOf),
      sourceLabels,
      stateLabel,
      supportLine,
    };

    const held = byCategory.get(latest.categoryKey);
    if (held) held.push(row);
    else byCategory.set(latest.categoryKey, [row]);
  }

  const groups: SignalCategoryGroup[] = [];
  for (const [categoryKey, rows] of byCategory) {
    const category = findCategory(library, categoryKey);
    rows.sort((a, b) => {
      // The most recently heard from first, then alphabetically, so a
      // coach scanning a category meets what moved most recently.
      if (a.latest.capturedOn !== b.latest.capturedOn) {
        return a.latest.capturedOn < b.latest.capturedOn ? 1 : -1;
      }
      return a.signalName.localeCompare(b.signalName);
    });
    groups.push({
      categoryKey,
      categoryLabel: category?.displayName ?? categoryKey,
      position: category?.position ?? Number.MAX_SAFE_INTEGER,
      rows,
    });
  }
  groups.sort((a, b) => a.position - b.position || a.categoryLabel.localeCompare(b.categoryLabel));

  return {
    groups,
    signalCount: byKey.size,
    entryCount,
    latestCapturedOn,
  };
}
