/**
 * THE COACH BRIEFING. What a coach reads first when she opens a client:
 * what matters, what supports it, and what to explore next. Coach side,
 * pure: no clock, no query, and no call to any model.
 *
 * A PRESENTATION LAYER, NOT A SECOND ENGINE. Every card is built from:
 *
 *   the rows the survey rule already judged (questionnaireState.ts),
 *   the map entries the existing lookup already surfaces (./lookup.ts),
 *   the evidence states the existing recency logic already assigns
 *     (./evidence.ts),
 *   the safety override that already withholds (./lookup.ts), and
 *   her own completed sittings, read for comparable history only.
 *
 * Nothing here decides whether an answer is active, which entry fires or
 * what an area holds. It decides ORDER (./briefingRules.ts), words
 * (./copy.ts) and whether a coach's review still holds.
 *
 * ONE CARD PER REPORTED COMPLAINT. A reported finding is an active answer
 * on her newest survey, or a classified signal from a sentence she wrote,
 * whose timeline is live today. Reported signals sharing a primary
 * complaint (same body area and symptom type) are one card.
 *
 * NOTHING IS DELETED BY BEING HERE. Every card points back into the full
 * evidence by map entry and question, and the existing Root Noticed view is
 * built exactly as before, beside this one.
 */

import type {
  SignalLibrary,
  SignalRecord,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';
import type { RelationshipSummary } from '@/lib/cross-system-relationships/types';
import type {
  ComplaintClassificationRecord,
  ComplaintReportRecord,
} from '@/lib/cross-system-complaints/types';
import type { BodySystemsSessionRecord } from '@/lib/body-systems/data';
import type { MemberContent } from '@/lib/body-systems/contentData';
import { DNA_VALUE } from '@/lib/body-systems/types';
import { SOURCE_BODY_SYSTEMS } from '@/lib/cross-system-signals/constants';
import {
  currentTriggerRows,
  decideAnswer,
  type QuestionnaireFacts,
} from '@/lib/cross-system-signals/questionnaireState';
import { isPresent, wasPresentWhenCaptured } from '@/lib/cross-system-patterns/match';
import { findBannedLanguage } from '@/lib/cross-system-relationships/language';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { localDateStringFor } from '@/lib/time/localDate';
import {
  ANSWER_CHANGED,
  BRIEFING_DISCLAIMER,
  BRIEFING_HEADLINE_FALLBACK,
  EXPLORE_NOTHING_CONNECTS,
  FIRST_RECORDED,
  FIRST_RECORDED_NOTE,
  DIRECTION_BY_SIGNAL,
  NOT_ASSESSED_REASONS,
  NO_RELATED_FINDINGS,
  PAIR_QUESTIONS,
  REVIEW_ACTION_LABELS,
  REVIEW_HISTORY_LABELS,
  SAFETY_WITHHELD_BODY,
  SAFETY_WITHHELD_HEADING,
  SHORT_SOURCE_LABELS,
  WHY_REVIEW_FALLBACK,
  absenceLine,
  answerChangedForLine,
  briefingHeadline,
  briefingUpdatedLine,
  changedSinceLine,
  dismissedLine,
  explorePairQuestion,
  exploreChangeQuestion,
  inlineSourceLabel,
  rankReasonLine,
  reportedOnLine,
  sharedSourceLine,
  unchangedSinceLine,
  whyReviewTogetherLine,
  type AbsenceKind,
} from './copy';
import {
  compareCaptured,
  evidenceStateOf,
  groupHistories,
  isLiveState,
  type EvidenceState,
  type SignalHistory,
} from './evidence';
import { lookupForComplaint } from './lookup';
import {
  BRIEFING_CARD_LIMIT,
  EXPLORE_NEXT_LIMIT,
  RELATED_FINDINGS_LIMIT,
  REPORTING_WINDOWS,
  compareByRank,
  evidenceFingerprint,
  groupKeyFor,
  isRollupRow,
  pointsAlwaysActive,
  rankPoints,
  relatedFindingEntries,
  reviewStatusOf,
  type BriefingEvidenceState,
  type BriefingHistoryAction,
  type BriefingReviewStatus,
  type RankFacts,
} from './briefingRules';
import type { RootFindingDraft } from './types';

// ---------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------

/** One stored review action or restore, as the builder reads it. */
export type BriefingReviewRecord = {
  targetKey: string;
  action: BriefingHistoryAction;
  actedAt: string;
  evidenceState: BriefingEvidenceState | null;
};

/** How one reported answer compares with the comparable answer before it. */
export type BriefingChange =
  | { kind: 'first_recorded'; line: string; note: string }
  | {
      kind: 'changed' | 'unchanged';
      line: string;
      fromLabel: string;
      fromOn: string;
      toLabel: string;
      toOn: string;
      /** Up or down the frequency scale, or level. */
      direction: 'up' | 'down' | 'level';
      /** Into active, out of active, or neither. */
      crossed: 'into_active' | 'out_of_active' | null;
    };

/** One answer or report behind a card, in the words she was given. */
export type BriefingReportedLine = {
  signalSlug: string;
  signalName: string;
  sideLabel: string | null;
  /** The word she chose ("Often"), or what a sentence was recorded as. */
  valueLabel: string;
  sourceKey: string;
  sourceLabel: string;
  /**
   * "(Breathing Check-In, Sep 12)" when this answer came from a different
   * source than the card's shared one, and null when it did not.
   */
  inlineSource: string | null;
  /** The exact question, where there was one. */
  questionRef: string | null;
  questionPrompt: string | null;
  /** Her own words, where this came from a sentence. */
  note: string | null;
  reportedOn: string;
  reportedLine: string;
  change: BriefingChange;
};

export type BriefingRelatedLine = {
  signalSlug: string;
  signalName: string;
  valueLabel: string;
  sourceKey: string;
  sourceLabel: string;
  /** Short inline label, only when the source differs from the card's shared source. */
  inlineSource: string | null;
  /** Source identity: key and day. */
  sourceOn: string;
  questionPrompt: string | null;
  reportedLine: string;
  /** The map entries that connect it to the reported symptom. */
  viaPatternNames: string[];
};

/** One entry on a signal's timeline. */
export type BriefingTimelineEntry = {
  on: string;
  onDisplay: string;
  /** Her answer's word, or an absence line when the question was not assessed. */
  valueLabel: string;
  sourceLabel: string;
  questionPrompt: string | null;
  note: string | null;
};

export type BriefingTimeline = {
  signalSlug: string;
  signalName: string;
  entries: BriefingTimelineEntry[];
};

export type BriefingAbsence = {
  signalSlug: string;
  signalName: string;
  kind: AbsenceKind;
  line: string;
};

export type BriefingCardView = {
  targetKey: string;
  anchorSlug: string;
  anchorName: string;

  // 1. Headline
  headline: string;
  /** The card level marker: "Answer changed", "First recorded", or none. */
  changeMarker: string | null;
  /**
   * THE SOURCE THE CARD'S ANSWERS SHARE, said once per card:
   * "Rooted Reset Body Systems Survey, Sep 16 (covers past 3 months)". A
   * line from any other source carries its own short inline label instead.
   */
  sharedSource: string | null;

  // 2. Reported
  reported: BriefingReportedLine[];
  /**
   * The one Reported line the card draws: each symptom with its frequency,
   * then the answer change if one exists. "Headaches, Often; Headaches when
   * not eaten, Often. Answer changed: Often (Sep 16) from Sometimes (Sep 11)."
   */
  reportedSummary: string;

  // 3. Related findings, at most three, or the one sentence when none qualify.
  related: BriefingRelatedLine[];
  noRelatedLine: string | null;

  // 4. Why review together. Null for a card holding one finding, which has
  //    nothing to review together.
  whyReviewTogether: string | null;

  // 5. Explore next
  exploreNext: string[];
  exploreEmptyLine: string | null;

  // Review state, for this coach.
  reviewStatus: BriefingReviewStatus;
  pinned: boolean;
  /** The card first appeared after this coach's previous visit to this client's briefing. */
  newSinceVisit: boolean;
  /** Its evidence changed materially after this coach's last review action on it. */
  changedSinceReview: boolean;
  lastAction: BriefingHistoryAction | null;
  /** This coach's review history on the card, oldest first: every review and every restore. */
  history: BriefingHistoryEntry[];
  /** Position in the one ranked order across pinned, open and dismissed cards. */
  rank: number;

  // View evidence
  rankReason: string;
  evidence: {
    /** Map entries this card's reported signals reached, by relationship id. */
    relationshipIds: string[];
    /** Survey questions behind the card, for the "How Root read each answer" rows. */
    questionRefs: string[];
    /** Every qualifying related finding, not only the three on the card. */
    allRelated: BriefingRelatedLine[];
    timelines: BriefingTimeline[];
    absences: BriefingAbsence[];
    /**
     * ASSESSMENT CONTEXT, never a related finding. The survey section result
     * each reported answer sits in, as the section's own band word. Shown
     * inside View evidence only.
     */
    assessmentContext: BriefingAssessmentContext[];
  };

  /** The evidence state a review action is recorded against. */
  evidenceState: BriefingEvidenceState;
  fingerprint: string;
};

export type BriefingAssessmentContext = {
  sectionName: string;
  bandLabel: string;
  sourceLabel: string;
  onDisplay: string;
};

export type BriefingHistoryEntry = {
  action: BriefingHistoryAction;
  label: string;
  actedAt: string;
  onDisplay: string;
};

export type BriefingDismissedView = {
  targetKey: string;
  headline: string;
  line: string;
  /** The whole card, so a restore can draw it back in the briefing where it ranks. */
  card: BriefingCardView;
};

export type BriefingSafetyView = {
  heading: string;
  body: string;
  signalNames: string[];
};

export type RootBriefingView = {
  updatedAt: string | null;
  updatedLine: string | null;
  disclaimer: string;
  /** Always drawn above the briefing when present. Never ranked. */
  safety: BriefingSafetyView | null;
  /**
   * "Discuss next session" cards, in their own section below safety and
   * above the priority cards. Never also in `cards`, and never counted
   * against the priority limit.
   */
  pinned: BriefingCardView[];
  /** Every open card, ranked. The first BRIEFING_CARD_LIMIT are the priority cards. */
  cards: BriefingCardView[];
  priorityLimit: number;
  dismissed: BriefingDismissedView[];
};

export type RootBriefingInputs = {
  /** Her rows, already judged by the survey rule. */
  records: readonly SignalRecord[];
  summaries: readonly RelationshipSummary[];
  library: SignalLibrary;
  complaints: readonly ComplaintReportRecord[];
  classifications: ReadonlyMap<string, ComplaintClassificationRecord[]>;
  flaggedSignals: ReadonlySet<string>;
  questionnaire: {
    facts: QuestionnaireFacts;
    sittings: readonly BodySystemsSessionRecord[];
    content: MemberContent;
  } | null;
  /** Her today, in her own zone. */
  today: string;
  /** Her zone, for turning a sitting's instant into her local day. */
  timezone: string;
  /** The latest instant Root evaluated anything for her. */
  lastEvaluatedAt: string | null;
  /** This coach's review actions on this client, any order. */
  reviews: readonly BriefingReviewRecord[];
  /** This coach's last visit to this client's briefing, before this one. */
  lastVisitedAt: string | null;
};

/**
 * One card in a briefing, by target, wherever it is drawn: the pinned
 * section or the priority cards. The one lookup the review action uses, so a
 * card that moved sections is still a card a coach can act on.
 */
export function findBriefingCard(
  briefing: Pick<RootBriefingView, 'pinned' | 'cards'> | null | undefined,
  targetKey: string
): BriefingCardView | null {
  if (!briefing) return null;
  return [...briefing.pinned, ...briefing.cards].find((card) => card.targetKey === targetKey) ?? null;
}

/**
 * One card folded under "Reviewed or not relevant", by target. The one
 * lookup Restore uses: only a dismissed card can be restored.
 */
export function findDismissedBriefingCard(
  briefing: Pick<RootBriefingView, 'dismissed'> | null | undefined,
  targetKey: string
): BriefingCardView | null {
  if (!briefing) return null;
  return briefing.dismissed.find((entry) => entry.targetKey === targetKey)?.card ?? null;
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

const SIDE_LABELS: Record<string, string> = { left: 'Left', right: 'Right', both: 'Both' };

function sideLabel(record: SignalRecord): string | null {
  return record.side ? (SIDE_LABELS[record.side] ?? null) : null;
}

/** "Sep 16" in her current year, "Sep 16, 2025" otherwise. A bare day, printed in UTC. */
export function shortDay(day: string, today: string): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return formatDisplayDate(
    day,
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}

/**
 * THE LANGUAGE CHECK, ON EVERY GENERATED LINE. A signal name is stored
 * content, so a line built from one is checked when it is built; one that
 * carries a banned phrase or an em dash is replaced by a fixed line.
 */
const EM_DASH = String.fromCharCode(0x2014);

export function cautious(text: string, fallback: string): string {
  if (text.includes(EM_DASH)) return fallback;
  return findBannedLanguage(text).length === 0 ? text : fallback;
}

/** Lower cases a name for use inside a sentence, leaving an acronym alone. */
function inSentence(name: string): string {
  if (name.length > 1 && name[1] === name[1]!.toUpperCase() && /[A-Z]/.test(name[1]!)) return name;
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function historyKey(record: Pick<SignalRecord, 'signalSlug' | 'side'>): string {
  return `${record.signalSlug}::${record.side ?? 'none'}`;
}

/** The survey question refs that file each canonical signal. */
function surveyRefsBySlug(library: SignalLibrary): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const mapping of library.mappings.values()) {
    if (mapping.sourceKey !== SOURCE_BODY_SYSTEMS || mapping.externalKind !== 'question') continue;
    const refs = out.get(mapping.signalSlug) ?? [];
    refs.push(mapping.externalKey);
    out.set(mapping.signalSlug, refs);
  }
  for (const refs of out.values()) refs.sort();
  return out;
}

// ---------------------------------------------------------------------
// Her sittings, as answers per question
// ---------------------------------------------------------------------

type SittingAnswer =
  | { kind: 'answered'; label: string; points: number }
  | { kind: 'not_assessed'; reason: keyof typeof NOT_ASSESSED_REASONS };

type Sittings = {
  /** Completed sittings, oldest first. */
  ordered: BodySystemsSessionRecord[];
  answerOf: (sitting: BodySystemsSessionRecord, questionRef: string) => SittingAnswer;
  dayOf: (sitting: BodySystemsSessionRecord) => string;
  promptOf: (questionRef: string) => string | null;
  /** The survey rule's verdict on one answer in one sitting. */
  activeAt: (sitting: BodySystemsSessionRecord, questionRef: string, slug: string, points: number) => boolean;
};

function readSittings(input: RootBriefingInputs): Sittings | null {
  const survey = input.questionnaire;
  if (!survey) return null;
  const ordered = survey.sittings
    .filter((sitting) => sitting.completedAt !== null && sitting.results !== null)
    .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!) || a.id.localeCompare(b.id));
  const optionByKey = new Map(survey.content.scale.map((option) => [option.valueKey, option]));
  const questionByRef = new Map(survey.content.questions.map((question) => [question.questionRef, question]));

  return {
    ordered,
    dayOf: (sitting) => localDateStringFor(sitting.completedAt!, input.timezone),
    promptOf: (ref) => questionByRef.get(ref)?.prompt ?? null,
    answerOf: (sitting, ref) => {
      const question = questionByRef.get(ref);
      const branch = sitting.results!.branch;
      // A QUESTION HER PATH NEVER ASKED IS NOT ASSESSED, and it is never
      // read as a Never.
      if (!question || (question.branch !== 'all' && question.branch !== branch)) {
        return { kind: 'not_assessed', reason: 'notOnBranch' };
      }
      const raw = sitting.answers[ref];
      if (raw === DNA_VALUE) return { kind: 'not_assessed', reason: 'doesNotApply' };
      const option = raw ? optionByKey.get(raw) : undefined;
      if (!option) return { kind: 'not_assessed', reason: 'unanswered' };
      return { kind: 'answered', label: option.label, points: option.points };
    },
    activeAt: (sitting, ref, slug, points) =>
      decideAnswer({
        points,
        questionRef: ref,
        signalSlug: slug,
        sitting: survey.facts.sittings.get(sitting.id) ?? null,
        sittingDay: localDateStringFor(sitting.completedAt!, input.timezone),
        records: input.records,
      }).active,
  };
}

// ---------------------------------------------------------------------
// Comparable history
// ---------------------------------------------------------------------

/** One comparable answer: what she said, when, and whether the rule counted it as active then. */
type ComparableAnswer = {
  label: string;
  points: number | null;
  active: boolean;
  on: string;
  at: string;
};

/**
 * Every comparable answer for one reported row, newest first, the row's
 * own answer included.
 *
 * A SURVEY ANSWER is compared with the same question on earlier completed
 * sittings, falling back to another question filing the same canonical
 * signal. A sitting where neither was assessed is skipped, never read as a
 * Never. Any OTHER ROW is compared with earlier rows of the same signal,
 * side and source.
 */
function comparableChain(
  record: SignalRecord,
  input: RootBriefingInputs,
  sittings: Sittings | null,
  refsBySlug: ReadonlyMap<string, string[]>
): ComparableAnswer[] {
  if (record.sourceKey === SOURCE_BODY_SYSTEMS && record.sourceSessionId && sittings) {
    const own = sittings.ordered.find((sitting) => sitting.id === record.sourceSessionId);
    if (own) {
      const refs = [
        ...(record.sourceQuestionRef ? [record.sourceQuestionRef] : []),
        ...(refsBySlug.get(record.signalSlug) ?? []).filter((ref) => ref !== record.sourceQuestionRef),
      ];
      const chain: ComparableAnswer[] = [];
      for (const sitting of [...sittings.ordered].reverse()) {
        if (sitting.completedAt! > own.completedAt!) continue;
        // The loudest answered question on that sitting speaks for the
        // signal, the same tie rule every other reader uses.
        let best: { label: string; points: number; ref: string } | null = null;
        for (const ref of refs) {
          const answer = sittings.answerOf(sitting, ref);
          if (answer.kind !== 'answered') continue;
          if (!best || answer.points > best.points) best = { label: answer.label, points: answer.points, ref };
        }
        if (!best) continue;
        chain.push({
          label: best.label,
          points: best.points,
          active:
            sitting.id === own.id
              ? isPresent(record)
              : sittings.activeAt(sitting, best.ref, record.signalSlug, best.points),
          on: sittings.dayOf(sitting),
          at: sitting.completedAt!,
        });
      }
      return chain;
    }
  }

  const same = input.records
    .filter(
      (row) =>
        row.signalSlug === record.signalSlug &&
        (row.side ?? null) === (record.side ?? null) &&
        row.sourceKey === record.sourceKey &&
        !isRollupRow(row) &&
        compareCaptured(row, record) <= 0
    )
    .sort(compareCaptured)
    .reverse();
  return same.map((row) => ({
    label: row.valueLabel,
    points: row.valueKind === 'scale' ? row.valueNumeric : null,
    active: row.id === record.id ? isPresent(row) : wasPresentWhenCaptured(row),
    on: row.capturedOn,
    at: row.capturedAt,
  }));
}

/**
 * When this answer's current active run began: the oldest answer in the
 * unbroken run of active answers ending at the newest one. A retake that
 * repeats an active answer does not move it; a gap below the threshold does.
 */
function activeSince(chain: readonly ComparableAnswer[]): string | null {
  if (chain.length === 0 || !chain[0]!.active) return null;
  let index = 0;
  while (index + 1 < chain.length && chain[index + 1]!.active) index += 1;
  return chain[index]!.at;
}

function changeFrom(chain: readonly ComparableAnswer[], today: string): {
  change: BriefingChange;
  meaningful: boolean;
  worsening: boolean;
} {
  const now = chain[0];
  const before = chain[1];
  if (!now || !before) {
    return {
      change: { kind: 'first_recorded', line: FIRST_RECORDED, note: FIRST_RECORDED_NOTE },
      meaningful: false,
      worsening: false,
    };
  }
  const direction: 'up' | 'down' | 'level' =
    now.points !== null && before.points !== null
      ? now.points > before.points
        ? 'up'
        : now.points < before.points
          ? 'down'
          : 'level'
      : 'level';
  const crossed =
    now.active && !before.active ? 'into_active' : !now.active && before.active ? 'out_of_active' : null;
  const toOn = shortDay(now.on, today);
  const fromOn = shortDay(before.on, today);
  const moved = direction !== 'level' || crossed !== null || (now.points === null && now.label !== before.label);
  const change: BriefingChange = {
    kind: moved ? 'changed' : 'unchanged',
    line: moved
      ? changedSinceLine(now.label, toOn, before.label, fromOn)
      : unchangedSinceLine(now.label, fromOn, toOn),
    fromLabel: before.label,
    fromOn,
    toLabel: now.label,
    toOn,
    direction,
    crossed,
  };
  const worsening = direction === 'up';
  return { change, meaningful: worsening || crossed === 'into_active', worsening };
}

// ---------------------------------------------------------------------
// Absence
// ---------------------------------------------------------------------

/**
 * The absence of one signal for this member, read the way a card reads it.
 * Exposed so the four kinds can be held apart by a test directly.
 */
export function describeAbsence(
  slug: string,
  input: RootBriefingInputs
): { kind: AbsenceKind; line: string } | null {
  const absence = absenceFor(
    slug,
    input,
    readSittings(input),
    surveyRefsBySlug(input.library),
    groupHistories(input.records)
  );
  return absence ? { kind: absence.kind, line: absenceLine(absence.kind, absence.detail) } : null;
}

/**
 * WHY A SIGNAL HAS NOTHING CURRENT, in one of four kinds, or null when it
 * does have something current.
 *
 * A NEVER ON THE LATEST SURVEY ALONE is "not reported", never an
 * improvement and never proof of an earlier symptom: "previously reported"
 * needs an earlier answer the rule counted as active, or an earlier report.
 */
function absenceFor(
  slug: string,
  input: RootBriefingInputs,
  sittings: Sittings | null,
  refsBySlug: ReadonlyMap<string, string[]>,
  histories: readonly SignalHistory[]
): { kind: AbsenceKind; detail: string | null } | null {
  const allRows = input.records.filter((row) => row.signalSlug === slug);
  // A signal she only has as a section rollup is a score, not a symptom
  // with nothing current, and is not listed as an absence at all.
  if (allRows.length > 0 && allRows.every((row) => isRollupRow(row))) return null;
  const rows = allRows.filter((row) => !isRollupRow(row));
  const otherRows = rows.filter((row) => row.sourceKey !== SOURCE_BODY_SYSTEMS);
  const refs = refsBySlug.get(slug) ?? [];
  const latest = sittings?.ordered[sittings.ordered.length - 1] ?? null;

  const liveNow = histories.some((history) => {
    if (history.signalSlug !== slug) return false;
    const state = evidenceStateOf(history, input.today);
    return state !== null && isLiveState(state) && isPresent(history.latest);
  });
  if (liveNow) return null;

  if (refs.length > 0 && sittings && latest) {
    const latestDay = shortDay(sittings.dayOf(latest), input.today);
    const answers = refs.map((ref) => ({ ref, answer: sittings.answerOf(latest, ref) }));
    const answered = answers.filter(
      (entry): entry is { ref: string; answer: Extract<SittingAnswer, { kind: 'answered' }> } =>
        entry.answer.kind === 'answered'
    );

    const earlierActive = (): ComparableAnswer | null => {
      for (const sitting of [...sittings.ordered].reverse()) {
        if (sitting.id === latest.id) continue;
        for (const ref of refs) {
          const answer = sittings.answerOf(sitting, ref);
          if (answer.kind !== 'answered') continue;
          if (sittings.activeAt(sitting, ref, slug, answer.points)) {
            return { label: answer.label, points: answer.points, active: true, on: sittings.dayOf(sitting), at: sitting.completedAt! };
          }
        }
      }
      const reported = otherRows.filter((row) => wasPresentWhenCaptured(row)).sort(compareCaptured).pop();
      return reported
        ? { label: reported.valueLabel, points: null, active: true, on: reported.capturedOn, at: reported.capturedAt }
        : null;
    };

    if (answered.length === 0) {
      const earlier = earlierActive();
      if (earlier) {
        return {
          kind: 'historical_no_update',
          detail: `${earlier.label} on ${shortDay(earlier.on, input.today)}, not assessed since`,
        };
      }
      const reason = answers[0]!.answer.kind === 'not_assessed' ? answers[0]!.answer.reason : 'notOnBranch';
      return { kind: 'not_assessed', detail: NOT_ASSESSED_REASONS[reason] };
    }

    const loudest = answered.reduce((best, entry) => (entry.answer.points > best.answer.points ? entry : best));
    const earlier = earlierActive();
    if (earlier) {
      return {
        kind: 'previously_reported_now_below',
        detail: `${loudest.answer.label} on ${latestDay}, ${earlier.label} on ${shortDay(earlier.on, input.today)}`,
      };
    }
    return {
      kind: 'not_reported_latest',
      detail:
        loudest.answer.points > 0 && !pointsAlwaysActive(loudest.answer.points)
          ? `answered ${loudest.answer.label} on ${latestDay}, below the active threshold`
          : `answered ${loudest.answer.label} on ${latestDay}`,
    };
  }

  if (rows.length === 0) return { kind: 'not_assessed', detail: NOT_ASSESSED_REASONS.noQuestion };
  const ordered = [...rows].sort(compareCaptured);
  const last = ordered[ordered.length - 1]!;
  if (isPresent(last)) {
    return {
      kind: 'historical_no_update',
      detail: `${last.valueLabel} on ${shortDay(last.capturedOn, input.today)}, nothing since`,
    };
  }
  const earlier = ordered.filter((row) => wasPresentWhenCaptured(row)).pop();
  if (earlier) {
    return {
      kind: 'previously_reported_now_below',
      detail: `${last.valueLabel} on ${shortDay(last.capturedOn, input.today)}, ${earlier.valueLabel} on ${shortDay(earlier.capturedOn, input.today)}`,
    };
  }
  return {
    kind: 'not_reported_latest',
    detail: `${last.valueLabel} on ${shortDay(last.capturedOn, input.today)}`,
  };
}

// ---------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------

const STATE_ORDER: Record<EvidenceState, number> = {
  current: 0,
  recent: 1,
  historical: 2,
  resolved: 3,
  not_observed: 4,
};

function nameOf(slug: string, names: ReadonlyMap<string, StandardizedSignalName>, fallback: string): string {
  return names.get(slug)?.displayName ?? fallback;
}

export function buildRootBriefing(input: RootBriefingInputs): RootBriefingView {
  const names = input.library.names;
  const histories = groupHistories(input.records);
  const historyByKey = new Map(histories.map((history) => [historyKey(history), history]));
  const sittings = readSittings(input);
  const refsBySlug = surveyRefsBySlug(input.library);
  const recordById = new Map(input.records.map((record) => [record.id, record]));

  /** Live today by the existing recency logic, and saying yes. */
  const liveToday = (record: SignalRecord): EvidenceState | null => {
    const history = historyByKey.get(historyKey(record));
    if (!history || !isPresent(history.latest)) return null;
    const state = evidenceStateOf(history, input.today);
    return state && isLiveState(state) ? state : null;
  };

  // ---- 1. Reported findings: her newest survey's active answers, and the
  //         classified signals of her recent sentences, live today.
  const reportedRows: SignalRecord[] = [];
  const latestSittingId = input.questionnaire?.facts.latestSittingId ?? null;
  if (latestSittingId) {
    for (const record of currentTriggerRows(input.records, latestSittingId)) {
      if (liveToday(record)) reportedRows.push(record);
    }
  }
  const complaintLatest = new Map<string, SignalRecord>();
  for (const report of input.complaints) {
    for (const entry of input.classifications.get(report.id) ?? []) {
      if (entry.isResolution || !entry.signalId) continue;
      const record = recordById.get(entry.signalId);
      if (!record || !liveToday(record)) continue;
      // One line per signal, side and source: the newest one speaks.
      const key = `${historyKey(record)}::${record.sourceKey}`;
      const held = complaintLatest.get(key);
      if (!held || compareCaptured(held, record) < 0) complaintLatest.set(key, record);
    }
  }
  reportedRows.push(...complaintLatest.values());

  // ---- 2. One card per primary complaint.
  const groups = new Map<string, SignalRecord[]>();
  for (const record of reportedRows) {
    const key = groupKeyFor(record.signalSlug, names);
    const held = groups.get(key);
    if (held) held.push(record);
    else groups.set(key, [record]);
  }

  const latestReviewByTarget = new Map<string, BriefingReviewRecord>();
  for (const review of input.reviews) {
    const held = latestReviewByTarget.get(review.targetKey);
    if (!held || review.actedAt > held.actedAt) latestReviewByTarget.set(review.targetKey, review);
  }

  const safetyNames = new Set<string>();
  const built: Array<{ card: BriefingCardView; facts: RankFacts; worsening: boolean; changeKind: 'changed' | 'first_recorded' | 'unchanged'; frequencyLabel: string | null }> = [];

  for (const [targetKey, rows] of groups) {
    const memberSlugs = new Set(rows.map((row) => row.signalSlug));
    const drafts = lookupForComplaint(
      input.summaries,
      new Set(rows.map((row) => row.id)),
      input.records,
      input.today,
      input.flaggedSignals
    );

    // ---- SAFETY IS NEVER RANKED. One flagged row, or one withheld entry,
    //      moves the whole card to the safety block.
    const flaggedRows = rows.filter((row) => input.flaggedSignals.has(row.id));
    const withheld = drafts.filter((draft) => draft.safetyWithheld);
    if (flaggedRows.length > 0 || withheld.length > 0) {
      for (const row of flaggedRows) safetyNames.add(row.signalName);
      for (const draft of withheld) for (const name of draft.withheldSignalNames) safetyNames.add(name);
      if (flaggedRows.length === 0 && withheld.every((draft) => draft.withheldSignalNames.length === 0)) {
        for (const row of rows) safetyNames.add(row.signalName);
      }
      continue;
    }

    // ---- The anchor: always a signal she reported, the plainest name first.
    const anchorSlug = [...memberSlugs].sort((a, b) => {
      const nameA = nameOf(a, names, a);
      const nameB = nameOf(b, names, b);
      return nameA.length - nameB.length || nameA.localeCompare(nameB);
    })[0]!;
    const anchorRow = rows.find((row) => row.signalSlug === anchorSlug)!;
    const anchorName = nameOf(anchorSlug, names, anchorRow.signalName);

    // ---- Reported lines, and how each compares with last time.
    let meaningfulChange = false;
    let worsening = false;
    let anyComparable = false;
    let anyChanged = false;
    // The card appeared when its FIRST reported signal became active and has
    // stayed active since.
    const appeared: { at: string | null } = { at: null };
    const orderedRows = [...rows].sort(
      (a, b) =>
        rankPoints(b) - rankPoints(a) ||
        (a.signalSlug === anchorSlug ? -1 : b.signalSlug === anchorSlug ? 1 : 0) ||
        a.signalName.localeCompare(b.signalName) ||
        a.sourceKey.localeCompare(b.sourceKey)
    );
    const reported: BriefingReportedLine[] = orderedRows.map((row) => {
      const chain = comparableChain(row, input, sittings, refsBySlug);
      const compared = changeFrom(chain, input.today);
      if (compared.meaningful) meaningfulChange = true;
      if (compared.worsening) worsening = true;
      if (compared.change.kind !== 'first_recorded') anyComparable = true;
      if (compared.change.kind === 'changed') anyChanged = true;
      const since = activeSince(chain);
      if (since && (!appeared.at || since < appeared.at)) appeared.at = since;
      return {
        signalSlug: row.signalSlug,
        signalName: row.signalName,
        sideLabel: sideLabel(row),
        valueLabel: row.valueLabel,
        sourceKey: row.sourceKey,
        sourceLabel: row.sourceLabel,
        inlineSource: null,
        questionRef: row.sourceQuestionRef,
        questionPrompt: row.valueKind === 'scale' ? row.sourceQuestionPrompt : null,
        note: row.note,
        reportedOn: row.capturedOn,
        reportedLine: reportedOnLine(shortDay(row.capturedOn, input.today), REPORTING_WINDOWS[row.sourceKey] ?? null),
        change: compared.change,
      };
    });

    // ---- Related findings: question level or classified, live today, and
    //      reached through an entry that fired for THIS symptom.
    const relatedBySlug = new Map<string, { record: SignalRecord; state: EvidenceState; via: string[] }>();
    for (const draft of relatedFindingEntries(drafts, memberSlugs)) {
      for (const area of draft.areas) {
        for (const row of area.rows) {
          const record = row.record;
          if (!isLiveState(row.state) || !isPresent(record) || isRollupRow(record)) continue;
          if (memberSlugs.has(record.signalSlug)) continue;
          if (input.flaggedSignals.has(record.id)) continue;
          const held = relatedBySlug.get(record.signalSlug);
          if (held) {
            if (!held.via.includes(draft.version.patternName)) held.via.push(draft.version.patternName);
            if (rankPoints(record) > rankPoints(held.record)) held.record = record;
          } else {
            relatedBySlug.set(record.signalSlug, { record, state: row.state, via: [draft.version.patternName] });
          }
        }
      }
    }
    const allRelated: BriefingRelatedLine[] = [...relatedBySlug.values()]
      .sort(
        (a, b) =>
          rankPoints(b.record) - rankPoints(a.record) ||
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          a.record.signalName.localeCompare(b.record.signalName)
      )
      .map(({ record, via }) => ({
        signalSlug: record.signalSlug,
        signalName: nameOf(record.signalSlug, names, record.signalName),
        valueLabel: record.valueLabel,
        sourceKey: record.sourceKey,
        sourceLabel: record.sourceLabel,
        inlineSource: null,
        sourceOn: record.capturedOn,
        questionPrompt: record.valueKind === 'scale' ? record.sourceQuestionPrompt : null,
        reportedLine: reportedOnLine(shortDay(record.capturedOn, input.today), REPORTING_WINDOWS[record.sourceKey] ?? null),
        viaPatternNames: via,
      }));

    // ---- THE SHARED SOURCE, said once per card. The card's loudest
    //      reported answer names it; any line from another source or another
    //      day carries a short inline label, and only that line.
    const sharedRow = orderedRows[0]!;
    const sharedIdentity = `${sharedRow.sourceKey}::${sharedRow.capturedOn}`;
    const sharedSource = sharedSourceLine(
      sharedRow.sourceLabel,
      shortDay(sharedRow.capturedOn, input.today),
      REPORTING_WINDOWS[sharedRow.sourceKey] ?? null
    );
    const inlineFor = (sourceKey: string, sourceLabel: string, on: string): string | null =>
      `${sourceKey}::${on}` === sharedIdentity
        ? null
        : inlineSourceLabel(SHORT_SOURCE_LABELS[sourceKey] ?? sourceLabel, shortDay(on, input.today));
    reported.forEach((line) => {
      line.inlineSource = inlineFor(line.sourceKey, line.sourceLabel, line.reportedOn);
    });
    for (const line of allRelated) line.inlineSource = inlineFor(line.sourceKey, line.sourceLabel, line.sourceOn);
    const related = allRelated.slice(0, RELATED_FINDINGS_LIMIT);

    // ---- Counts the ranking reads. Canonical signals, never rows.
    const supporting = new Set<string>([...memberSlugs, ...relatedBySlug.keys()]);
    supporting.delete(anchorSlug);
    const sources = new Set<string>([
      ...rows.map((row) => row.sourceKey),
      ...[...relatedBySlug.values()].map((entry) => entry.record.sourceKey),
    ]);
    const loudest = orderedRows[0]!;
    const frequencyPoints = Math.max(...rows.map((row) => rankPoints(row)));
    const frequencyLabel = loudest.valueKind === 'scale' ? loudest.valueLabel : null;

    // ---- The evidence state a review is held against.
    const reportedState: BriefingEvidenceState['reported'] = {};
    for (const slug of memberSlugs) {
      const scaled = rows
        .filter((row) => row.signalSlug === slug && row.valueKind === 'scale' && row.valueNumeric !== null)
        .map((row) => row.valueNumeric!);
      reportedState[slug] = { points: scaled.length > 0 ? Math.max(...scaled) : null, active: true };
    }
    const evidenceState: BriefingEvidenceState = {
      version: 1,
      reported: reportedState,
      supporting: [...supporting].filter((slug) => !memberSlugs.has(slug)).sort(),
    };

    const latestReview = latestReviewByTarget.get(targetKey) ?? null;
    const review = reviewStatusOf(
      latestReview ? { action: latestReview.action, state: latestReview.evidenceState } : null,
      evidenceState
    );
    // A VISIT IS NOT A REVIEW. Opening the page records a visit and nothing
    // about any card; only an action on a card is a review.
    const newSinceVisit =
      input.lastVisitedAt !== null && appeared.at !== null && appeared.at > input.lastVisitedAt;

    // ---- Words.
    const groupedSlugs = [...memberSlugs].filter((slug) => slug !== anchorSlug).sort();
    // A DIRECTION ONLY FROM WHAT THE CARD DISPLAYS: a grouped answer or a
    // related finding drawn on it, through the signal table alone. Never a
    // category, never a map entry, never a finding held back in View evidence.
    const directions: string[] = [];
    for (const slug of [...groupedSlugs, ...related.map((line) => line.signalSlug)]) {
      const direction = DIRECTION_BY_SIGNAL[slug] ?? null;
      if (direction && !directions.includes(direction)) directions.push(direction);
      if (directions.length === 2) break;
    }
    const headline = cautious(briefingHeadline(anchorName, directions), BRIEFING_HEADLINE_FALLBACK);
    const whyLine = whyReviewTogetherLine({
      anchorName: inSentence(anchorName),
      relatedCount: related.length,
      groupedCount: groupedSlugs.length,
    });
    const whyReviewTogether = whyLine === null ? null : cautious(whyLine, WHY_REVIEW_FALLBACK);
    const reportedSummary = reportedSummaryOf(reported);

    const exploreNext = exploreQuestions({
      anchorSlug,
      anchorName,
      reported,
      pairs: [
        ...[...memberSlugs].filter((slug) => slug !== anchorSlug).sort(),
        ...related.map((line) => line.signalSlug),
      ].map((slug) => ({ slug, name: nameOf(slug, names, slug) })),
    });

    const changeKind: 'changed' | 'first_recorded' | 'unchanged' = anyChanged
      ? 'changed'
      : anyComparable
        ? 'unchanged'
        : 'first_recorded';

    const card: BriefingCardView = {
      targetKey,
      anchorSlug,
      anchorName,
      headline,
      changeMarker: changeKind === 'changed' ? ANSWER_CHANGED : changeKind === 'first_recorded' ? FIRST_RECORDED : null,
      sharedSource,
      reported,
      reportedSummary,
      related,
      noRelatedLine: related.length === 0 ? NO_RELATED_FINDINGS : null,
      whyReviewTogether,
      exploreNext,
      exploreEmptyLine: exploreNext.length === 0 ? EXPLORE_NOTHING_CONNECTS : null,
      reviewStatus: review.status,
      pinned: review.status === 'pinned',
      newSinceVisit,
      changedSinceReview: review.changedSinceReview,
      lastAction: latestReview?.action ?? null,
      history: input.reviews
        .filter((entry) => entry.targetKey === targetKey)
        .sort((a, b) => a.actedAt.localeCompare(b.actedAt))
        .map((entry) => ({
          action: entry.action,
          label: REVIEW_HISTORY_LABELS[entry.action],
          actedAt: entry.actedAt,
          onDisplay: formatDisplayDate(entry.actedAt, { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
      rank: 0,
      rankReason: '',
      evidence: {
        relationshipIds: drafts.map((draft) => draft.head.id),
        questionRefs: [
          ...new Set(
            [...rows, ...[...relatedBySlug.values()].map((entry) => entry.record)]
              .filter((record) => record.sourceKey === SOURCE_BODY_SYSTEMS && record.sourceQuestionRef)
              .map((record) => record.sourceQuestionRef!)
          ),
        ].sort(),
        allRelated,
        timelines: timelinesFor(
          [anchorSlug, ...[...memberSlugs].sort(), ...allRelated.map((line) => line.signalSlug)],
          input,
          sittings,
          refsBySlug
        ),
        absences: absencesFor(targetKey, memberSlugs, drafts, input, sittings, refsBySlug, histories),
        assessmentContext: assessmentContextFor(rows, input),
      },
      evidenceState,
      fingerprint: evidenceFingerprint(evidenceState),
    };

    built.push({
      card,
      worsening,
      changeKind,
      frequencyLabel,
      facts: {
        targetKey,
        anchorName,
        meaningfulChange,
        frequencyPoints,
        supportingSignalCount: supporting.size,
        sourceCount: sources.size,
        pinned: review.status === 'pinned',
      },
    });
  }

  built.sort((a, b) => compareByRank(a.facts, b.facts));
  for (const [index, entry] of built.entries()) {
    entry.card.rank = index;
    entry.card.rankReason = rankReasonLine({
      pinned: entry.facts.pinned,
      change: entry.changeKind,
      worsening: entry.worsening,
      frequencyLabel: entry.frequencyLabel,
      supportingSignalCount: entry.facts.supportingSignalCount,
      sourceCount: entry.facts.sourceCount,
    });
  }

  const pinned = built.filter((entry) => entry.card.reviewStatus === 'pinned').map((entry) => entry.card);
  const cards = built.filter((entry) => entry.card.reviewStatus === 'open').map((entry) => entry.card);
  const dismissed = built
    .filter((entry) => entry.card.reviewStatus === 'dismissed')
    .map((entry) => {
      const review = latestReviewByTarget.get(entry.card.targetKey)!;
      // Dismissed means the newest entry is Reviewed or Not relevant.
      const action = review.action === 'reviewed' || review.action === 'not_relevant' ? review.action : 'reviewed';
      return {
        targetKey: entry.card.targetKey,
        headline: entry.card.headline,
        line: dismissedLine(
          REVIEW_ACTION_LABELS[action],
          formatDisplayDate(review.actedAt, { month: 'short', day: 'numeric', year: 'numeric' })
        ),
        card: entry.card,
      };
    });

  return {
    updatedAt: input.lastEvaluatedAt,
    updatedLine: input.lastEvaluatedAt
      ? briefingUpdatedLine(
          formatDisplayDate(input.lastEvaluatedAt, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })
        )
      : null,
    disclaimer: BRIEFING_DISCLAIMER,
    safety:
      safetyNames.size > 0
        ? { heading: SAFETY_WITHHELD_HEADING, body: SAFETY_WITHHELD_BODY, signalNames: [...safetyNames].sort() }
        : null,
    pinned,
    cards,
    priorityLimit: BRIEFING_CARD_LIMIT,
    dismissed,
  };
}

/**
 * THE ONE REPORTED LINE. Each reported symptom with its frequency (and an
 * inline source label only where its source differs from the card's), then
 * the answer change if one exists. When the answers moved in different ways
 * the change names the symptom it belongs to; every change is in View
 * evidence either way.
 */
function reportedSummaryOf(reported: readonly BriefingReportedLine[]): string {
  const items = reported.map((line) => {
    const name = line.sideLabel ? `${line.signalName} (${line.sideLabel})` : line.signalName;
    return `${name}, ${line.valueLabel}${line.inlineSource ? ` ${line.inlineSource}` : ''}`;
  });
  const moved = primaryChange(reported);
  const change = moved
    ? moved.named
      ? answerChangedForLine(inSentence(moved.line.signalName), moved.change.toLabel, moved.change.toOn, moved.change.fromLabel, moved.change.fromOn)
      : changedSinceLine(moved.change.toLabel, moved.change.toOn, moved.change.fromLabel, moved.change.fromOn)
    : null;
  return change ? `${items.join('; ')}. ${change}.` : `${items.join('; ')}.`;
}

type ChangedLine = BriefingReportedLine & { change: Exclude<BriefingChange, { kind: 'first_recorded' }> };

/**
 * The answer change a card speaks of: the first reported line that moved.
 * Named when the card holds another reported answer that did not move the
 * same way, so a change is never read as belonging to the wrong symptom.
 */
function primaryChange(
  reported: readonly BriefingReportedLine[]
): { line: ChangedLine; change: ChangedLine['change']; named: boolean } | null {
  const moved = reported.find((line): line is ChangedLine => line.change.kind === 'changed');
  if (!moved) return null;
  const named = reported.some((line) => line.change.line !== moved.change.line);
  return { line: moved, change: moved.change, named };
}

/**
 * EXPLORE NEXT. One question by default, joining two pieces of HER
 * evidence: an answer that moved between two sittings (asked as a change in
 * her answer, which may or may not be a change in the symptom), or two of
 * her own signals. A second question only when it adds something the first
 * did not: a pinned pair question after a change question. A generic
 * coaching question is never generated here; the map entry's own
 * considerations stay in View evidence.
 */
function exploreQuestions(input: {
  anchorSlug: string;
  anchorName: string;
  reported: readonly BriefingReportedLine[];
  pairs: ReadonlyArray<{ slug: string; name: string }>;
}): string[] {
  const out: string[] = [];
  const moved = primaryChange(input.reported);
  if (moved) {
    const question = cautious(
      exploreChangeQuestion(
        moved.change.toLabel,
        moved.change.fromLabel,
        moved.named ? inSentence(moved.line.signalName) : null
      ),
      ''
    );
    if (question) out.push(question);
  }
  const pinnedPair = input.pairs
    .map((pair) => PAIR_QUESTIONS[[input.anchorSlug, pair.slug].sort().join('+')])
    .find((question): question is string => Boolean(question));
  if (pinnedPair) {
    const question = cautious(pinnedPair, '');
    if (question && !out.includes(question)) out.push(question);
  } else if (out.length === 0 && input.pairs.length > 0) {
    const question = cautious(
      explorePairQuestion(inSentence(input.anchorName), inSentence(input.pairs[0]!.name)),
      ''
    );
    if (question) out.push(question);
  }
  return out.slice(0, EXPLORE_NEXT_LIMIT);
}

/** Every answer she has given about each signal, oldest first. */
function timelinesFor(
  slugs: readonly string[],
  input: RootBriefingInputs,
  sittings: Sittings | null,
  refsBySlug: ReadonlyMap<string, string[]>
): BriefingTimeline[] {
  const surveyLabel =
    input.library.sources.get(SOURCE_BODY_SYSTEMS)?.displayName ?? 'Body Systems Survey';
  const out: BriefingTimeline[] = [];
  for (const slug of [...new Set(slugs)]) {
    const entries: Array<BriefingTimelineEntry & { at: string }> = [];
    const refs = refsBySlug.get(slug) ?? [];
    if (sittings && refs.length > 0) {
      for (const sitting of sittings.ordered) {
        for (const ref of refs) {
          const answer = sittings.answerOf(sitting, ref);
          // A question her path never asked is not a point on her timeline.
          if (answer.kind === 'not_assessed' && answer.reason === 'notOnBranch') continue;
          const on = sittings.dayOf(sitting);
          entries.push({
            on,
            onDisplay: shortDay(on, input.today),
            valueLabel:
              answer.kind === 'answered'
                ? answer.label
                : absenceLine('not_assessed', NOT_ASSESSED_REASONS[answer.reason]),
            sourceLabel: surveyLabel,
            questionPrompt: sittings.promptOf(ref),
            note: null,
            at: sitting.completedAt!,
          });
        }
      }
    }
    for (const record of input.records) {
      if (record.signalSlug !== slug || isRollupRow(record)) continue;
      if (record.sourceKey === SOURCE_BODY_SYSTEMS && sittings && refs.length > 0) continue;
      entries.push({
        on: record.capturedOn,
        onDisplay: shortDay(record.capturedOn, input.today),
        valueLabel: record.valueLabel,
        sourceLabel: record.sourceLabel,
        questionPrompt: record.valueKind === 'scale' ? record.sourceQuestionPrompt : null,
        note: record.note,
        at: record.capturedAt,
      });
    }
    entries.sort((a, b) => a.on.localeCompare(b.on) || a.at.localeCompare(b.at));
    out.push({
      signalSlug: slug,
      signalName: input.library.names.get(slug)?.displayName ?? slug,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      entries: entries.map(({ at: _at, ...entry }) => entry),
    });
  }
  return out;
}

/**
 * The signals near this card that have nothing current, each in its own
 * kind of absence: the other signals of the same primary complaint, and
 * every signal the map told Root to look at for it.
 */
function absencesFor(
  targetKey: string,
  memberSlugs: ReadonlySet<string>,
  drafts: readonly RootFindingDraft[],
  input: RootBriefingInputs,
  sittings: Sittings | null,
  refsBySlug: ReadonlyMap<string, string[]>,
  histories: readonly SignalHistory[]
): BriefingAbsence[] {
  const candidates: string[] = [];
  if (targetKey.startsWith('group:')) {
    for (const name of input.library.names.values()) {
      if (memberSlugs.has(name.signalSlug)) continue;
      if (groupKeyFor(name.signalSlug, input.library.names) !== targetKey) continue;
      if ((refsBySlug.get(name.signalSlug) ?? []).length === 0) continue;
      candidates.push(name.signalSlug);
    }
  }
  for (const draft of drafts) {
    for (const area of draft.areas) {
      // A support component names a section rollup, which is context and
      // never an absence of a symptom.
      if (area.refKind !== 'signal' || area.role === 'support') continue;
      if (area.rows.some((row) => isLiveState(row.state))) continue;
      candidates.push(area.refKey);
    }
  }
  const out: BriefingAbsence[] = [];
  for (const slug of [...new Set(candidates)].sort()) {
    if (memberSlugs.has(slug)) continue;
    const absence = absenceFor(slug, input, sittings, refsBySlug, histories);
    if (!absence) continue;
    out.push({
      signalSlug: slug,
      signalName: input.library.names.get(slug)?.displayName ?? slug,
      kind: absence.kind,
      line: absenceLine(absence.kind, absence.detail),
    });
  }
  return out;
}

/**
 * The survey section result behind each reported survey answer, from the
 * same sitting, as the section's band word. Assessment context for View
 * evidence: never a related finding, never ranked, and never a percentage.
 */
function assessmentContextFor(
  rows: readonly SignalRecord[],
  input: RootBriefingInputs
): BriefingAssessmentContext[] {
  const survey = input.questionnaire;
  if (!survey) return [];
  const sectionOfQuestion = new Map(survey.content.questions.map((question) => [question.questionRef, question.sectionKey]));
  const sectionName = new Map(survey.content.sections.map((section) => [section.sectionKey, section.displayName]));
  const out: BriefingAssessmentContext[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.sourceKey !== SOURCE_BODY_SYSTEMS || !row.sourceQuestionRef || !row.sourceSessionId) continue;
    const sectionKey = sectionOfQuestion.get(row.sourceQuestionRef);
    if (!sectionKey) continue;
    const key = `${row.sourceSessionId}::${sectionKey}`;
    if (seen.has(key)) continue;
    const band = input.records.find(
      (record) =>
        record.valueKind === 'band' &&
        record.sourceKey === SOURCE_BODY_SYSTEMS &&
        record.sourceSessionId === row.sourceSessionId &&
        record.sourceQuestionRef === sectionKey
    );
    if (!band) continue;
    seen.add(key);
    out.push({
      sectionName: sectionName.get(sectionKey) ?? sectionKey,
      bandLabel: band.valueLabel,
      sourceLabel: band.sourceLabel,
      onDisplay: shortDay(band.capturedOn, input.today),
    });
  }
  return out;
}
