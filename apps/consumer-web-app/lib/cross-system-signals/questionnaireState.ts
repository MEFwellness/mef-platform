/**
 * THE BODY SYSTEMS SURVEY RULE, APPLIED. Pure: no clock, no query.
 *
 * ONE DECISION FUNCTION, TWO CALLERS, and that is the point of this file.
 *
 *   The ADAPTER calls `decideAnswer` while a sitting is being filed, to
 *     decide which answers become rows at all. An answer that is not active
 *     and names a signal she has never had writes nothing, exactly as a
 *     quiet answer always has.
 *   Every READ that turns rows into a current picture (Root's lookup, the
 *     coach's Root Noticed and Signals sections, the trace) calls
 *     `applyQuestionnaireActivation`, which runs the same function over the
 *     rows already stored, including rows filed before this rule existed.
 *
 * So a row written a year ago and a row written this morning are judged by
 * the same rule, and nothing stored ever has to be rewritten when the rule
 * is retuned. The survey answer itself (the word she tapped and its points)
 * is never changed: this decides whether that answer is an active signal,
 * not what she answered.
 *
 * NOTHING HERE HOLDS A SENTENCE. It returns a basis key and lists of ids.
 * The words a coach reads live in lib/cross-system-root/copy.ts, which no
 * member surface can reach; this module is reached from a member's own
 * submit and is held wordless by tests/cross-system-expansion-fence.test.ts.
 */

import { daysBetween } from '@/lib/cross-system-root/evidence';
import { isPresent } from '@/lib/cross-system-patterns/match';
import { questionsInFiredAssociations, type AssociationTriggerRow } from '@/lib/body-systems/triggerEvaluation';
import type {
  BodySystemsAnswers,
  BodySystemsBand,
  BodySystemsBranch,
  BodySystemsQuestion,
  BodySystemsResults,
  BodySystemsScaleOption,
} from '@/lib/body-systems/types';
import { SOURCE_BODY_SYSTEMS } from './constants';
import {
  ACTIVE_BASES,
  ACTIVE_MIN_POINTS,
  OTHER_SOURCE_WINDOW_DAYS,
  QUESTIONNAIRE_RULE_REVISION,
  SECTION_STRONGLY_ELEVATED_MIN_PERCENT,
  SUPPORTABLE_MIN_POINTS,
  type QuestionnaireBasis,
} from './questionnaireRules';
import type { QuestionnaireActivation, SignalRecord } from './types';

/** Everything the rule needs to know about one completed sitting. Slugs and numbers only. */
export type SurveySittingFacts = {
  sittingId: string;
  completedAt: string;
  branch: BodySystemsBranch;
  /** The section each question on her branch belongs to. */
  sectionOf: ReadonlyMap<string, string>;
  /** Each section's own stored percentage for this sitting. Read to decide, never shown. */
  sectionPercent: ReadonlyMap<string, number>;
  /** Questions named by a held condition of a fired association, with the entries that name them. */
  relatedEntries: ReadonlyMap<string, readonly string[]>;
};

/** A member's sittings, as the rule reads them. */
export type QuestionnaireFacts = {
  sittings: ReadonlyMap<string, SurveySittingFacts>;
  /** The newest completed sitting, or null when none could be read. */
  latestSittingId: string | null;
};

export const NO_QUESTIONNAIRE_FACTS: QuestionnaireFacts = {
  sittings: new Map(),
  latestSittingId: null,
};

/** One sitting's facts, from what is stored on it and the survey's own content. */
export function buildSittingFacts(input: {
  sittingId: string;
  completedAt: string;
  branch: BodySystemsBranch;
  answers: BodySystemsAnswers;
  results: BodySystemsResults;
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  associationTriggers: readonly AssociationTriggerRow[];
}): SurveySittingFacts {
  const sectionOf = new Map<string, string>();
  for (const question of input.questions) {
    if (question.branch !== 'all' && question.branch !== input.branch) continue;
    sectionOf.set(question.questionRef, question.sectionKey);
  }
  const sectionPercent = new Map<string, number>();
  for (const section of input.results.sections) {
    sectionPercent.set(section.sectionKey, section.percent);
  }
  const relatedEntries = questionsInFiredAssociations(
    {
      scale: input.scale,
      bands: input.bands,
      answers: input.answers,
      results: input.results,
      branch: input.branch,
    },
    input.associationTriggers
  );
  return {
    sittingId: input.sittingId,
    completedAt: input.completedAt,
    branch: input.branch,
    sectionOf,
    sectionPercent,
    relatedEntries,
  };
}

/** Every sitting's facts, and which one is newest. */
export function buildQuestionnaireFacts(sittings: readonly SurveySittingFacts[]): QuestionnaireFacts {
  const map = new Map<string, SurveySittingFacts>();
  let latest: SurveySittingFacts | null = null;
  for (const sitting of sittings) {
    map.set(sitting.sittingId, sitting);
    if (
      latest === null ||
      sitting.completedAt > latest.completedAt ||
      (sitting.completedAt === latest.completedAt && sitting.sittingId > latest.sittingId)
    ) {
      latest = sitting;
    }
  }
  return { sittings: map, latestSittingId: latest?.sittingId ?? null };
}

/** True for a stored row that is one Body Systems Survey answer, rather than a section rollup. */
export function isSurveyAnswerRow(record: SignalRecord): boolean {
  return (
    record.sourceKey === SOURCE_BODY_SYSTEMS &&
    record.valueKind === 'scale' &&
    record.sourceSessionId !== null
  );
}

/**
 * SUPPORT CONDITION 2. The labels of the other sources that currently
 * support this signal, as of the sitting's own day.
 *
 * Per source, only that source's most recent row inside the window counts,
 * so a member who wrote "my headaches are back" and then "my headaches have
 * stopped" a week later lends no support: her own latest word closed it.
 */
export function otherSourceSupport(
  records: readonly SignalRecord[],
  signalSlug: string,
  sittingDay: string
): string[] {
  const latestBySource = new Map<string, SignalRecord>();
  for (const record of records) {
    if (record.signalSlug !== signalSlug) continue;
    if (record.sourceKey === SOURCE_BODY_SYSTEMS) continue;
    if (Math.abs(daysBetween(record.capturedOn, sittingDay)) > OTHER_SOURCE_WINDOW_DAYS) continue;
    const held = latestBySource.get(record.sourceKey);
    if (!held || later(record, held)) latestBySource.set(record.sourceKey, record);
  }
  const labels: string[] = [];
  for (const record of latestBySource.values()) {
    if (!isPresent(record)) continue;
    if (!labels.includes(record.sourceLabel)) labels.push(record.sourceLabel);
  }
  return labels.sort((a, b) => a.localeCompare(b));
}

function later(candidate: SignalRecord, held: SignalRecord): boolean {
  if (candidate.capturedOn !== held.capturedOn) return candidate.capturedOn > held.capturedOn;
  return candidate.capturedAt > held.capturedAt;
}

/** The rule's verdict on one answer, before supersession is considered. */
export type AnswerDecision = {
  basis: QuestionnaireBasis;
  active: boolean;
  sectionKey: string | null;
  supportingSourceLabels: string[];
  relatedEntryCodes: string[];
};

/**
 * THE RULE. One answer, in one sitting.
 *
 * The support conditions are checked in a fixed order (section, related
 * association, another source) and the first that holds names the basis,
 * so the same answer always carries the same reason. The lists of
 * supporting sources and entries are filled whichever condition named the
 * basis, so a trace can show every support that was present.
 */
export function decideAnswer(input: {
  points: number;
  questionRef: string;
  signalSlug: string;
  /** Null when the sitting could not be read, which leaves only the rule's points and another source. */
  sitting: SurveySittingFacts | null;
  /** The sitting's own local day. */
  sittingDay: string;
  /** The member's other rows, from any source. Survey rows are ignored. */
  records: readonly SignalRecord[];
}): AnswerDecision {
  const sectionKey = input.sitting?.sectionOf.get(input.questionRef) ?? null;

  if (input.points >= ACTIVE_MIN_POINTS) {
    return {
      basis: 'often_or_more',
      active: true,
      sectionKey,
      supportingSourceLabels: [],
      relatedEntryCodes: [],
    };
  }

  if (input.points < SUPPORTABLE_MIN_POINTS) {
    return {
      basis: 'rarely_or_never',
      active: false,
      sectionKey,
      supportingSourceLabels: [],
      relatedEntryCodes: [],
    };
  }

  const sectionPercent =
    sectionKey !== null ? input.sitting?.sectionPercent.get(sectionKey) ?? null : null;
  const sectionElevated =
    sectionPercent !== null && sectionPercent >= SECTION_STRONGLY_ELEVATED_MIN_PERCENT;
  const relatedEntryCodes = [...(input.sitting?.relatedEntries.get(input.questionRef) ?? [])];
  const supportingSourceLabels = otherSourceSupport(
    input.records,
    input.signalSlug,
    input.sittingDay
  );

  let basis: QuestionnaireBasis = 'sometimes_without_support';
  if (sectionElevated) basis = 'sometimes_section_elevated';
  else if (relatedEntryCodes.length > 0) basis = 'sometimes_related_association';
  else if (supportingSourceLabels.length > 0) basis = 'sometimes_other_source';

  return {
    basis,
    active: ACTIVE_BASES.has(basis),
    sectionKey,
    supportingSourceLabels,
    relatedEntryCodes,
  };
}

/**
 * The newest sitting, from the facts when they were read, otherwise from the
 * rows themselves: every ingested sitting files all eleven section rollups,
 * so the newest rollup names the newest sitting that was filed.
 */
function latestSitting(records: readonly SignalRecord[], facts: QuestionnaireFacts): string | null {
  if (facts.latestSittingId) return facts.latestSittingId;
  let latest: SignalRecord | null = null;
  for (const record of records) {
    if (record.sourceKey !== SOURCE_BODY_SYSTEMS || record.sourceSessionId === null) continue;
    if (latest === null || record.capturedAt > latest.capturedAt) latest = record;
  }
  return latest?.sourceSessionId ?? null;
}

/**
 * EVERY SURVEY ANSWER ROW, JUDGED. Returns new records; the input is never
 * changed. Rows that are not survey answers come back untouched and without
 * the field, so every other reader sees them exactly as before.
 */
export function applyQuestionnaireActivation(
  records: readonly SignalRecord[],
  facts: QuestionnaireFacts
): SignalRecord[] {
  const latest = latestSitting(records, facts);
  return records.map((record) => {
    if (!isSurveyAnswerRow(record)) return record;
    const sitting = facts.sittings.get(record.sourceSessionId!) ?? null;
    const decision = decideAnswer({
      points: record.valueNumeric ?? 0,
      questionRef: record.sourceQuestionRef ?? '',
      signalSlug: record.signalSlug,
      sitting,
      sittingDay: record.capturedOn,
      records,
    });
    const superseded = latest !== null && record.sourceSessionId !== latest;
    const questionnaire: QuestionnaireActivation = {
      basis: decision.basis,
      activeAtCapture: decision.active,
      superseded,
      current: decision.active && !superseded,
      sectionKey: decision.sectionKey,
      supportingSourceLabels: decision.supportingSourceLabels,
      relatedEntryCodes: decision.relatedEntryCodes,
      ruleRevision: QUESTIONNAIRE_RULE_REVISION,
    };
    return { ...record, questionnaire };
  });
}

/**
 * The survey answer rows of one sitting that are active signals now: the
 * rows that consult the Association Map for that sitting.
 *
 * ONE ROW PER CANONICAL SIGNAL. Two questions can map to the same signal
 * (the survey asks about cold hands or feet in two sections), and both
 * answers are real rows, but they are one signal: the loudest active answer
 * speaks for it, and the quieter one stays on her timeline.
 */
export function currentTriggerRows(
  records: readonly SignalRecord[],
  sittingId: string
): SignalRecord[] {
  const bySlug = new Map<string, SignalRecord>();
  for (const record of records) {
    if (!record.questionnaire?.current) continue;
    if (record.sourceSessionId !== sittingId) continue;
    const held = bySlug.get(record.signalSlug);
    if (
      !held ||
      (record.valueNumeric ?? 0) > (held.valueNumeric ?? 0) ||
      ((record.valueNumeric ?? 0) === (held.valueNumeric ?? 0) &&
        (record.sourceQuestionRef ?? '') < (held.sourceQuestionRef ?? ''))
    ) {
      bySlug.set(record.signalSlug, record);
    }
  }
  return [...bySlug.values()].sort((a, b) =>
    (a.sourceQuestionRef ?? '').localeCompare(b.sourceQuestionRef ?? '')
  );
}
