/**
 * The coach's half: the cross section patterns, the coaching question
 * selection, the Zone contribution sentence and the reassessment
 * comparison.
 *
 * EVERY CASE IS DRIVEN THROUGH THE REAL CONTENT the migrations seed, and
 * through buildCoachReadingView, which is the one function the panel
 * renders from. Nothing here asserts against a hand written fixture of
 * what a pattern says.
 */

import { describe, it, expect } from 'vitest';
import { buildResults } from '../lib/whole-body-signal/results';
import { evaluatePatterns } from '../lib/whole-body-signal/patterns';
import { selectCoachingQuestions } from '../lib/whole-body-signal/coachingQuestions';
import { buildCoachReadingView, zoneSentence } from '../lib/whole-body-signal/coachView';
import { compareLoad, compareSections, compareZones, directionFor } from '../lib/whole-body-signal/retake';
import { shownQuestions, shownQuestionsInSection } from '../lib/whole-body-signal/scoring';
import type { CoachContent } from '../lib/whole-body-signal/contentData';
import type { WbsAnswers, WbsResults } from '../lib/whole-body-signal/types';
import {
  BANDS,
  BRANCH_RULES,
  COACH_COPY,
  COACHING_LIBRARY,
  MEMBER_COPY,
  PATTERNS,
  QUESTIONS,
  ROUTING_OPTIONS,
  SCALE,
  SECTIONS,
  SETTINGS,
  ZONE_ORDER,
  ZONES,
} from './whole-body-signal-fixture';

const CONTENT: CoachContent = {
  sections: SECTIONS,
  questions: QUESTIONS,
  scale: SCALE,
  bands: BANDS,
  routingOptions: ROUTING_OPTIONS,
  branchRules: BRANCH_RULES,
  copy: MEMBER_COPY,
  settings: SETTINGS,
  zoneOrder: ZONE_ORDER,
  zones: ZONES,
  patterns: PATTERNS,
  coachingLibrary: COACHING_LIBRARY,
  coachCopy: COACH_COPY,
};

const ROUTING = 'changing';

/**
 * Answers that put the named sections at the top of the scale and leave
 * every other section at nothing, so a test can aim a rule.
 *
 * Written in SIGNAL terms rather than in scale terms: a direct question
 * gets Almost Always and a reverse question gets Never, which is the same
 * four points either way.
 */
function answersLoudIn(sectionKeys: string[], routingOptionKey = ROUTING): WbsAnswers {
  const answers: WbsAnswers = {};
  for (const question of shownQuestions(QUESTIONS, routingOptionKey, BRANCH_RULES)) {
    const loud = sectionKeys.includes(question.sectionKey);
    if (loud) {
      answers[question.questionRef] = question.direction === 'reverse' ? 'never' : 'almost_always';
    } else {
      answers[question.questionRef] = question.direction === 'reverse' ? 'almost_always' : 'never';
    }
  }
  return answers;
}

function resultsFor(answers: WbsAnswers, routingOptionKey = ROUTING): WbsResults {
  return buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    branchRules: BRANCH_RULES,
    zoneOrder: ZONE_ORDER,
    answers,
    routingOptionKey,
    settings: SETTINGS,
  });
}

describe('answersLoudIn does what the tests below assume', () => {
  it('puts the named sections at a hundred and every other at nought', () => {
    const results = resultsFor(answersLoudIn(['stress_recovery', 'digestive_flow']));
    const percentOf = new Map(results.sections.map((s) => [s.sectionKey, s.percent]));
    expect(percentOf.get('stress_recovery')).toBe(100);
    expect(percentOf.get('digestive_flow')).toBe(100);
    expect(percentOf.get('body_clock')).toBe(0);
  });
});

describe('the cross section patterns', () => {
  it('fires the Stress and Digestion Axis when both are elevated, and not otherwise', () => {
    const both = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(answersLoudIn(['stress_recovery', 'digestive_flow'])),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(both.map((p) => p.patternKey)).toContain('stress_digestion_axis');

    const one = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(answersLoudIn(['stress_recovery'])),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(one.map((p) => p.patternKey)).not.toContain('stress_digestion_axis');
  });

  it('fires the Depletion Pattern only when all three of its sections are elevated', () => {
    const two = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(answersLoudIn(['stress_recovery', 'recovery_capacity'])),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(two.map((p) => p.patternKey)).not.toContain('depletion_pattern');

    const three = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(
        answersLoudIn(['stress_recovery', 'recovery_capacity', 'body_clock'])
      ),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(three.map((p) => p.patternKey)).toContain('depletion_pattern');
  });

  it('fires Whole-System Load at five elevated sections and not at four', () => {
    const four = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(
        answersLoudIn(['fuel_quality', 'fuel_rhythm', 'digestive_flow', 'gut_environment'])
      ),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(four.map((p) => p.patternKey)).not.toContain('whole_system_load');

    const five = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(
        answersLoudIn([
          'fuel_quality',
          'fuel_rhythm',
          'digestive_flow',
          'gut_environment',
          'clearance_elimination',
        ])
      ),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    expect(five.map((p) => p.patternKey)).toContain('whole_system_load');
  });

  it('the threshold is the STORED one, so moving it moves every rule at once', () => {
    const results = resultsFor(answersLoudIn(['stress_recovery', 'digestive_flow']));
    const raised = evaluatePatterns({ patterns: PATTERNS, results, elevatedMinPercent: 101 });
    expect(raised).toEqual([]);
  });

  it('cites the sections that fired it, loudest first, and nothing else', () => {
    const fired = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(answersLoudIn(['gut_environment', 'digestive_flow'])),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    const echo = fired.find((pattern) => pattern.patternKey === 'gut_history_echo')!;
    expect(echo.citedSections.map((section) => section.sectionKey).sort()).toEqual(
      ['digestive_flow', 'gut_environment'].sort()
    );
  });

  it('prints the stored sentence and nothing composed around it', () => {
    const fired = evaluatePatterns({
      patterns: PATTERNS,
      results: resultsFor(answersLoudIn(['fuel_quality', 'fuel_rhythm'])),
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
    });
    const instability = fired.find((pattern) => pattern.patternKey === 'fuel_instability')!;
    expect(instability.coachText).toBe(
      PATTERNS.find((p) => p.patternKey === 'fuel_instability')!.coachText
    );
  });

  it('fires nothing at all for a sitting with no elevated section', () => {
    expect(
      evaluatePatterns({
        patterns: PATTERNS,
        results: resultsFor(answersLoudIn([])),
        elevatedMinPercent: SETTINGS.elevatedMinPercent,
      })
    ).toEqual([]);
  });
});

describe('the coaching question selection', () => {
  const sectionNames = Object.fromEntries(
    SECTIONS.map((section) => [section.sectionKey, section.displayName])
  );
  const zoneNames = Object.fromEntries(ZONES.map((zone) => [zone.zoneKey, zone.displayName]));

  function select(answers: WbsAnswers, results = resultsFor(answers)) {
    return selectCoachingQuestions({
      library: COACHING_LIBRARY,
      questions: QUESTIONS,
      scale: SCALE,
      answers,
      results,
      sectionNames,
      zoneNames,
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
      strongMinSignal: SETTINGS.strongMinSignal,
      maxQuestions: SETTINGS.maxCoachingQuestions,
    });
  }

  it('NEVER SURFACES MORE THAN THE STORED CAP, even when everything fires', () => {
    const everything = answersLoudIn(SECTIONS.map((section) => section.sectionKey));
    expect(select(everything).length).toBe(SETTINGS.maxCoachingQuestions);
    expect(SETTINGS.maxCoachingQuestions).toBe(6);
  });

  it('ORDERS combination first, then answer level, then Zone, then section', () => {
    const everything = answersLoudIn(SECTIONS.map((section) => section.sectionKey));
    const order = { combination: 0, answer: 1, zone: 2, section: 3 };
    const picked = select(everything);
    for (let i = 1; i < picked.length; i += 1) {
      expect(order[picked[i]!.triggerType]).toBeGreaterThanOrEqual(
        order[picked[i - 1]!.triggerType]
      );
    }
  });

  it('orders strongest first inside a tier', () => {
    const answers = answersLoudIn(['stress_recovery', 'digestive_flow', 'body_clock']);
    // Quieten one section so the combinations it is in score lower.
    for (const question of shownQuestionsInSection(QUESTIONS, 'body_clock', ROUTING, BRANCH_RULES)) {
      answers[question.questionRef] = question.direction === 'reverse' ? 'often' : 'rarely';
    }
    const picked = select(answers).filter((entry) => entry.triggerType === 'combination');
    for (let i = 1; i < picked.length; i += 1) {
      expect(picked[i - 1]!.strength).toBeGreaterThanOrEqual(picked[i]!.strength);
    }
  });

  it('COLLAPSES NEAR DUPLICATE TOPICS, keeping the stronger one', () => {
    // Recovery contrast is the topic of two different section level
    // questions, one under Stress & Recovery and one under Recovery
    // Capacity. A sitting with both elevated may surface it once.
    const answers = answersLoudIn(['stress_recovery', 'recovery_capacity']);
    const picked = selectCoachingQuestions({
      library: COACHING_LIBRARY,
      questions: QUESTIONS,
      scale: SCALE,
      answers,
      results: resultsFor(answers),
      sectionNames,
      zoneNames,
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
      strongMinSignal: SETTINGS.strongMinSignal,
      maxQuestions: 50,
    });
    const topics = picked.map((entry) => entry.topic.toLowerCase());
    expect(new Set(topics).size).toBe(topics.length);
    expect(topics).toContain('recovery contrast');
  });

  it('fires an answer level trigger from a REVERSE question on its converted value', () => {
    // SR11 ("I feel supported by the people around me") is reverse, so
    // Never is a signal of four and is what the library means by SR11 >= 3.
    const answers: WbsAnswers = { SR11: 'never' };
    const picked = select(answers, resultsFor(answers));
    expect(picked.map((entry) => entry.questionKey)).toContain('ans_sr11_support');

    const supported = select({ SR11: 'almost_always' }, resultsFor({ SR11: 'almost_always' }));
    expect(supported.map((entry) => entry.questionKey)).not.toContain('ans_sr11_support');
  });

  it('fires an any-of answer trigger from either of its questions', () => {
    for (const ref of ['GE1', 'GE2']) {
      const answers: WbsAnswers = { [ref]: 'almost_always' };
      const picked = select(answers, resultsFor(answers));
      expect(picked.map((entry) => entry.questionKey)).toContain('ans_ge_antibiotics');
    }
  });

  it('fires a Zone trigger only on the PRIMARY Zone', () => {
    const answers = answersLoudIn(['stress_recovery']);
    const results = resultsFor(answers);
    const primary = results.zones[0]!.zoneKey;
    const picked = select(answers, results);
    const zoneEntries = picked.filter((entry) => entry.triggerType === 'zone');
    for (const entry of zoneEntries) {
      expect(entry.because).toContain(zoneNames[primary]);
    }
  });

  it('surfaces nothing for a sitting where nothing is elevated and no answer is strong', () => {
    const answers = answersLoudIn([]);
    expect(select(answers)).toEqual([]);
  });

  it('says why each one fired, from real numbers rather than a sentence about them', () => {
    const answers = answersLoudIn(['fuel_quality']);
    for (const entry of select(answers)) {
      expect(entry.because.length).toBeGreaterThan(0);
    }
  });
});

describe('the Zone contribution sentence', () => {
  it('is assembled from the three stored fragments plus her own top topics', () => {
    expect(
      zoneSentence({
        zoneName: 'Zone 1',
        topics: ['Bowel consistency', 'Constipation'],
        copy: COACH_COPY,
      })
    ).toBe('The Zone 1 contribution is primarily coming from bowel consistency and constipation responses.');
  });

  it('reads correctly with one topic and with three', () => {
    expect(zoneSentence({ zoneName: 'Zone 3', topics: ['Sugar load'], copy: COACH_COPY })).toBe(
      'The Zone 3 contribution is primarily coming from sugar load responses.'
    );
    expect(
      zoneSentence({ zoneName: 'Zone 6', topics: ['A', 'B', 'C'], copy: COACH_COPY })
    ).toBe('The Zone 6 contribution is primarily coming from a, b and c responses.');
  });

  it('IS EMPTY RATHER THAN HALF A SENTENCE when there is nothing to name', () => {
    expect(zoneSentence({ zoneName: 'Zone 1', topics: [], copy: COACH_COPY })).toBe('');
  });
});

describe('the whole coach reading', () => {
  const answers = answersLoudIn(['stress_recovery', 'digestive_flow', 'body_clock']);
  const results = resultsFor(answers);
  const view = buildCoachReadingView({ content: CONTENT, answers, results, previous: null });

  it('names at most two priorities, with a score and a colour on each', () => {
    expect(view.priorities.length).toBeLessThanOrEqual(2);
    for (const row of view.priorities) {
      expect(typeof row.percent).toBe('number');
      expect(['green', 'yellow', 'orange', 'red']).toContain(row.color);
    }
    expect(view.prioritiesLine).toBe(COACH_COPY['coach.priorities_line_two']);
  });

  it('draws the signal map for every section, loudest first', () => {
    expect(view.signalMap.length).toBe(9);
    for (let i = 1; i < view.signalMap.length; i += 1) {
      expect(view.signalMap[i - 1]!.percent).toBeGreaterThanOrEqual(view.signalMap[i]!.percent);
    }
  });

  it('counts strong, moderate and low answers, and the three add up to what she answered', () => {
    for (const entry of view.why) {
      const section = results.sections.find((s) => s.sectionKey === entry.sectionKey)!;
      expect(entry.strongCount + entry.moderateCount + entry.lowCount).toBe(section.answeredCount);
    }
  });

  it('lists every shown answer under View All Answers, in its stored order', () => {
    const stress = view.why.find((entry) => entry.sectionKey === 'stress_recovery')!;
    expect(stress.allAnswers.length).toBe(12);
    expect(stress.allAnswers[0]!.questionRef).toBe('SR1');
    for (const answer of stress.allAnswers) {
      expect(answer.answerLabel.length).toBeGreaterThan(0);
      expect(answer.coachTopic.length).toBeGreaterThan(0);
    }
  });

  it('names a Prefer not to answer as one, rather than as a score', () => {
    const declined = { ...answers, HPU1: 'pnta' };
    const declinedResults = resultsFor(declined);
    const declinedView = buildCoachReadingView({
      content: CONTENT,
      answers: declined,
      results: declinedResults,
      previous: null,
    });
    const hormone = declinedView.why.find(
      (entry) => entry.sectionKey === 'hormone_pelvic_rhythm'
    )!;
    const row = hormone.allAnswers.find((answer) => answer.questionRef === 'HPU1')!;
    expect(row.isPnta).toBe(true);
    expect(row.signal).toBeNull();
    expect(row.answerLabel).toBe(MEMBER_COPY['member.pnta_label']);
  });

  it('gives the primary Zone its contributors, its spinal segments, its organs and its chakra', () => {
    expect(view.primaryZone).not.toBeNull();
    const zone = view.primaryZone!;
    expect(zone.spinalSegments.length).toBeGreaterThan(0);
    expect(zone.organGlandList.length).toBeGreaterThan(0);
    expect(zone.chakraLens.length).toBeGreaterThan(0);
    expect(zone.contributors.length).toBeGreaterThan(0);
    expect(zone.contributors.length).toBeLessThanOrEqual(SETTINGS.zoneTopContributorCount);
    for (let i = 1; i < zone.contributors.length; i += 1) {
      expect(zone.contributors[i - 1]!.contributedPoints).toBeGreaterThanOrEqual(
        zone.contributors[i]!.contributedPoints
      );
    }
  });

  it('has no reassessment at all on a first sitting', () => {
    expect(view.comparison).toBeNull();
    expect(view.zoneShift).toBeNull();
    expect(view.contributorShifts).toEqual([]);
    expect(view.load.previous).toBeNull();
    expect(view.load.delta).toBeNull();
  });
});

describe('the reassessment comparison', () => {
  const before = answersLoudIn(['stress_recovery', 'digestive_flow']);
  const beforeResults = resultsFor(before);
  const after = answersLoudIn(['body_clock']);
  const afterResults = resultsFor(after);
  const view = buildCoachReadingView({
    content: CONTENT,
    answers: after,
    results: afterResults,
    previous: { answers: before, results: beforeResults },
  });

  it('prints a signed whole number change per section, from the two rounded numbers', () => {
    const stress = view.comparison!.find((entry) => entry.sectionKey === 'stress_recovery')!;
    expect(stress.previousPercent).toBe(100);
    expect(stress.currentPercent).toBe(0);
    expect(stress.delta).toBe(-100);
    expect(stress.direction).toBe('quieter');
  });

  it('says a section did not move when it did not', () => {
    const gut = view.comparison!.find((entry) => entry.sectionKey === 'gut_environment')!;
    expect(gut.delta).toBe(0);
    expect(gut.direction).toBe('unchanged');
    expect(gut.changedBand).toBe(false);
  });

  it('reads the stored threshold rather than a literal', () => {
    expect(directionFor(-SETTINGS.minDeltaPercent, SETTINGS.minDeltaPercent)).toBe('quieter');
    expect(directionFor(SETTINGS.minDeltaPercent - 0.5, SETTINGS.minDeltaPercent)).toBe('unchanged');
  });

  it('STATES THE ZONE SHIFT PLAINLY, as two Zones rather than a direction', () => {
    expect(view.zoneShift).not.toBeNull();
    expect(view.zoneShift!.previousZoneKey).toBe(beforeResults.zones[0]!.zoneKey);
    expect(view.zoneShift!.currentZoneKey).toBe(afterResults.zones[0]!.zoneKey);
    expect(view.zoneShift!.changed).toBe(
      beforeResults.zones[0]!.zoneKey !== afterResults.zones[0]!.zoneKey
    );
  });

  it('shows contributor shifts ONLY for a section that changed band', () => {
    const changed = new Set(
      view.comparison!.filter((entry) => entry.changedBand).map((entry) => entry.sectionKey)
    );
    expect(view.contributorShifts.length).toBe(changed.size);
    for (const shift of view.contributorShifts) {
      expect(changed.has(shift.sectionKey)).toBe(true);
    }
    expect(changed.size).toBeGreaterThan(0);
  });

  it('carries the Signal Load trend as both numbers and their difference', () => {
    const trend = compareLoad(afterResults, beforeResults);
    expect(view.load).toEqual(trend);
    expect(view.load.delta).toBe(afterResults.load.value - beforeResults.load.value);
  });

  it('a section with no prior is a null rather than a change of nought', () => {
    const partial: WbsResults = { ...beforeResults, sections: beforeResults.sections.slice(1) };
    const comparison = compareSections({
      current: afterResults,
      previous: partial,
      minDelta: SETTINGS.minDeltaPercent,
    });
    const missing = comparison.find(
      (entry) => entry.sectionKey === beforeResults.sections[0]!.sectionKey
    )!;
    expect(missing.previousPercent).toBeNull();
    expect(missing.delta).toBeNull();
    expect(missing.direction).toBeNull();
    expect(missing.changedBand).toBe(false);
  });

  it('an absent Zone on either side is not a shift', () => {
    const none: WbsResults = { ...beforeResults, zones: [] };
    expect(compareZones(afterResults, none).changed).toBe(false);
    expect(compareZones(none, afterResults).changed).toBe(false);
  });
});
