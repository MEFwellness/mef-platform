/**
 * THE COMPLAINT-DRIVEN LOOKUP. What replaces manual pattern building.
 *
 * THE BEHAVIOUR THAT CHANGED, said plainly. Prompt 3 asked: do this
 * member's rows clear the floor a coach wrote for this definition. That
 * made a coach the engine's input, because somebody had to write a
 * definition per client before anything surfaced. This file asks a
 * different question, and it is the one the brief asks for:
 *
 *   SHE JUST REPORTED SOMETHING. Which entries in the Whole-Body
 *   Association Map name that kind of complaint, what did those entries
 *   tell Root to go and look at, and what is actually in her data there?
 *
 * NO FLOOR, AND THAT IS DELIBERATE. An area worth reviewing is worth
 * reviewing even when nothing supports it yet, because "the map says look
 * at Kidney and Bladder, and there is nothing there" is information a
 * coach wants and a floor would have silently thrown away. What the floor
 * protected against is still protected against, by a different and
 * stronger mechanism: a finding never says a pattern is present, it says
 * which areas were checked and exactly what was in each one.
 *
 * ROOT CANNOT INVENT AN ASSOCIATION. Every area below comes from a
 * component row of an ACTIVE map entry. There is no inference step, no
 * generator and no similarity measure anywhere in this file. An
 * association that is not in the map does not exist, and a deactivated
 * entry is filtered before a single row is read.
 *
 * PURE. No clock, no query, no randomness, nothing that could call out to
 * a model. The reference day is handed in. Same input, same answer, every
 * time, and the whole engine is driven from literals in its tests.
 */

import { signalSatisfies } from '@/lib/cross-system-patterns/match';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type {
  RelationshipComponent,
  RelationshipSummary,
} from '@/lib/cross-system-relationships/types';
import {
  evidenceStateOf,
  groupHistories,
  isLiveState,
  type EvidenceState,
  type SignalHistory,
} from './evidence';
import type { ConvergentArea, FindingArea, RootFindingDraft } from './types';

/** Which entries of the map are consulted when a complaint arrives. */
export function complaintDrivenEntries(
  summaries: readonly RelationshipSummary[]
): RelationshipSummary[] {
  // INACTIVE IS INVISIBLE, and the filter runs before a single signal is
  // read, so a deactivated entry costs nothing and can reach nothing. This
  // is what makes "a deactivated seeded relationship immediately stops
  // participating" true by construction rather than by a later check.
  return summaries.filter(
    (summary) => summary.head.isActive && summary.current.surfacesOnComplaint
  );
}

/** The worst-case state across a set, in the order a coach cares about. */
const STATE_RANK: Record<EvidenceState, number> = {
  current: 0,
  recent: 1,
  historical: 2,
  resolved: 3,
  not_observed: 4,
};

function bestState(states: readonly EvidenceState[]): EvidenceState {
  let best: EvidenceState = 'not_observed';
  for (const state of states) {
    if (STATE_RANK[state] < STATE_RANK[best]) best = state;
  }
  return best;
}

/**
 * One map entry, read against one complaint.
 *
 * `triggerIds` are the signal rows this complaint just produced. A map
 * entry is consulted only when one of THOSE rows answers one of its primary
 * inputs, which is what makes the lookup complaint driven rather than a
 * standing re-evaluation of everything she has ever said.
 */
export function lookupOne(
  summary: RelationshipSummary,
  triggerIds: ReadonlySet<string>,
  histories: readonly SignalHistory[],
  allRecords: readonly SignalRecord[],
  referenceDay: string,
  redFlaggedSignalIds: ReadonlySet<string>
): RootFindingDraft {
  const version = summary.current;
  const components = [...version.components].sort((a, b) => a.position - b.position);

  const empty: RootFindingDraft = {
    head: summary.head,
    version,
    surfaced: false,
    triggerRecords: [],
    areas: [],
    currentCount: 0,
    historicalCount: 0,
    notObservedCount: 0,
    safetyWithheld: false,
    withheldSignalNames: [],
  };

  // 1. DID SHE REPORT THE KIND OF THING THIS ENTRY IS ABOUT?
  const triggers: SignalRecord[] = [];
  for (const component of components) {
    if (component.role !== 'primary') continue;
    for (const record of allRecords) {
      if (!triggerIds.has(record.id)) continue;
      if (!signalSatisfies(record, component)) continue;
      if (triggers.some((held) => held.id === record.id)) continue;
      triggers.push(record);
    }
  }
  if (triggers.length === 0) return empty;

  // 2. WHAT DID THE MAP TELL ROOT TO GO AND LOOK AT, and what is there?
  const areas: FindingArea[] = [];
  for (const component of components) {
    if (component.role === 'primary') continue;
    areas.push(areaFor(component, histories, referenceDay));
  }

  // 3. THE SAFETY OVERRIDE, ASKED BEFORE ANYTHING IS SAID. Existing
  //    red-flag logic always wins: one contributing row carrying a safety
  //    response withholds the WHOLE finding, primary or supporting, and the
  //    caller builds it empty rather than drawing it empty.
  const contributing = [...triggers, ...areas.flatMap((area) => area.rows.map((row) => row.record))];
  const withheld = contributing.filter((record) => redFlaggedSignalIds.has(record.id));

  const currentCount = areas.filter((area) => isLiveState(area.state)).length;
  const historicalCount = areas.filter(
    (area) => area.state === 'historical' || area.state === 'resolved'
  ).length;
  const notObservedCount = areas.filter((area) => area.state === 'not_observed').length;

  return {
    head: summary.head,
    version,
    surfaced: true,
    triggerRecords: triggers,
    areas,
    currentCount,
    historicalCount,
    notObservedCount,
    safetyWithheld: withheld.length > 0,
    withheldSignalNames: [...new Set(withheld.map((record) => record.signalName))],
  };
}

/**
 * One area of the map, and the member's rows under it.
 *
 * EVERY ROW IS STATED, NOT JUST THE LIVE ONES. A resolved bloating and a
 * historical low-back ache are both carried here with their own state, so
 * the card can print current evidence and historical context as two
 * different things rather than as one list a coach has to date by eye.
 */
function areaFor(
  component: RelationshipComponent,
  histories: readonly SignalHistory[],
  referenceDay: string
): FindingArea {
  const rows: FindingArea['rows'] = [];

  for (const history of histories) {
    // The component is matched against the LATEST row of each history,
    // which is the row that says what is true now. The older rows are the
    // trail behind it and are read only to tell a resolution from a
    // silence.
    if (!satisfiesIgnoringPresence(history.latest, component)) continue;
    const state = evidenceStateOf(history, referenceDay);
    if (state === null) continue;
    rows.push({ record: history.latest, state });
  }

  rows.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);

  return {
    refKind: component.refKind,
    refKey: component.refKey,
    refLabel: component.refLabel,
    role: component.role,
    position: component.position,
    state: rows.length === 0 ? 'not_observed' : bestState(rows.map((row) => row.state)),
    rows,
  };
}

/**
 * Whether a row belongs to this area at all, setting aside whether it is
 * currently saying yes.
 *
 * WHY PRESENCE IS ASKED SEPARATELY HERE, when `signalSatisfies` already
 * answers both. A resolved signal has to be FOUND in order to be reported
 * as resolved, and `signalSatisfies` refuses a row whose value is nought,
 * because for the floor-based matcher a settled signal is correctly not a
 * vote. Reusing it unchanged would have made every resolution invisible and
 * every one of those areas read as "not currently observed", which is a
 * different and weaker statement than "she reported this and it has
 * settled".
 *
 * The frequency and severity floors the coach set are still honoured, and
 * still honoured the same way, because they are the same conditions.
 */
function satisfiesIgnoringPresence(
  record: SignalRecord,
  component: RelationshipComponent
): boolean {
  if (signalSatisfies(record, component)) return true;
  // The row said nought. Ask every other condition, and let the evidence
  // layer decide what a nought means.
  const numeric = record.valueNumeric;
  if (numeric === null || numeric > 0) return false;
  const probe = { ...record, valueNumeric: 1 } as SignalRecord;
  // A floor the coach set is about how loud a live signal has to be, and a
  // settled row cannot clear it, so a component carrying one takes the
  // strict reading and a settled row does not belong to it.
  if (component.minValueNumeric !== null) return false;
  return signalSatisfies(probe, component);
}

/**
 * Every active map entry this complaint's new rows trigger.
 *
 * Returned in the library's own order, and only the ones that surfaced.
 */
export function lookupForComplaint(
  summaries: readonly RelationshipSummary[],
  triggerIds: ReadonlySet<string>,
  allRecords: readonly SignalRecord[],
  referenceDay: string,
  redFlaggedSignalIds: ReadonlySet<string> = new Set()
): RootFindingDraft[] {
  const entries = complaintDrivenEntries(summaries);
  if (entries.length === 0 || triggerIds.size === 0) return [];
  const histories = groupHistories(allRecords);
  return entries
    .map((summary) =>
      lookupOne(summary, triggerIds, histories, allRecords, referenceDay, redFlaggedSignalIds)
    )
    .filter((finding) => finding.surfaced);
}

/**
 * SYSTEM CONVERGENCE, in the opposite direction.
 *
 * If several different complaints all sent Root to the same area, that
 * overlap is worth naming. It is COUNTED, never concluded from: the caller
 * prints how many findings overlap here, and nothing anywhere says the
 * overlap proves anything about the area.
 *
 * A withheld finding contributes nothing, because its whole content is
 * withheld.
 */
export function convergentAreas(
  findings: readonly RootFindingDraft[],
  complaintTextFor: (finding: RootFindingDraft) => string,
  minimumFindings = 2
): ConvergentArea[] {
  const byArea = new Map<string, ConvergentArea>();

  for (const finding of findings) {
    if (!finding.surfaced || finding.safetyWithheld) continue;
    for (const area of finding.areas) {
      // Only an area where something was actually found can converge.
      // Three complaints all finding nothing in one place is not a
      // convergence, it is three silences.
      if (!isLiveState(area.state)) continue;
      const key = `${area.refKind}::${area.refKey}`;
      const held = byArea.get(key);
      const liveRows = area.rows.filter((row) => isLiveState(row.state)).length;
      const text = complaintTextFor(finding);
      if (held) {
        held.findingCount += 1;
        held.liveRowCount += liveRows;
        if (!held.fromComplaints.includes(text)) held.fromComplaints.push(text);
      } else {
        byArea.set(key, {
          refKind: area.refKind,
          refKey: area.refKey,
          refLabel: area.refLabel,
          findingCount: 1,
          liveRowCount: liveRows,
          fromComplaints: [text],
        });
      }
    }
  }

  return [...byArea.values()]
    .filter((area) => area.findingCount >= minimumFindings)
    .sort((a, b) => b.findingCount - a.findingCount || b.liveRowCount - a.liveRowCount);
}
