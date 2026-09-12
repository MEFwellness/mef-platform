/**
 * The coach's whole reading of one sitting, assembled once.
 *
 * IT IS A PURE FUNCTION OVER STORED ROWS. Content in, answers in, a data
 * object out. No query, no clock, no randomness, so the panel that renders
 * it can be driven by a fixture read out of the migrations and the same
 * answers always produce the same page.
 *
 * NOTHING HERE COMPOSES A CLAIM. The only sentence this module assembles
 * is the Zone contribution line, and every fragment of it is a stored copy
 * row plus the coach topics the member's own answers put at the top. Every
 * pattern sentence and every coaching question is a column on the row that
 * fired, verbatim.
 *
 * IT IS AN INTERPRETATION, AND IT SAYS SO. The Zone panel carries the
 * stored interpretation note, and no Zone exercise, instruction, media or
 * hint exists anywhere in this feature to put beside it.
 */

import { answerSignal, optionForQuestion, shownQuestionsInSection, shownQuestions, PRIMARY_ZONE_WEIGHT, SECONDARY_ZONE_WEIGHT } from './scoring';
import { recommendedPriorities, zonePatterns } from './results';
import { evaluatePatterns, type FiredPattern } from './patterns';
import { selectCoachingQuestions, type SelectedCoachingQuestion } from './coachingQuestions';
import { compareLoad, compareSections, compareZones, type LoadTrend, type SectionComparison, type ZoneShift } from './retake';
import { coachCopy, fillToken } from './copyKeys';
import { PNTA_VALUE } from './constants';
import type { CoachContent } from './contentData';
import type { PractitionerQuestion, SectionResult, WbsResults, WbsAnswers } from './types';

/** One row of the signal map, and of the priorities block above it. */
export type CoachSectionRow = {
  sectionKey: string;
  sectionName: string;
  percent: number;
  bandKey: string;
  bandLabel: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  answeredCount: number;
  pntaCount: number;
  /** False for a section whose every shown question was declined or unanswered. */
  isScorable: boolean;
};

/** One answer, as the coach's why block and its View All Answers print it. */
export type CoachAnswerRow = {
  questionRef: string;
  prompt: string;
  coachTopic: string;
  /** Her own answer, the scale label she tapped, or the Prefer not to answer note. */
  answerLabel: string;
  /** Null for a Prefer not to answer or an unanswered question. */
  signal: number | null;
  isPnta: boolean;
};

export type WhyThisScored = {
  sectionKey: string;
  strongCount: number;
  moderateCount: number;
  lowCount: number;
  /** Coach topics, strongest first, of the answers that carried the section. */
  strongestTopics: { topic: string; signal: number }[];
  /** Every shown question of this section, in its stored order. */
  allAnswers: CoachAnswerRow[];
};

export type ZoneContributor = { topic: string; contributedPoints: number };

export type ZonePanelEntry = {
  zoneKey: string;
  zoneName: string;
  percent: number;
  spinalSegments: string;
  organGlandList: string;
  chakraLens: string;
  contributors: ZoneContributor[];
  /** Assembled from stored fragments plus her own top topics. */
  sentence: string;
};

export type CoachReadingView = {
  priorities: CoachSectionRow[];
  prioritiesLine: string;
  signalMap: CoachSectionRow[];
  load: LoadTrend;
  why: WhyThisScored[];
  primaryZone: ZonePanelEntry | null;
  secondaryZone: ZonePanelEntry | null;
  patterns: FiredPattern[];
  coachingQuestions: SelectedCoachingQuestion[];
  comparison: SectionComparison[] | null;
  zoneShift: ZoneShift | null;
  /** Only the sections whose band actually changed, which is what a contributor shift is for. */
  contributorShifts: {
    sectionKey: string;
    sectionName: string;
    previousTopics: { topic: string; signal: number }[];
    currentTopics: { topic: string; signal: number }[];
  }[];
};

function sectionRow(
  result: SectionResult,
  content: CoachContent
): CoachSectionRow | null {
  const section = content.sections.find((entry) => entry.sectionKey === result.sectionKey);
  const band = content.bands.find((entry) => entry.bandKey === result.bandKey);
  if (!section || !band) return null;
  return {
    sectionKey: result.sectionKey,
    sectionName: section.displayName,
    percent: result.percent,
    bandKey: band.bandKey,
    bandLabel: band.memberLabel,
    color: band.coachColor,
    answeredCount: result.answeredCount,
    pntaCount: result.pntaCount,
    isScorable: result.possible > 0,
  };
}

/** Her answer to one question, named by the scale label she actually tapped. */
function answerRow(
  question: PractitionerQuestion,
  content: CoachContent,
  answers: WbsAnswers,
  pntaLabel: string
): CoachAnswerRow {
  const raw = answers[question.questionRef];
  /*
    HER OWN SCALE, NOT ANY SCALE.

    Two scales share one option table, so looking a value up across the
    whole table would print "Often" beside a question that is answered
    Yes / No / Not sure, on the strength of a tap she made before that
    question changed scale. And a Prefer not to answer is recognised by
    being one, rather than by a lookup having failed, so a value that is
    no longer readable reads as Not answered instead of as a decline she
    never made.
  */
  const option = optionForQuestion(content.scale, question, raw);
  const isPnta = raw === PNTA_VALUE;
  const signal = answerSignal(question, content.scale, answers);
  return {
    questionRef: question.questionRef,
    prompt: question.prompt,
    coachTopic: question.coachTopic,
    answerLabel: option ? option.label : isPnta ? pntaLabel : 'Not answered',
    signal,
    isPnta,
  };
}

/** The coach topics that carried one section, strongest first. */
function strongestTopicsFor(input: {
  content: CoachContent;
  answers: WbsAnswers;
  routingOptionKey: string | null;
  sectionKey: string;
  minSignal: number;
}): { topic: string; signal: number }[] {
  const asked = shownQuestionsInSection(
    input.content.questions,
    input.sectionKey,
    input.routingOptionKey,
    input.content.branchRules
  );
  const scored: { topic: string; signal: number; position: number }[] = [];
  for (const question of asked) {
    const signal = answerSignal(question, input.content.scale, input.answers);
    if (signal === null || signal < input.minSignal) continue;
    scored.push({ topic: question.coachTopic, signal, position: question.position });
  }
  scored.sort((a, b) => {
    if (b.signal !== a.signal) return b.signal - a.signal;
    return a.position - b.position;
  });
  return scored.map((entry) => ({ topic: entry.topic, signal: entry.signal }));
}

/**
 * One displayed Zone, with the contributors that put it there and the
 * sentence assembled from stored fragments.
 *
 * CONTRIBUTORS ARE RANKED BY CONTRIBUTED POINTS, not by raw answer, so a
 * question tagged to this Zone at half weight is placed by what it
 * actually gave this Zone. Topics are merged, because two questions under
 * one topic are one contributor from a coach's point of view.
 */
function zonePanelEntry(input: {
  zoneKey: string;
  percent: number;
  content: CoachContent;
  answers: WbsAnswers;
  routingOptionKey: string | null;
  topCount: number;
}): ZonePanelEntry | null {
  const zone = input.content.zones.find((entry) => entry.zoneKey === input.zoneKey);
  if (!zone) return null;

  const asked = shownQuestions(
    input.content.questions,
    input.routingOptionKey,
    input.content.branchRules
  );

  const byTopic = new Map<string, number>();
  for (const question of asked) {
    const signal = answerSignal(question, input.content.scale, input.answers);
    if (signal === null || signal <= 0) continue;
    const weight =
      question.primaryZoneKey === input.zoneKey
        ? PRIMARY_ZONE_WEIGHT
        : question.secondaryZoneKey === input.zoneKey
          ? SECONDARY_ZONE_WEIGHT
          : 0;
    if (weight === 0) continue;
    byTopic.set(question.coachTopic, (byTopic.get(question.coachTopic) ?? 0) + signal * weight);
  }

  const contributors = [...byTopic.entries()]
    .map(([topic, contributedPoints]) => ({ topic, contributedPoints }))
    .sort((a, b) => {
      if (b.contributedPoints !== a.contributedPoints) return b.contributedPoints - a.contributedPoints;
      return a.topic.localeCompare(b.topic);
    })
    .slice(0, Math.max(1, input.topCount));

  return {
    zoneKey: zone.zoneKey,
    zoneName: zone.displayName,
    percent: input.percent,
    spinalSegments: zone.spinalSegments,
    organGlandList: zone.organGlandList,
    chakraLens: zone.chakraLens,
    contributors,
    sentence: zoneSentence({
      zoneName: zone.displayName,
      topics: contributors.map((entry) => entry.topic),
      copy: input.content.coachCopy,
    }),
  };
}

/**
 * "The Zone 1 contribution is primarily coming from bowel and elimination
 * responses."
 *
 * EVERY FIXED WORD IS A STORED FRAGMENT. The lead, the joining word and
 * the tail are three copy rows, and the middle is her own top coach topics
 * lowercased into the sentence. Nothing is invented, so a practitioner
 * rewording the shape reaches every past sitting at once.
 *
 * An empty topic list produces an empty sentence rather than a sentence
 * with nothing in the middle of it.
 */
export function zoneSentence(input: {
  zoneName: string;
  topics: readonly string[];
  copy: Record<string, string>;
}): string {
  if (input.topics.length === 0) return '';
  const lead = fillToken(coachCopy(input.copy, 'coach.zone_sentence_lead'), 'zone', input.zoneName);
  const join = coachCopy(input.copy, 'coach.zone_sentence_join');
  const tail = coachCopy(input.copy, 'coach.zone_sentence_tail');

  const words = input.topics.map((topic) => topic.toLowerCase());
  const middle =
    words.length === 1
      ? words[0]!
      : `${words.slice(0, -1).join(', ')} ${join} ${words[words.length - 1]}`;

  return [lead, middle, tail].filter((part) => part.length > 0).join(' ');
}

export function buildCoachReadingView(input: {
  content: CoachContent;
  answers: WbsAnswers;
  results: WbsResults;
  previous: { answers: WbsAnswers; results: WbsResults } | null;
}): CoachReadingView {
  const { content, answers, results } = input;
  const settings = content.settings;
  const pntaLabel = content.copy['member.pnta_label'] ?? 'Prefer not to answer';

  const signalMap = results.sections
    .map((result) => sectionRow(result, content))
    .filter((row): row is CoachSectionRow => row !== null);

  const priorityKeys = new Set(
    recommendedPriorities(results, settings).map((section) => section.sectionKey)
  );
  const priorities = signalMap.filter((row) => priorityKeys.has(row.sectionKey));
  const prioritiesLine =
    priorities.length >= 2
      ? coachCopy(content.coachCopy, 'coach.priorities_line_two')
      : priorities.length === 1
        ? coachCopy(content.coachCopy, 'coach.priorities_line_one')
        : coachCopy(content.coachCopy, 'coach.priorities_none');

  const why: WhyThisScored[] = results.sections.map((result) => {
    const asked = shownQuestionsInSection(
      content.questions,
      result.sectionKey,
      results.routingOptionKey,
      content.branchRules
    );
    let strongCount = 0;
    let moderateCount = 0;
    let lowCount = 0;
    for (const question of asked) {
      const signal = answerSignal(question, content.scale, answers);
      if (signal === null) continue;
      if (signal >= settings.strongMinSignal) strongCount += 1;
      else if (signal === settings.moderateSignal) moderateCount += 1;
      else lowCount += 1;
    }
    return {
      sectionKey: result.sectionKey,
      strongCount,
      moderateCount,
      lowCount,
      strongestTopics: strongestTopicsFor({
        content,
        answers,
        routingOptionKey: results.routingOptionKey,
        sectionKey: result.sectionKey,
        minSignal: settings.strongMinSignal,
      }),
      allAnswers: asked.map((question) => answerRow(question, content, answers, pntaLabel)),
    };
  });

  const { primary, secondary } = zonePatterns(results, settings);
  const primaryZone = primary
    ? zonePanelEntry({
        zoneKey: primary.zoneKey,
        percent: primary.percent,
        content,
        answers,
        routingOptionKey: results.routingOptionKey,
        topCount: settings.zoneTopContributorCount,
      })
    : null;
  const secondaryZone = secondary
    ? zonePanelEntry({
        zoneKey: secondary.zoneKey,
        percent: secondary.percent,
        content,
        answers,
        routingOptionKey: results.routingOptionKey,
        topCount: settings.zoneTopContributorCount,
      })
    : null;

  const patterns = evaluatePatterns({
    patterns: content.patterns,
    results,
    elevatedMinPercent: settings.elevatedMinPercent,
  });

  const sectionNames = Object.fromEntries(
    content.sections.map((section) => [section.sectionKey, section.displayName])
  );
  const zoneNames = Object.fromEntries(
    content.zones.map((zone) => [zone.zoneKey, zone.displayName])
  );

  const coachingQuestions = selectCoachingQuestions({
    library: content.coachingLibrary,
    questions: content.questions,
    scale: content.scale,
    answers,
    results,
    sectionNames,
    zoneNames,
    elevatedMinPercent: settings.elevatedMinPercent,
    strongMinSignal: settings.strongMinSignal,
    maxQuestions: settings.maxCoachingQuestions,
  });

  const previous = input.previous;
  const comparison = previous
    ? compareSections({
        current: results,
        previous: previous.results,
        minDelta: settings.minDeltaPercent,
      })
    : null;

  const contributorShifts = (comparison ?? [])
    .filter((entry) => entry.changedBand)
    .map((entry) => ({
      sectionKey: entry.sectionKey,
      sectionName: sectionNames[entry.sectionKey] ?? entry.sectionKey,
      previousTopics: previous
        ? strongestTopicsFor({
            content,
            answers: previous.answers,
            routingOptionKey: previous.results.routingOptionKey,
            sectionKey: entry.sectionKey,
            minSignal: settings.strongMinSignal,
          }).slice(0, settings.zoneTopContributorCount)
        : [],
      currentTopics: strongestTopicsFor({
        content,
        answers,
        routingOptionKey: results.routingOptionKey,
        sectionKey: entry.sectionKey,
        minSignal: settings.strongMinSignal,
      }).slice(0, settings.zoneTopContributorCount),
    }));

  return {
    priorities,
    prioritiesLine,
    signalMap,
    load: compareLoad(results, previous?.results ?? null),
    why,
    primaryZone,
    secondaryZone,
    patterns,
    coachingQuestions,
    comparison,
    zoneShift: previous ? compareZones(results, previous.results) : null,
    contributorShifts,
  };
}
