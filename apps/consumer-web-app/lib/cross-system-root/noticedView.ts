/**
 * THE WHOLE ROOT NOTICED SECTION, BUILT FROM WHAT WAS READ. Coach side, pure.
 *
 * WHY IT IS HERE AND NOT IN THE SERVER ACTION. The action's job is to prove
 * who is asking and read the rows. What a coach is then shown is a decision
 * about those rows, and a decision this size belongs where a test can drive
 * it with literals: a sentence she wrote, a survey she finished, a retake,
 * two sources on one signal and a red flag are all cases of this one
 * function.
 *
 * TWO CAUSES, ONE LOOKUP. A complaint's findings and her newest survey's
 * findings are both the pure lookup (./lookup.ts) run over the same judged
 * rows. The only difference is which rows trigger it.
 *
 * ONE MAP ENTRY IS NEVER TOLD TWICE. When a sentence she wrote and her
 * newest survey both reach the same map entry, the complaint's card carries
 * "also currently supported by" the survey and the survey block does not
 * draw a second card for it.
 *
 * THE EVIDENCE IS COMPUTED LIVE, THE REVIEW STATE IS STORED. A finding a
 * coach dismissed stays dismissed; what is in each area is always her rows
 * as they stand.
 */

import type { SignalLibrary, SignalRecord } from '@/lib/cross-system-signals/types';
import type { RelationshipSummary } from '@/lib/cross-system-relationships/types';
import type {
  ComplaintClassificationRecord,
  ComplaintReportRecord,
} from '@/lib/cross-system-complaints/types';
import type { BodySystemsSessionRecord } from '@/lib/body-systems/data';
import type { MemberContent } from '@/lib/body-systems/contentData';
import { DNA_VALUE } from '@/lib/body-systems/types';
import { SOURCE_BODY_SYSTEMS } from '@/lib/cross-system-signals/constants';
import { findMapping } from '@/lib/cross-system-signals/library';
import {
  currentTriggerRows,
  decideAnswer,
  type QuestionnaireFacts,
} from '@/lib/cross-system-signals/questionnaireState';
import { formatDisplayDate } from '@/lib/time/displayDate';
import {
  SAFETY_WITHHELD_BODY,
  SAFETY_WITHHELD_HEADING,
  STATE_LABELS,
  TRACE_NEVER_REPORTED,
  TRACE_NO_SIGNAL,
  alsoSupportedByLine,
  answerBasisLine,
  convergenceLine,
  ledToLine,
  questionnaireIntroLine,
  questionnaireSupportsLine,
} from './copy';
import { evidenceStateOf, groupHistories } from './evidence';
import { complaintDrivenEntries, convergentAreas, lookupForComplaint } from './lookup';
import type { StoredFinding } from './data';
import type { RootFindingDraft } from './types';
import {
  buildConvergenceLines,
  buildFindingView,
  buildQuestionnaireFindingView,
  type RootFindingView,
  type RootNoticedView,
} from './view';

const DAY_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** One question on her newest sitting, traced from her answer to where it led. */
export type QuestionnaireTraceRow = {
  questionRef: string;
  prompt: string;
  /** The word she chose, or null when she chose none. Never a number. */
  answerLabel: string | null;
  /** The canonical signal it maps to, or null when it maps to none. */
  signalName: string | null;
  /** Why it is or is not an active signal, or why it produced no signal. */
  decision: string;
  active: boolean;
  /** That signal's state on her timeline today, or null when there is no signal. */
  stateLabel: string | null;
  /** Where it led Root, in words. */
  ledTo: string;
};

export type QuestionnaireTraceSection = {
  sectionKey: string;
  sectionName: string;
  activeCount: number;
  rows: QuestionnaireTraceRow[];
};

/** Everything Root read from her newest Body Systems Survey. */
export type QuestionnaireNoticedView = {
  sittingId: string;
  sourceLabel: string;
  sittingOn: string;
  sittingOnDisplay: string;
  intro: string;
  /** "<survey> currently supports: <signals>." Null when nothing is active. */
  supportsLine: string | null;
  activeCount: number;
  /** True when the survey's own red flag layer withheld every finding from this sitting. */
  suppressed: boolean;
  suppressedHeading: string | null;
  suppressedBody: string | null;
  suppressedSignalNames: string[];
  /** The cards not already told by a complaint card. */
  findings: RootFindingView[];
  /** How many map entries were folded into a complaint card instead. */
  mergedCount: number;
  trace: QuestionnaireTraceSection[];
};

export type FullRootNoticedView = RootNoticedView & {
  /** Absent or null when she has no completed Body Systems Survey. */
  questionnaire?: QuestionnaireNoticedView | null;
};

export type RootNoticedInputs = {
  /** Her rows, already judged by the survey rule. */
  records: readonly SignalRecord[];
  summaries: readonly RelationshipSummary[];
  library: SignalLibrary;
  complaints: readonly ComplaintReportRecord[];
  classifications: ReadonlyMap<string, ComplaintClassificationRecord[]>;
  stored: readonly StoredFinding[];
  flaggedSignals: ReadonlySet<string>;
  questionnaire: {
    facts: QuestionnaireFacts;
    sittings: readonly BodySystemsSessionRecord[];
    content: MemberContent;
    /** Survey association titles by entry code, from the coach's own content read. */
    associationTitles: ReadonlyMap<string, string>;
    /** The day in her own zone that the Signals states are measured from. */
    today: string;
    /** Her newest sitting's own local day. */
    sittingOn: string | null;
  } | null;
};

export function buildRootNoticedView(input: RootNoticedInputs): FullRootNoticedView {
  const mapEntries = complaintDrivenEntries(input.summaries);
  const nameFor = (slug: string) => input.library.names.get(slug)?.displayName ?? slug;
  const areaFor = (key: string) => input.library.bodyAreas.get(key)?.displayName ?? key;

  // ---- The survey's findings first, because a complaint card may name them.
  const questionnaireDrafts = buildQuestionnaireDrafts(input);
  const surveyByRelationship = new Map(
    questionnaireDrafts.drafts
      .filter((draft) => !draft.safetyWithheld)
      .map((draft) => [draft.head.id, draft])
  );
  const surveyLabel =
    input.library.sources.get(SOURCE_BODY_SYSTEMS)?.displayName ?? 'Body Systems Survey';

  // ---- Complaints, exactly as before, plus the one merge.
  const dismissed = new Set(
    input.stored
      .filter((row) => row.dismissedAt !== null)
      .map((row) => `${row.relationshipId}::${row.reportId ?? row.sourceSessionId ?? ''}`)
  );

  const views: RootFindingView[] = [];
  const allDrafts: RootFindingDraft[] = [];
  const complaintTextByPattern = new Map<string, string>();
  const toldByComplaint = new Set<string>();
  let unclassified = 0;

  for (const report of input.complaints) {
    const found = input.classifications.get(report.id) ?? [];
    if (found.length === 0) {
      unclassified += 1;
      continue;
    }
    const triggerIds = new Set(
      found.map((entry) => entry.signalId).filter((id): id is string => id !== null)
    );
    if (triggerIds.size === 0) continue;

    const drafts = lookupForComplaint(
      input.summaries,
      triggerIds,
      input.records,
      report.reportedOn,
      input.flaggedSignals
    );

    for (const draft of drafts) {
      if (dismissed.has(`${draft.head.id}::${report.id}`)) continue;
      allDrafts.push(draft);
      complaintTextByPattern.set(`${draft.head.id}::${report.id}`, report.rawText);
      const view = buildFindingView({
        finding: draft,
        report,
        classifications: found,
        nameFor,
        areaFor,
      });
      if (!view.suppressed && surveyByRelationship.has(draft.head.id)) {
        toldByComplaint.add(draft.head.id);
        views.push({ ...view, alsoSupportedBy: alsoSupportedByLine([surveyLabel]) });
      } else {
        views.push(view);
      }
    }
  }

  // Convergence is counted across separate REPORTS, as it always was. One
  // survey sitting reaches many entries at once, so overlap among its own
  // findings is a property of one sitting rather than several reports
  // leading to the same place, and it is not counted here.
  const convergences = convergentAreas(allDrafts, (finding) => {
    for (const [key, text] of complaintTextByPattern) {
      if (key.startsWith(`${finding.head.id}::`)) return text;
    }
    return '';
  });

  const questionnaire = buildQuestionnaireBlock(
    input,
    questionnaireDrafts,
    toldByComplaint,
    dismissed,
    surveyLabel,
    nameFor
  );

  const findingCount =
    views.filter((view) => !view.suppressed).length + (questionnaire?.findings.length ?? 0);
  const suppressedCount =
    views.filter((view) => view.suppressed).length + (questionnaire?.suppressed ? 1 : 0);

  return {
    findings: views,
    convergences: buildConvergenceLines(convergences, convergenceLine),
    findingCount,
    suppressedCount,
    complaintCount: input.complaints.length,
    unclassifiedCount: unclassified,
    mapEntryCount: mapEntries.length,
    questionnaire,
  };
}

type QuestionnaireDrafts = {
  sittingId: string | null;
  triggers: SignalRecord[];
  drafts: RootFindingDraft[];
};

function buildQuestionnaireDrafts(input: RootNoticedInputs): QuestionnaireDrafts {
  const survey = input.questionnaire;
  const sittingId = survey?.facts.latestSittingId ?? null;
  if (!survey || !sittingId || !survey.sittingOn) {
    return { sittingId: null, triggers: [], drafts: [] };
  }
  const triggers = currentTriggerRows(input.records, sittingId);
  const drafts = lookupForComplaint(
    input.summaries,
    new Set(triggers.map((record) => record.id)),
    input.records,
    survey.sittingOn,
    input.flaggedSignals
  );
  return { sittingId, triggers, drafts };
}

function buildQuestionnaireBlock(
  input: RootNoticedInputs,
  built: QuestionnaireDrafts,
  toldByComplaint: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
  sourceLabel: string,
  nameFor: (slug: string) => string
): QuestionnaireNoticedView | null {
  const survey = input.questionnaire;
  if (!survey || !built.sittingId || !survey.sittingOn) return null;
  const sittingId = built.sittingId;

  const sittingOnDisplay = formatDisplayDate(survey.sittingOn, DAY_FORMAT);
  const signalNames = [...new Set(built.triggers.map((record) => record.signalName))];
  const supportsLine =
    signalNames.length > 0 ? questionnaireSupportsLine(sourceLabel, signalNames) : null;

  const withheld = built.drafts.filter((draft) => draft.safetyWithheld);
  const suppressed = withheld.length > 0;

  const findings: RootFindingView[] = [];
  let mergedCount = 0;
  if (!suppressed) {
    for (const draft of built.drafts) {
      if (dismissed.has(`${draft.head.id}::${sittingId}`)) continue;
      if (toldByComplaint.has(draft.head.id)) {
        mergedCount += 1;
        continue;
      }
      const triggerNames = [...new Set(draft.triggerRecords.map((record) => record.signalName))];
      findings.push(
        buildQuestionnaireFindingView({
          finding: draft,
          sourceLabel,
          sittingOn: survey.sittingOn,
          supportsLine: questionnaireSupportsLine(sourceLabel, triggerNames),
        })
      );
    }
  }

  return {
    sittingId,
    sourceLabel,
    sittingOn: survey.sittingOn,
    sittingOnDisplay,
    intro: questionnaireIntroLine(sittingOnDisplay, signalNames.length),
    supportsLine,
    activeCount: signalNames.length,
    suppressed,
    suppressedHeading: suppressed ? SAFETY_WITHHELD_HEADING : null,
    suppressedBody: suppressed ? SAFETY_WITHHELD_BODY : null,
    suppressedSignalNames: suppressed
      ? [...new Set(withheld.flatMap((draft) => draft.withheldSignalNames))]
      : [],
    findings,
    mergedCount,
    trace: buildTrace(input, built, suppressed, nameFor),
  };
}

/**
 * EVERY QUESTION ON HER NEWEST SITTING, from the answer to where it led.
 *
 * The chain the coach can follow, one row per question: the survey, the
 * exact question, her answer, the canonical signal, whether the rule treats
 * it as active and why, that signal's state on her timeline today, and the
 * Root findings it triggered. A question her branch did not ask is not
 * listed; one she marked as not applying, or left unanswered, is listed and
 * says it produced no signal.
 */
function buildTrace(
  input: RootNoticedInputs,
  built: QuestionnaireDrafts,
  suppressed: boolean,
  nameFor: (slug: string) => string
): QuestionnaireTraceSection[] {
  const survey = input.questionnaire!;
  const sitting = survey.sittings.find((record) => record.id === built.sittingId);
  const facts = built.sittingId ? survey.facts.sittings.get(built.sittingId) ?? null : null;
  if (!sitting || !sitting.results || !facts) return [];

  const optionByKey = new Map(survey.content.scale.map((option) => [option.valueKey, option]));
  const rowsForSitting = input.records.filter(
    (record) =>
      record.sourceKey === SOURCE_BODY_SYSTEMS &&
      record.valueKind === 'scale' &&
      record.sourceSessionId === built.sittingId
  );
  const rowByQuestion = new Map(rowsForSitting.map((record) => [record.sourceQuestionRef, record]));

  const histories = groupHistories(input.records);
  const stateBySlug = new Map<string, string>();
  for (const history of histories) {
    const state = evidenceStateOf(history, survey.today);
    if (!state) continue;
    // A signal with no side and a sided one share a name; the state a trace
    // row prints is the loudest of them, which is the one worth reading.
    const held = stateBySlug.get(history.signalSlug);
    const label = STATE_LABELS[state];
    if (!held || state === 'current') stateBySlug.set(history.signalSlug, label);
  }

  const patternsBySignal = new Map<string, string[]>();
  if (!suppressed) {
    for (const draft of built.drafts) {
      for (const record of draft.triggerRecords) {
        const names = patternsBySignal.get(record.signalSlug) ?? [];
        if (!names.includes(draft.version.patternName)) names.push(draft.version.patternName);
        patternsBySignal.set(record.signalSlug, names);
      }
    }
  }

  const sections = [...survey.content.sections].sort((a, b) => a.position - b.position);
  const out: QuestionnaireTraceSection[] = [];
  for (const section of sections) {
    const questions = survey.content.questions
      .filter(
        (question) =>
          question.sectionKey === section.sectionKey &&
          (question.branch === 'all' || question.branch === sitting.results!.branch)
      )
      .sort((a, b) => a.position - b.position);
    if (questions.length === 0) continue;

    const rows: QuestionnaireTraceRow[] = questions.map((question) => {
      const raw = sitting.answers[question.questionRef];
      const base = { questionRef: question.questionRef, prompt: question.prompt };
      if (raw === DNA_VALUE) {
        return { ...base, answerLabel: null, signalName: null, decision: TRACE_NO_SIGNAL.doesNotApply, active: false, stateLabel: null, ledTo: ledToLine([]) };
      }
      const option = raw ? optionByKey.get(raw) : undefined;
      if (!option) {
        return { ...base, answerLabel: null, signalName: null, decision: TRACE_NO_SIGNAL.unanswered, active: false, stateLabel: null, ledTo: ledToLine([]) };
      }
      const stored = rowByQuestion.get(question.questionRef) ?? null;
      const mapping = findMapping(input.library, SOURCE_BODY_SYSTEMS, 'question', question.questionRef);
      const slug = stored?.signalSlug ?? mapping?.signalSlug ?? null;
      if (!slug) {
        return { ...base, answerLabel: option.label, signalName: null, decision: TRACE_NO_SIGNAL.unmapped, active: false, stateLabel: null, ledTo: ledToLine([]) };
      }

      // The stored row's verdict when the answer was filed, otherwise the
      // same rule run over the answer itself: an unsupported Sometimes about
      // something she never reported is not filed, and still has a reason.
      const verdict = stored?.questionnaire
        ? {
            basis: stored.questionnaire.basis,
            active: stored.questionnaire.current,
            supportingSourceLabels: stored.questionnaire.supportingSourceLabels,
            relatedEntryCodes: stored.questionnaire.relatedEntryCodes,
          }
        : decideAnswer({
            points: option.points,
            questionRef: question.questionRef,
            signalSlug: slug,
            sitting: facts,
            sittingDay: survey.sittingOn ?? survey.today,
            records: input.records,
          });

      const relatedTitles = verdict.relatedEntryCodes.map(
        (code) => survey.associationTitles.get(code) ?? code
      );
      const isTrigger = built.triggers.some((record) => record.signalSlug === slug);
      return {
        ...base,
        answerLabel: option.label,
        signalName: stored?.signalName ?? nameFor(slug),
        decision: answerBasisLine(verdict.basis, {
          supportingSourceLabels: verdict.supportingSourceLabels,
          relatedTitles,
        }),
        active: verdict.active,
        stateLabel: stateBySlug.get(slug) ?? TRACE_NEVER_REPORTED,
        ledTo: ledToLine(isTrigger ? (patternsBySignal.get(slug) ?? []) : []),
      };
    });

    out.push({
      sectionKey: section.sectionKey,
      sectionName: section.displayName,
      activeCount: rows.filter((row) => row.active).length,
      rows,
    });
  }
  return out;
}
