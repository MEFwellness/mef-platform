/**
 * Building what a coach reads. The coach side of the fence.
 *
 * A FINDING IS EITHER A FINDING OR A SAFETY PROMPT, never both and never a
 * blend. `safetyWithheld` true means the existing red flag system fired on
 * a response behind this complaint, and every field below is empty because
 * THE BUILDER NEVER FILLED THEM, not because a component chose not to draw
 * them. There is no association and no consideration in the payload for a
 * screen to leak.
 *
 * EVERY WORD OF INTERPRETATION IS HERS. The association text, the basis and
 * every coaching consideration are carried through character for character
 * from the version the lookup read. This file composes counts and headings
 * and nothing else.
 */

import { formatDisplayDate } from '@/lib/time/displayDate';

/**
 * How a captured day is printed on a staff surface.
 *
 * EVERY DATE NAMES ITS TIMEZONE. `formatDisplayDate` is pinned to UTC,
 * which is the right zone for a bare YYYY-MM-DD that was already resolved
 * in the member's own zone when it was stored. Named once here so the
 * finding header and every row inside it cannot disagree about the format.
 */
const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type {
  ComplaintClassificationRecord,
  ComplaintReportRecord,
} from '@/lib/cross-system-complaints/types';
import {
  FINDING_HEADINGS,
  NOT_A_DIAGNOSIS,
  RESOLUTION_SUFFIX,
  SAFETY_WITHHELD_BODY,
  SAFETY_WITHHELD_HEADING,
  STATE_EXPLANATIONS,
  STATE_LABELS,
  basisLine,
  summaryLine,
  whyCheckedLine,
} from './copy';
import { isLiveState, type EvidenceState } from './evidence';
import type { ConvergentArea, RootFindingDraft } from './types';

/** One of her rows, as a finding prints it. */
export type FindingRowLine = {
  signalId: string;
  signalName: string;
  sideLabel: string | null;
  valueLabel: string;
  sourceLabel: string;
  capturedOn: string;
  capturedOnDisplay: string;
  /**
   * Exactly what she was answering, where the source recorded it.
   *
   * NEVER A SECTION ROLLUP'S PROMPT. A Body Systems Survey section row
   * records its prompt as the section name and its percentage, and a Root
   * card carries no survey percentage, so that one kind of prompt is left
   * off the card. The band word beside it still says how loud it was.
   */
  sourceQuestionPrompt: string | null;
  /** Her own words, where this row came from a sentence. */
  note: string | null;
  state: EvidenceState;
  stateLabel: string;
};

/** One area, fully built. */
export type FindingAreaView = {
  refKind: string;
  refKey: string;
  label: string;
  state: EvidenceState;
  stateLabel: string;
  stateExplanation: string;
  whyChecked: string;
  /** Her rows under this area, split the way the brief asks for them. */
  currentRows: FindingRowLine[];
  historicalRows: FindingRowLine[];
  /** True when nothing at all sits under this area. */
  notObserved: boolean;
};

/** One finding a coach reads. */
export type RootFindingView = {
  /**
   * WHAT CAUSED IT. A sentence she wrote, or her newest Body Systems Survey.
   * The card's opening block is drawn from the matching half: her words for
   * a complaint, the signals her answers support for a survey.
   */
  origin: 'complaint' | 'questionnaire';
  /** For a survey finding: "<survey> currently supports: <signals>." Null for a complaint. */
  triggerLine: string | null;
  /** For a complaint finding her newest survey also reaches: who else supports it now. */
  alsoSupportedBy: string | null;
  relationshipId: string;
  patternKey: string;
  patternName: string | null;
  versionNumber: number | null;
  isSeeded: boolean;

  /** True when the red flag system withheld it. */
  suppressed: boolean;
  suppressedHeading: string | null;
  suppressedBody: string | null;
  suppressedSignalNames: string[];

  /** What she actually said, and what Root read it as. */
  complaintText: string;
  complaintSurface: string;
  complaintOn: string;
  complaintOnDisplay: string;
  interpretation: string[];

  summary: string | null;
  areas: FindingAreaView[];
  possibleAssociation: string | null;
  basis: string | null;
  considerations: string[];
  notADiagnosis: string;
};

export type RootNoticedView = {
  findings: RootFindingView[];
  convergences: Array<{ label: string; line: string; findingCount: number }>;
  /** How many findings are showing something rather than a safety prompt. */
  findingCount: number;
  suppressedCount: number;
  /** How many complaints Root has read for this member. */
  complaintCount: number;
  /** How many of those it could not classify, which is how a missing phrase becomes visible. */
  unclassifiedCount: number;
  /** How many active entries the Association Map holds, so an empty panel can say why. */
  mapEntryCount: number;
};

const SIDE_LABELS: Record<string, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
  not_applicable: '',
};

function sideLabel(record: SignalRecord): string | null {
  if (!record.side) return null;
  const label = SIDE_LABELS[record.side];
  return label ? label : null;
}

function rowLine(record: SignalRecord, state: EvidenceState): FindingRowLine {
  return {
    signalId: record.id,
    signalName: record.signalName,
    sideLabel: sideLabel(record),
    valueLabel: record.valueLabel,
    sourceLabel: record.sourceLabel,
    capturedOn: record.capturedOn,
    capturedOnDisplay: formatDisplayDate(record.capturedOn, DAY_FORMAT),
    sourceQuestionPrompt: record.valueKind === 'band' ? null : record.sourceQuestionPrompt,
    note: record.note,
    state,
    stateLabel: STATE_LABELS[state],
  };
}

/**
 * ROOT'S INTERPRETATION, said as a list of what it recognized rather than as
 * a sentence about her.
 *
 * "Right hip clicking reported." is what this produces. It never composes a
 * clause about why, because the classifier has no vocabulary for one.
 */
export function interpretationLines(
  classifications: readonly ComplaintClassificationRecord[],
  nameFor: (slug: string) => string,
  areaFor: (key: string) => string
): string[] {
  return classifications.map((entry) => {
    const parts: string[] = [];
    const side = entry.side ? SIDE_LABELS[entry.side] : '';
    const area = entry.bodyAreaKey ? areaFor(entry.bodyAreaKey) : '';
    const place = [side, area].filter(Boolean).join(' ');
    parts.push(place ? `${nameFor(entry.signalSlug)} (${place})` : nameFor(entry.signalSlug));
    // A RESOLUTION READS AS ONE. She said this has finished, and a card
    // that printed the name alone would read as a current complaint.
    if (entry.isResolution) parts.push(RESOLUTION_SUFFIX);
    else if (entry.frequencyLabel) parts.push(entry.frequencyLabel);
    return parts.join(', ');
  });
}

export function buildFindingView(input: {
  finding: RootFindingDraft;
  report: ComplaintReportRecord;
  classifications: readonly ComplaintClassificationRecord[];
  nameFor: (slug: string) => string;
  areaFor: (key: string) => string;
}): RootFindingView {
  const { finding, report } = input;

  const base = {
    origin: 'complaint' as const,
    triggerLine: null,
    alsoSupportedBy: null,
    relationshipId: finding.head.id,
    patternKey: finding.head.patternKey,
    isSeeded: finding.head.isSeeded,
    complaintText: report.rawText,
    complaintSurface: report.surfaceLabel,
    complaintOn: report.reportedOn,
    complaintOnDisplay: formatDisplayDate(report.reportedOn, DAY_FORMAT),
    notADiagnosis: NOT_A_DIAGNOSIS,
  };

  // THE OVERRIDE IS THE FIRST BRANCH, so a withheld finding is BUILT empty.
  if (finding.safetyWithheld) {
    return {
      ...base,
      patternName: null,
      versionNumber: null,
      suppressed: true,
      suppressedHeading: SAFETY_WITHHELD_HEADING,
      suppressedBody: SAFETY_WITHHELD_BODY,
      suppressedSignalNames: finding.withheldSignalNames,
      interpretation: [],
      summary: null,
      areas: [],
      possibleAssociation: null,
      basis: null,
      considerations: [],
    };
  }

  const areas: FindingAreaView[] = finding.areas.map((area) => {
    const current = area.rows.filter((row) => isLiveState(row.state));
    const historical = area.rows.filter((row) => !isLiveState(row.state));
    return {
      refKind: area.refKind,
      refKey: area.refKey,
      label: area.refLabel,
      state: area.state,
      stateLabel: STATE_LABELS[area.state],
      stateExplanation: STATE_EXPLANATIONS[area.state],
      whyChecked: whyCheckedLine(finding.version.patternName, area.refLabel),
      currentRows: current.map((row) => rowLine(row.record, row.state)),
      historicalRows: historical.map((row) => rowLine(row.record, row.state)),
      notObserved: area.rows.length === 0,
    };
  });

  return {
    ...base,
    patternName: finding.version.patternName,
    versionNumber: finding.version.versionNumber,
    suppressed: false,
    suppressedHeading: null,
    suppressedBody: null,
    suppressedSignalNames: [],
    interpretation: interpretationLines(input.classifications, input.nameFor, input.areaFor),
    summary: summaryLine({
      areaCount: finding.areas.length,
      currentCount: finding.currentCount,
      notObservedCount: finding.notObservedCount,
    }),
    areas,
    possibleAssociation: finding.version.possibleAssociationText,
    basis: basisLine(finding.version.sourceTypeKey),
    considerations: [...finding.version.considerations]
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.body),
  };
}

/**
 * One finding her newest Body Systems Survey caused.
 *
 * THE SAME CARD, WITH A DIFFERENT OPENING. Everything below the opening is
 * built by `buildFindingView` from the same draft the same lookup made, so
 * a survey card and a complaint card about one map entry read the same
 * areas, the same association and the same considerations. What changes is
 * what caused it: there is no sentence of hers to quote, so the card names
 * the signals her answers currently support, and it names no score.
 */
export function buildQuestionnaireFindingView(input: {
  finding: RootFindingDraft;
  sourceLabel: string;
  sittingOn: string;
  supportsLine: string;
}): RootFindingView {
  const report: ComplaintReportRecord = {
    id: '',
    memberId: '',
    surfaceKey: '',
    surfaceLabel: input.sourceLabel,
    rawText: '',
    fieldRef: null,
    fieldPrompt: null,
    sourceRecordId: null,
    reportedOn: input.sittingOn,
    reportedAt: input.sittingOn,
    authorRole: 'member',
    authoredBy: null,
    classifierKind: 'deterministic_lexicon',
    classifierRevision: '',
    ingestFingerprint: null,
    lookupCompletedAt: null,
    createdAt: input.sittingOn,
  };
  const view = buildFindingView({
    finding: input.finding,
    report,
    classifications: [],
    nameFor: (slug) => slug,
    areaFor: (key) => key,
  });
  return { ...view, origin: 'questionnaire', triggerLine: input.supportsLine, interpretation: [] };
}

/** The headings, exported so a test can assert their order on the rendered card. */
export const FINDING_HEADING_ORDER = [
  FINDING_HEADINGS.presentingComplaint,
  FINDING_HEADINGS.areasChecked,
] as const;

export function buildConvergenceLines(
  convergences: readonly ConvergentArea[],
  line: (label: string, count: number) => string
): Array<{ label: string; line: string; findingCount: number }> {
  return convergences.map((area) => ({
    label: area.refLabel,
    line: line(area.refLabel, area.findingCount),
    findingCount: area.findingCount,
  }));
}
