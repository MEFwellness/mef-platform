/**
 * EVERY SENTENCE A COACH READS ABOUT A ROOT FINDING, in one file.
 *
 * WHY IT IS SPLIT OUT, which is Prompt 3's reason and still the right one.
 * The lookup engine is reachable from a MEMBER'S own submit, because
 * classifying her check-in note is what triggers it. So the engine holds no
 * coach facing wording at all: it reaches a STATE, and this file, which no
 * member surface imports, turns that into a line. A test asserts both
 * halves.
 *
 * NOTHING HERE DIAGNOSES, AND NOTHING HERE CAN. Read the strings: they
 * describe what was checked, what was found and what is worth asking. Not
 * one of them names two things and says one produced the other, and not one
 * of them has a slot a body part could be interpolated into except where
 * that part is being NAMED rather than blamed.
 *
 * NO EM DASH ANYWHERE. Commas, periods, colons or parentheses instead.
 */

import {
  RELATIONSHIP_SOURCE_TYPE_BASIS,
  RELATIONSHIP_SOURCE_TYPE_LABELS,
  type RelationshipSourceTypeKey,
} from '@/lib/cross-system-relationships/constants';
import { CURRENT_WINDOW_DAYS, RECENT_WINDOW_DAYS, type EvidenceState } from './evidence';
import {
  OTHER_SOURCE_WINDOW_DAYS,
  type QuestionnaireBasis,
} from '@/lib/cross-system-signals/questionnaireRules';

/** The panel's coach facing name, used by the section and the page index. */
export const ROOT_NOTICED_LABEL = 'Root Noticed';

/** The collapsible section's DOM anchor on the client detail page. */
export const ROOT_NOTICED_SECTION_ID = 'detail-section-root-noticed';
export const ROOT_NOTICED_CARD_ID = 'detail-card-root-noticed';

/** The eight headings a finding is built from, in the order the brief names them. */
export const FINDING_HEADINGS = {
  presentingComplaint: 'Presenting complaint',
  areasChecked: 'Areas Root checked',
  currentFindings: 'Current supporting findings',
  systemResult: 'System result',
  individualResponses: 'Relevant individual responses',
  historicalContext: 'Recent and historical context',
  notObserved: 'Not currently observed',
  sources: 'Sources',
  whyChecked: 'Why Root checked this area',
  considerations: 'Coaching considerations',
  questions: 'Suggested questions to explore',
} as const;

/**
 * What each evidence state is called where a coach reads it.
 *
 * THE FOUR ARE KEPT APART, in words as well as in the data. "She has this
 * now" and "she had this and it settled" are different things to say, and a
 * shared label would have thrown the difference away on the screen after
 * the engine went to the trouble of keeping it.
 */
export const STATE_LABELS: Record<EvidenceState, string> = {
  current: 'Current',
  recent: 'Recent',
  historical: 'Historical',
  resolved: 'Reported before, not current',
  not_observed: 'Not currently observed',
};

/**
 * A COUNTED CLAIM ALWAYS NAMES ITS WINDOW. This repository's own standing
 * rule, and these are the two windows every state above is measured
 * against.
 */
export const STATE_EXPLANATIONS: Record<EvidenceState, string> = {
  current: `Reported in the last ${CURRENT_WINDOW_DAYS} days.`,
  recent: `Reported between ${CURRENT_WINDOW_DAYS} and ${RECENT_WINDOW_DAYS} days ago.`,
  historical: `Last reported more than ${RECENT_WINDOW_DAYS} days ago, with nothing since.`,
  resolved: 'Reported before, and the most recent answer no longer supports it as current.',
  not_observed: 'Nothing in her data sits under this area at the moment.',
};

/**
 * What Root read a resolution as, said plainly beside the signal name.
 *
 * WHY IT IS SAID AT ALL. A sentence closing something out now writes a row
 * instead of vanishing, which means the coach's card can show a signal name
 * she has just been told is FINISHED. Printing the name without this line
 * would read as a current complaint, which is the opposite of what the
 * member said.
 */
export const RESOLUTION_SUFFIX = 'reported as settled';

/** The one line that opens a finding. */
export function noticedLine(): string {
  return 'Root read what she reported and checked her whole-body data against the Association Map.';
}

/**
 * WHY ROOT CHECKED THIS AREA, said as a fact about the map rather than as a
 * claim about her body.
 *
 * The area is NAMED here, not blamed: the sentence says the coach's own map
 * links this kind of complaint with this area, which is exactly what the
 * stored relationship says and nothing more.
 */
export function whyCheckedLine(patternName: string, areaLabel: string): string {
  return `Your Whole-Body Association Map lists ${areaLabel} under "${patternName}" as an area that may be worth reviewing.`;
}

/** What a finding's header says it found, in counts of her own rows. */
export function summaryLine(input: {
  areaCount: number;
  currentCount: number;
  notObservedCount: number;
}): string {
  const areas = plural(input.areaCount, 'area', 'areas');
  if (input.currentCount === 0) {
    return `Root checked ${areas} and found nothing currently reported in any of them.`;
  }
  // Never "1 areas", and never "1 of them have". Both halves agree with
  // their own count, which is why the verb is chosen here rather than by
  // the plural helper, whose job is a noun.
  const verb = input.currentCount === 1 ? 'has' : 'have';
  return `Root checked ${areas}. ${input.currentCount} of them ${verb} something currently reported.`;
}

/** The line a convergence gets. Counted, never concluded from. */
export function convergenceLine(areaLabel: string, findingCount: number): string {
  return `Several current findings overlap with ${areaLabel} in your Whole-Body Association Map (${findingCount} separate reports led here).`;
}

/** The proactive line at the top of the coach's client detail. */
export function proactiveLine(findingCount: number): string {
  if (findingCount === 1) return '1 new whole-body connection may be worth reviewing.';
  return `${findingCount} new whole-body connections may be worth reviewing.`;
}

/** What is drawn in place of a finding the red flag system withheld. */
export const SAFETY_WITHHELD_HEADING = 'A safety response needs attention first';
export const SAFETY_WITHHELD_BODY =
  'One of the responses behind this report is covered by the existing red flag process. Root is not showing a whole-body association for it. Follow the red flags pinned to her Body Systems Survey.';

/** The empty state, which says what is true rather than offering to fill itself. */
export const EMPTY_HEADING = 'Nothing to review';
export const EMPTY_BODY =
  'Root has not read a complaint or a Body Systems Survey from this client yet. When she reports something in a check-in, a note or an assessment, or completes her Body Systems Survey, Root checks her whole-body data against the Association Map automatically.';

/** The basis line under an association, so the basis is stated rather than implied. */
export function basisLine(sourceTypeKey: string): string {
  const key = sourceTypeKey as RelationshipSourceTypeKey;
  const label = RELATIONSHIP_SOURCE_TYPE_LABELS[key] ?? RELATIONSHIP_SOURCE_TYPE_LABELS.other;
  const basis = RELATIONSHIP_SOURCE_TYPE_BASIS[key] ?? RELATIONSHIP_SOURCE_TYPE_BASIS.other;
  return `${label}. ${basis}`;
}

/** The standing reminder under every finding. */
export const NOT_A_DIAGNOSIS =
  'This is for your review. Root does not diagnose, and none of the areas above is being named as the reason for what she reported.';

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

// ---------------------------------------------------------------------
// The Body Systems Survey, as Root reads it.
//
// NO PERCENTAGE AND NO SCORE, ANYWHERE BELOW. A survey finding names the
// signals her answers support and the words she chose; the survey's own
// percentages and bands stay on the survey's own card. Not one of these
// strings carries a number other than a window of days.
// ---------------------------------------------------------------------

/** The heading over everything Root read from her newest sitting. */
export const QUESTIONNAIRE_HEADING = 'From her latest Body Systems Survey';

/** What her newest sitting currently supports, by signal name. */
export function questionnaireSupportsLine(sourceLabel: string, signalNames: readonly string[]): string {
  return `${sourceLabel} currently supports: ${signalNames.join(', ')}.`;
}

/** The line that opens the survey block. */
export function questionnaireIntroLine(sittingOnDisplay: string, activeCount: number): string {
  if (activeCount === 0) {
    return `Root read her Body Systems Survey from ${sittingOnDisplay}. None of her answers are active signals, so there was nothing to check against your Association Map.`;
  }
  const answers = activeCount === 1 ? '1 of her answers is an active signal' : `${activeCount} of her answers are active signals`;
  return `Root read her Body Systems Survey from ${sittingOnDisplay}. ${answers}, and Root checked each one against your Association Map.`;
}

/** Printed on a complaint card when her newest survey supports the same map entry. */
export function alsoSupportedByLine(labels: readonly string[]): string {
  return `Also currently supported by: ${labels.join(', ')}.`;
}

/** How many survey findings are folded away. */
export function moreQuestionnaireFindingsLabel(count: number): string {
  return count === 1 ? 'Show 1 more connection' : `Show ${count} more connections`;
}

/** The trace's own heading and lead. */
export const TRACE_HEADING = 'How Root read each answer';
export const TRACE_LEAD =
  'Every question on her latest survey, what she answered, the signal it maps to, whether Root treats it as active, and where it led.';

/**
 * WHY AN ANSWER IS, OR IS NOT, AN ACTIVE SIGNAL, one line per branch of the
 * rule in lib/cross-system-signals/questionnaireRules.ts.
 */
export function answerBasisLine(basis: QuestionnaireBasis, detail: {
  supportingSourceLabels: readonly string[];
  relatedTitles: readonly string[];
}): string {
  switch (basis) {
    case 'often_or_more':
      return 'Active: answered Often or Almost always.';
    case 'sometimes_section_elevated':
      return 'Active: answered Sometimes, and its survey section is strongly elevated on this sitting.';
    case 'sometimes_related_association':
      return detail.relatedTitles.length > 0
        ? `Active: answered Sometimes, and a related Body Systems association fired (${detail.relatedTitles.join('; ')}).`
        : 'Active: answered Sometimes, and a related Body Systems association fired.';
    case 'sometimes_other_source':
      return `Active: answered Sometimes, and ${detail.supportingSourceLabels.join(', ')} also reported it within ${OTHER_SOURCE_WINDOW_DAYS} days.`;
    case 'sometimes_without_support':
      return 'Not active: answered Sometimes, with nothing supporting it.';
    case 'rarely_or_never':
      return 'Not active: answered Rarely or Never.';
    default:
      return 'Not active.';
  }
}

/** The trace line for a question that produced no signal at all. */
export const TRACE_NO_SIGNAL = {
  doesNotApply: 'Marked as not applying to her. No signal.',
  unanswered: 'Not answered. No signal.',
  unmapped: 'No canonical signal is mapped to this question yet.',
} as const;

/** The trace's state column when the signal has never been reported. */
export const TRACE_NEVER_REPORTED = 'Not reported';

/** Where an answer led, or that it led nowhere. */
export function ledToLine(patternNames: readonly string[]): string {
  if (patternNames.length === 0) return 'Led to no Root finding.';
  return `Led Root to: ${patternNames.join('; ')}.`;
}

/** On a survey answer a newer sitting has replaced, wherever a coach reads the row. */
export const SUPERSEDED_ANSWER_LINE =
  'Not current: a newer Body Systems Survey has replaced this answer.';

/** Which sources currently support a signal, on the coach's Signals list. */
export function currentlySupportedByLine(labels: readonly string[]): string {
  return `Currently supported by: ${labels.join(', ')}.`;
}


// ---------------------------------------------------------------------
// The coach briefing (./briefing.ts), which sits above the evidence.
//
// EVERY SENTENCE LEADS WITH WHAT SHE REPORTED. A headline names her own
// reported symptom first and an exploration direction second, never an
// area of the map she did not report. Every generated line is also run
// through the Relationship Library's banned list when it is built, and a
// line that fails is replaced by a fixed one (see `cautious` in
// ./briefing.ts), because a signal name is stored content this file cannot
// see.
//
// NO SCORE, NO PERCENTAGE AND NO CAUSAL WORD. The only numbers are counts
// of her own signals and the dates she answered on.
// ---------------------------------------------------------------------

export const BRIEFING_HEADING = 'Coach briefing';

export const BRIEFING_LEAD =
  'What her current answers bring forward, what supports each one, and what to explore next.';

/** When the briefing was last evaluated. */
export function briefingUpdatedLine(display: string): string {
  return `Last updated ${display}.`;
}

/** Said once per briefing, never per card. */
export const BRIEFING_DISCLAIMER =
  'For your review only. Each card is an association worth exploring together with her, and none of it names a reason for anything she reported.';

export const BRIEFING_EMPTY =
  'No reported finding is active right now. Everything Root checked is still in the full evidence below.';

/** The five parts of a card, in the order they are drawn. */
export const BRIEFING_PARTS = {
  reported: 'Reported',
  related: 'Related findings',
  why: 'Why review together',
  explore: 'Explore next',
  evidence: 'View evidence',
} as const;

/**
 * The exploration direction a related signal suggests, by its category.
 * A direction is a topic to explore, never a system being named as the
 * reason. Null means the category offers no useful direction.
 */
export const DIRECTION_BY_CATEGORY: Readonly<Record<string, string | null>> = {
  joint_movement: 'movement',
  musculoskeletal: 'movement load',
  posture_alignment: 'posture',
  pain_discomfort: 'pain patterns',
  skin_immune: 'skin signals',
  immune: 'immune signals',
  kidney_bladder: 'fluid balance',
  digestion: 'digestion',
  nutrition: 'meals and fuel',
  clearance_detox: 'clearance signals',
  metabolic: 'meal timing',
  stress: 'stress',
  sleep: 'sleep',
  hormonal: 'hormonal rhythms',
  circulation: 'circulation',
  respiratory: 'breathing',
  neurological: 'nervous system signals',
  energy: 'energy',
  mood: 'mood',
  other: null,
};

/** Where one signal says more than its category does. */
export const DIRECTION_BY_SIGNAL: Readonly<Record<string, string>> = {
  'headaches-when-not-eaten': 'meal timing',
  'shaky-when-meals-delayed': 'meal timing',
  'energy-rises-and-crashes': 'meal timing',
  'feeling-anxious-or-on-edge': 'stress',
  'small-stresses-feel-harder': 'stress',
  'heart-racing-under-stress': 'stress',
  'racing-mind-at-bedtime': 'sleep',
  'waking-between-1-and-3-am': 'sleep',
  'lighter-or-broken-sleep': 'sleep',
};

/**
 * The headline. Her reported symptom, then a cautious direction.
 *
 * "Headaches: explore meal timing and stress." With no supported direction
 * it says there are related areas to explore when the map lists some, and
 * only that it is worth reviewing when the map lists none.
 */
export function briefingHeadline(
  anchorName: string,
  directions: readonly string[],
  mapListsAreas: boolean
): string {
  if (directions.length >= 2) return `${anchorName}: explore ${directions[0]} and ${directions[1]}.`;
  if (directions.length === 1) return `${anchorName}: explore ${directions[0]}.`;
  if (mapListsAreas) return `${anchorName}: related areas to explore.`;
  return `${anchorName}: worth reviewing.`;
}

/** A headline that failed the language check is replaced by this one, which names no stored words. */
export const BRIEFING_HEADLINE_FALLBACK = 'A reported finding worth reviewing.';

/**
 * When she reported it, and the window the instrument asked about.
 *
 * NEVER "in the last 30 days". A survey asking about the past three months
 * submitted Sep 16 reads "Reported Sep 16 (covers past 3 months)".
 */
export function reportedOnLine(dayDisplay: string, window: string | null): string {
  return window ? `Reported ${dayDisplay} (covers ${window})` : `Reported ${dayDisplay}`;
}

export const NO_RELATED_FINDINGS = 'No related findings are currently supported by her answers.';

/** The one sentence under "Why review together". */
export function whyReviewTogetherLine(input: {
  anchorName: string;
  relatedNames: readonly string[];
  groupedNames: readonly string[];
  mapListsAreas: boolean;
}): string {
  const others = [...input.groupedNames, ...input.relatedNames];
  if (input.relatedNames.length > 0) {
    const listed = others.length === 1 ? others[0] : `${others.length} of her current signals`;
    return `Your Association Map links ${input.anchorName} with ${listed}, and her current answers include ${others.length === 1 ? 'both' : 'all of them'}.`;
  }
  if (input.groupedNames.length > 0) {
    return `Her answers describe ${input.anchorName} in more than one way, so they are reviewed as one.`;
  }
  if (input.mapListsAreas) {
    return 'Your Association Map lists areas to check beside it, and her current answers support none of them yet.';
  }
  return 'No Association Map entry lists this signal yet, so it is shown on its own.';
}

export const WHY_REVIEW_FALLBACK = 'Shown so you can review it together with her.';

/** The change marker on a card or a reported line. */
export const FIRST_RECORDED = 'First recorded';
export const CHANGED_SINCE_LAST_TIME = 'Changed since last time';

/** "Changed since last time: Often (Sep 16) from Rarely (Jun 12)." */
export function changedSinceLine(to: string, toOn: string, from: string, fromOn: string): string {
  return `${CHANGED_SINCE_LAST_TIME}: ${to} (${toOn}) from ${from} (${fromOn})`;
}

/** Comparable history exists and nothing moved. */
export function unchangedSinceLine(label: string, fromOn: string, toOn: string): string {
  return `Same as last time: ${label} (${fromOn} and ${toOn})`;
}

/** What "First recorded" means, so it is never read as "just began". */
export const FIRST_RECORDED_NOTE = 'No earlier answer to compare with. This does not mean it just began.';

/** A question connecting two of her answers, where one moved between two dates. */
export function exploreChangeQuestion(name: string, from: string, fromOn: string, to: string, toOn: string): string {
  return `${name} went from ${from} (${fromOn}) to ${to} (${toOn}). What changed for you in between?`;
}

/** A question connecting two of her own reported signals. */
export function explorePairQuestion(first: string, second: string): string {
  return `Do ${first} and ${second} tend to show up on the same days?`;
}

/**
 * Pairs where a plainer question exists. Keyed by the two slugs, sorted
 * and joined with a plus sign.
 */
export const PAIR_QUESTIONS: Readonly<Record<string, string>> = {
  'headaches+headaches-when-not-eaten': 'Do your headaches follow delayed or skipped meals?',
  'headaches+shaky-when-meals-delayed': 'Do your headaches show up on the days a meal is delayed?',
  'bloating-after-eating+fullness-long-after-meals': 'Do the bloating and the long fullness follow the same meals?',
  'feeling-anxious-or-on-edge+headaches': 'Do your headaches tend to come on the days you feel more on edge?',
  'lighter-or-broken-sleep+racing-mind-at-bedtime': 'On the nights sleep is broken, was your mind racing at bedtime?',
};

export const EXPLORE_NOTHING_CONNECTS =
  'Nothing yet connects two of her answers. The coaching considerations for this signal are in View evidence.';

/** Why a card sits where it does, in plain words. No score. */
export function rankReasonLine(parts: {
  pinned: boolean;
  change: 'changed' | 'first_recorded' | 'unchanged';
  worsening: boolean;
  frequencyLabel: string | null;
  supportingSignalCount: number;
  sourceCount: number;
}): string {
  const out: string[] = [];
  if (parts.pinned) out.push('Pinned for next session');
  if (parts.change === 'changed') {
    out.push(parts.worsening ? 'Changed since last time (more often than before)' : 'Changed since last time');
  } else if (parts.change === 'first_recorded') {
    out.push('First recorded');
  } else {
    out.push('No change since last time');
  }
  out.push(parts.frequencyLabel ? `reported ${parts.frequencyLabel}` : 'reported in her own words');
  out.push(
    parts.supportingSignalCount === 0
      ? 'no supporting signals'
      : parts.supportingSignalCount === 1
        ? '1 supporting signal'
        : `${parts.supportingSignalCount} supporting signals`
  );
  if (parts.sourceCount > 1) out.push(`from ${parts.sourceCount} sources`);
  const line = out.join(', ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

export const RANK_REASON_HEADING = 'Why this ranked here';

/** The four kinds of absence, kept apart in words. */
export const ABSENCE_LABELS = {
  not_reported_latest: 'Not reported on the latest assessment',
  not_assessed: 'Not assessed',
  previously_reported_now_below: 'Previously reported, now below the active threshold',
  historical_no_update: 'Historical evidence with no recent update',
} as const;

export type AbsenceKind = keyof typeof ABSENCE_LABELS;

/** One absence, with what it rests on. */
export function absenceLine(kind: AbsenceKind, detail: string | null): string {
  return detail ? `${ABSENCE_LABELS[kind]} (${detail})` : ABSENCE_LABELS[kind];
}

/** The reasons a question counts as not assessed. A branched out question is never "Never". */
export const NOT_ASSESSED_REASONS = {
  notOnBranch: 'the question was not asked on her survey path',
  doesNotApply: 'marked as not applying to her',
  unanswered: 'left unanswered',
  noQuestion: 'no question or report on record covers it',
} as const;

/** The review actions, by key. */
export const REVIEW_ACTION_LABELS = {
  discuss_next_session: 'Discuss next session',
  reviewed: 'Reviewed',
  not_relevant: 'Not relevant',
} as const;

export const BRIEFING_MARKERS = {
  newSinceReview: 'New since you last reviewed',
  changedSinceReview: 'Changed since your last review',
  pinned: 'Discuss next session',
} as const;

export function viewAllFindingsLabel(hidden: number): string {
  return hidden === 1 ? 'View all findings (1 more)' : `View all findings (${hidden} more)`;
}

export function dismissedFoldLabel(count: number): string {
  return count === 1 ? 'Reviewed or not relevant (1)' : `Reviewed or not relevant (${count})`;
}

/** What a dismissed card says about itself in the fold. */
export function dismissedLine(actionLabel: string, onDisplay: string): string {
  return `${actionLabel} on ${onDisplay}. It returns here if her evidence changes.`;
}

export const EVIDENCE_HEADINGS = {
  answers: 'Every answer behind this card',
  timelines: 'Signal timelines',
  absences: 'Related questions with nothing current',
  associations: 'Association details',
  fullEvidence: 'All evidence Root checked',
} as const;

/** Said once for a whole map entry, instead of once per area. */
export function whyCheckedEntryLine(patternName: string): string {
  return `Your Whole-Body Association Map lists every area below under "${patternName}" as an area that may be worth reviewing.`;
}

export function notObservedFoldLabel(count: number): string {
  return count === 1 ? '1 area not currently observed' : `${count} areas not currently observed`;
}

/** A review action the server refused or could not save. */
export const REVIEW_SAVE_FAILED = 'That did not save. Try again.';

/** A card dismissed on this screen, before the next visit reads it back. */
export function dismissedJustNowLine(actionLabel: string): string {
  return `${actionLabel} just now. It returns here if her evidence changes.`;
}

export const HIDE_EVIDENCE = 'Hide evidence';
export const CONNECTED_THROUGH = 'Connected through';
export const NO_TIMELINE_ENTRIES = 'Nothing on record.';
export const HER_WORDS = 'Her words';
