/**
 * The MEF Whole-Body Signal Assessment's arithmetic, against the content
 * the migrations genuinely seed.
 *
 * NOTHING IN THIS FILE TYPES A QUESTION, A WEIGHT OR A CUT OFF. Everything
 * comes from tests/whole-body-signal-fixture.ts, which reads migrations
 * 226 and 227, so an edit to a migration is caught here rather than on a
 * member's screen.
 */

import { describe, it, expect } from 'vitest';
import {
  answerSignal,
  bandForPercent,
  buildSectionResults,
  buildSignalLoad,
  buildZoneResults,
  maxSignalPoints,
  scoreSection,
  shownQuestions,
  shownQuestionsInSection,
  signalPoints,
  PRIMARY_ZONE_WEIGHT,
  SECONDARY_ZONE_WEIGHT,
} from '../lib/whole-body-signal/scoring';
import { buildResults, recommendedPriorities, zonePatterns } from '../lib/whole-body-signal/results';
import { PNTA_VALUE } from '../lib/whole-body-signal/constants';
import {
  answerAll,
  BANDS,
  BRANCH_RULES,
  QUESTIONS,
  SCALE,
  SECTIONS,
  SETTINGS,
  ZONE_ORDER,
} from './whole-body-signal-fixture';

const BASE = {
  sections: SECTIONS,
  questions: QUESTIONS,
  scale: SCALE,
  bands: BANDS,
  branchRules: BRANCH_RULES,
};

function optionFor(valueKey: string) {
  return SCALE.find((option) => option.valueKey === valueKey)!;
}

describe('response conversion', () => {
  it('converts Never through Almost Always to 0, 1, 2, 3, 4 on a direct question', () => {
    expect(SCALE.map((option) => option.directPoints)).toEqual([0, 1, 2, 3, 4]);
  });

  it('converts the same five to 4, 3, 2, 1, 0 on a reverse question', () => {
    expect(SCALE.map((option) => option.reversePoints)).toEqual([4, 3, 2, 1, 0]);
  });

  it('reads the direction off the question, so one tap scores two ways', () => {
    const never = optionFor('never');
    expect(signalPoints(never, 'direct')).toBe(0);
    expect(signalPoints(never, 'reverse')).toBe(4);
  });

  it('THE MEMBER SEES NO DIFFERENCE: the five labels are one list, with no direction on them', () => {
    expect(SCALE.map((option) => option.label)).toEqual([
      'Never',
      'Rarely',
      'Sometimes',
      'Often',
      'Almost Always',
    ]);
  });

  it('takes the top of the scale from the scale rather than assuming four', () => {
    expect(maxSignalPoints(SCALE)).toBe(4);
  });

  it('scores a real reverse question the way the specification says', () => {
    // FQ1 is a reverse question: eating close to natural form is the
    // healthy answer, so Almost Always has to be the QUIETEST signal.
    const fq1 = QUESTIONS.find((question) => question.questionRef === 'FQ1')!;
    expect(fq1.direction).toBe('reverse');
    expect(answerSignal(fq1, SCALE, { FQ1: 'almost_always' })).toBe(0);
    expect(answerSignal(fq1, SCALE, { FQ1: 'never' })).toBe(4);
  });
});

describe('section percentages', () => {
  it('is points earned over points possible for the questions she was shown', () => {
    const answers = answerAll('none_apply', 'sometimes');
    const result = scoreSection({
      ...BASE,
      answers,
      sectionKey: 'fuel_quality',
      routingOptionKey: 'none_apply',
    });
    // Sometimes is two either way, so every question scores half.
    expect(result.percent).toBe(50);
    expect(result.answeredCount).toBe(10);
  });

  it('an unanswered question is in neither side of the fraction', () => {
    const result = scoreSection({
      ...BASE,
      answers: { FQ4: 'almost_always' },
      sectionKey: 'fuel_quality',
      routingOptionKey: null,
    });
    expect(result.points).toBe(4);
    expect(result.possible).toBe(4);
    expect(result.percent).toBe(100);
    expect(result.answeredCount).toBe(1);
  });

  it('a section with nothing to divide by reports zero rather than throwing', () => {
    const result = scoreSection({
      ...BASE,
      answers: {},
      sectionKey: 'fuel_quality',
      routingOptionKey: null,
    });
    expect(result).toMatchObject({ points: 0, possible: 0, percent: 0, answeredCount: 0 });
  });

  it('the band is chosen from the SAME rounded number every surface prints', () => {
    // 24 is Quiet and 25 is Showing Up, which is the boundary a rounding
    // difference would fall across.
    expect(bandForPercent(BANDS, 24).bandKey).toBe('quiet');
    expect(bandForPercent(BANDS, 25).bandKey).toBe('showing_up');
    expect(bandForPercent(BANDS, 49).bandKey).toBe('showing_up');
    expect(bandForPercent(BANDS, 50).bandKey).toBe('speaking_loudly');
    expect(bandForPercent(BANDS, 74).bandKey).toBe('speaking_loudly');
    expect(bandForPercent(BANDS, 75).bandKey).toBe('asking_for_priority');
    expect(bandForPercent(BANDS, 100).bandKey).toBe('asking_for_priority');
  });
});

describe('Section 8 branching', () => {
  const universal = ['HPU1', 'HPU2', 'HPU3', 'HPU4'];

  it('shows nothing from Section 8 until she has answered the routing question', () => {
    const asked = shownQuestionsInSection(
      QUESTIONS,
      'hormone_pelvic_rhythm',
      null,
      BRANCH_RULES
    );
    expect(asked).toEqual([]);
  });

  it('"I currently have menstrual cycles" shows C1, C2, C3, B1 and the universal set', () => {
    const asked = shownQuestionsInSection(
      QUESTIONS,
      'hormone_pelvic_rhythm',
      'cycles',
      BRANCH_RULES
    ).map((question) => question.questionRef);
    expect(asked.sort()).toEqual(
      ['HPC1', 'HPC2', 'HPC3', 'HPB1', ...universal].sort()
    );
  });

  it('"My cycles are changing" shows C1, C2, C3, T1, T2, B1 and the universal set', () => {
    const asked = shownQuestionsInSection(
      QUESTIONS,
      'hormone_pelvic_rhythm',
      'changing',
      BRANCH_RULES
    ).map((question) => question.questionRef);
    expect(asked.sort()).toEqual(
      ['HPC1', 'HPC2', 'HPC3', 'HPT1', 'HPT2', 'HPB1', ...universal].sort()
    );
  });

  it('"I am in perimenopause or menopause" shows T1, T2, B1 and the universal set, and nothing else', () => {
    const asked = shownQuestionsInSection(
      QUESTIONS,
      'hormone_pelvic_rhythm',
      'menopause',
      BRANCH_RULES
    ).map((question) => question.questionRef);
    expect(asked.sort()).toEqual(['HPT1', 'HPT2', 'HPB1', ...universal].sort());
    expect(asked).not.toContain('HPC1');
    expect(asked).not.toContain('HPC2');
    expect(asked).not.toContain('HPC3');
  });

  it('the three remaining answers show ONLY the universal set', () => {
    for (const optionKey of ['other_reason', 'none_apply', 'prefer_not']) {
      const asked = shownQuestionsInSection(
        QUESTIONS,
        'hormone_pelvic_rhythm',
        optionKey,
        BRANCH_RULES
      ).map((question) => question.questionRef);
      expect(asked.sort()).toEqual(universal.slice().sort());
    }
  });

  it('THE SECTION MAXIMUM MOVES WITH THE BRANCH', () => {
    const menopause = scoreSection({
      ...BASE,
      answers: answerAll('menopause', 'almost_always'),
      sectionKey: 'hormone_pelvic_rhythm',
      routingOptionKey: 'menopause',
    });
    const changing = scoreSection({
      ...BASE,
      answers: answerAll('changing', 'almost_always'),
      sectionKey: 'hormone_pelvic_rhythm',
      routingOptionKey: 'changing',
    });
    expect(menopause.possible).toBe(7 * 4);
    expect(changing.possible).toBe(10 * 4);
    // Both are at the top of the scale, so both read 100 percent. The
    // maximum moved and the READING did not, which is the whole point.
    expect(menopause.percent).toBe(100);
    expect(changing.percent).toBe(100);
  });

  it('nothing outside Section 8 depends on the routing answer', () => {
    const withRouting = shownQuestions(QUESTIONS, 'menopause', BRANCH_RULES).filter(
      (question) => question.sectionKey !== 'hormone_pelvic_rhythm'
    );
    const withoutRouting = shownQuestions(QUESTIONS, null, BRANCH_RULES);
    expect(withRouting.map((q) => q.questionRef)).toEqual(
      withoutRouting.map((q) => q.questionRef)
    );
  });
});

describe('Prefer not to answer', () => {
  it('is offered on every Section 8 question and on no other question', () => {
    for (const question of QUESTIONS) {
      expect(question.allowsPnta).toBe(question.sectionKey === 'hormone_pelvic_rhythm');
    }
  });

  it('LEAVES THE SECTION MAXIMUM, so it neither penalises nor falsely quietens her', () => {
    const answers = answerAll('menopause', 'almost_always');
    answers.HPU1 = PNTA_VALUE;
    answers.HPU2 = PNTA_VALUE;

    const result = scoreSection({
      ...BASE,
      answers,
      sectionKey: 'hormone_pelvic_rhythm',
      routingOptionKey: 'menopause',
    });
    expect(result.pntaCount).toBe(2);
    expect(result.answeredCount).toBe(5);
    expect(result.possible).toBe(5 * 4);
    expect(result.percent).toBe(100);
  });

  it('CONTRIBUTES TO NO ZONE, on either side of the fraction', () => {
    const answers = answerAll('menopause', 'never');
    const withAnswers = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers,
      routingOptionKey: 'menopause',
      zoneOrder: ZONE_ORDER,
    });

    const declined = { ...answers };
    for (const ref of ['HPU1', 'HPU2', 'HPU3', 'HPU4', 'HPT1', 'HPT2', 'HPB1']) {
      declined[ref] = PNTA_VALUE;
    }
    const withPnta = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers: declined,
      routingOptionKey: 'menopause',
      zoneOrder: ZONE_ORDER,
    });

    // Zone 2 is fed only by Section 8 and by two hydration questions, so
    // declining the whole of Section 8 has to shrink its maximum.
    const before = withAnswers.find((zone) => zone.zoneKey === 'zone_2')!;
    const after = withPnta.find((zone) => zone.zoneKey === 'zone_2')!;
    expect(after.possible).toBeLessThan(before.possible);
  });

  it('a Prefer not to answer on a question that does not offer one is not a real answer', () => {
    const fq1 = QUESTIONS.find((question) => question.questionRef === 'FQ1')!;
    expect(fq1.allowsPnta).toBe(false);
    expect(answerSignal(fq1, SCALE, { FQ1: PNTA_VALUE })).toBeNull();
  });
});

describe('the Whole-Body Signal Load', () => {
  /**
   * THE WORKED EXAMPLE FROM THE SPECIFICATION, VERBATIM.
   *
   * Sections at 29, 61, 83, 42, 38, 88, 72, 54 and 69 must produce a Load
   * of 65, with components A 59.6, B 66.7 and C 81.0.
   */
  it('produces 65 for the approved worked example, with its three components', () => {
    const percentages = [29, 61, 83, 42, 38, 88, 72, 54, 69];
    const sections = percentages.map((percent, index) => ({
      sectionKey: `s${index}`,
      points: percent,
      possible: 100,
      percent,
      bandKey: bandForPercent(BANDS, percent).bandKey,
      answeredCount: 10,
      pntaCount: 0,
    }));

    const load = buildSignalLoad({
      sections,
      weightA: SETTINGS.weightA,
      weightB: SETTINGS.weightB,
      weightC: SETTINGS.weightC,
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
      topComponentCount: SETTINGS.topComponentCount,
    });

    expect(load.componentA).toBe(59.6);
    expect(load.componentB).toBe(66.7);
    expect(load.componentC).toBe(81);
    expect(load.value).toBe(65);
  });

  it('uses the stored weights, not literals', () => {
    expect(SETTINGS.weightA).toBe(0.6);
    expect(SETTINGS.weightB).toBe(0.25);
    expect(SETTINGS.weightC).toBe(0.15);
    expect(SETTINGS.weightA + SETTINGS.weightB + SETTINGS.weightC).toBeCloseTo(1, 10);
  });

  it('leaves a section nobody answered out of all three components', () => {
    const answered = { sectionKey: 'a', points: 40, possible: 40, percent: 100, bandKey: 'asking_for_priority', answeredCount: 10, pntaCount: 0 };
    const unanswered = { sectionKey: 'b', points: 0, possible: 0, percent: 0, bandKey: 'quiet', answeredCount: 0, pntaCount: 0 };
    const load = buildSignalLoad({
      sections: [answered, unanswered],
      weightA: 0.6,
      weightB: 0.25,
      weightC: 0.15,
      elevatedMinPercent: 50,
      topComponentCount: 3,
    });
    expect(load.componentA).toBe(100);
    expect(load.componentB).toBe(100);
    expect(load.value).toBe(100);
  });

  it('a sitting with nothing scorable is nought rather than a division by zero', () => {
    const load = buildSignalLoad({
      sections: [],
      weightA: 0.6,
      weightB: 0.25,
      weightC: 0.15,
      elevatedMinPercent: 50,
      topComponentCount: 3,
    });
    expect(load).toEqual({ value: 0, componentA: 0, componentB: 0, componentC: 0 });
  });
});

describe('the Zone rollup', () => {
  it('is built from ANSWERS, never from section percentages', () => {
    // One answered question, at the top of the scale, tagged Zone 1 with a
    // Zone 3 secondary. Its Zone 1 reading is 100 and its Zone 3 reading is
    // 100 too, because both sides of each fraction carry the same weight.
    const df2 = QUESTIONS.find((question) => question.questionRef === 'DF2')!;
    expect(df2.primaryZoneKey).toBe('zone_1');
    expect(df2.secondaryZoneKey).toBe('zone_3');

    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers: { DF2: 'almost_always' },
      routingOptionKey: null,
      zoneOrder: ZONE_ORDER,
    });
    expect(zones.map((zone) => zone.zoneKey).sort()).toEqual(['zone_1', 'zone_3']);
    expect(zones.find((zone) => zone.zoneKey === 'zone_1')).toMatchObject({
      points: 4 * PRIMARY_ZONE_WEIGHT,
      possible: 4 * PRIMARY_ZONE_WEIGHT,
      percent: 100,
    });
    expect(zones.find((zone) => zone.zoneKey === 'zone_3')).toMatchObject({
      points: 4 * SECONDARY_ZONE_WEIGHT,
      possible: 4 * SECONDARY_ZONE_WEIGHT,
      percent: 100,
    });
  });

  it('a secondary tag contributes exactly half of what a primary tag contributes', () => {
    expect(PRIMARY_ZONE_WEIGHT).toBe(1);
    expect(SECONDARY_ZONE_WEIGHT).toBe(0.5);

    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      // FR7 is Zone 3 primary and Zone 6 secondary. Answering it alone
      // gives Zone 6 half the points and half the maximum of Zone 3.
      answers: { FR7: 'often' },
      routingOptionKey: null,
      zoneOrder: ZONE_ORDER,
    });
    const three = zones.find((zone) => zone.zoneKey === 'zone_3')!;
    const six = zones.find((zone) => zone.zoneKey === 'zone_6')!;
    expect(six.points).toBe(three.points / 2);
    expect(six.possible).toBe(three.possible / 2);
  });

  it('IS NORMALISED, so a Zone fed by four questions and one fed by forty read on one scale', () => {
    const answers = answerAll('changing', 'sometimes');
    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers,
      routingOptionKey: 'changing',
      zoneOrder: ZONE_ORDER,
    });
    // Every answer is Sometimes, which is two out of four either way, so
    // every Zone reads fifty whatever it is fed by.
    expect(zones.length).toBe(6);
    for (const zone of zones) expect(zone.percent).toBe(50);
  });

  it('a Zone no answered question touches is left out rather than reported at nought', () => {
    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers: { FQ1: 'never' },
      routingOptionKey: null,
      zoneOrder: ZONE_ORDER,
    });
    expect(zones.map((zone) => zone.zoneKey)).toEqual(['zone_3']);
  });
});

describe('the primary and secondary Zone patterns', () => {
  function resultsWith(zones: { zoneKey: string; percent: number }[]) {
    return {
      routingOptionKey: 'none_apply',
      sections: [],
      zones: zones.map((zone) => ({ ...zone, points: zone.percent, possible: 100 })),
      load: { value: 0, componentA: 0, componentB: 0, componentC: 0 },
    };
  }

  it('names the highest Zone as primary', () => {
    const { primary } = zonePatterns(
      resultsWith([
        { zoneKey: 'zone_3', percent: 70 },
        { zoneKey: 'zone_1', percent: 40 },
      ]),
      SETTINGS
    );
    expect(primary?.zoneKey).toBe('zone_3');
  });

  it('SHOWS the second when it is at least 25 absolute AND at least 60 percent of the primary', () => {
    const { secondary } = zonePatterns(
      resultsWith([
        { zoneKey: 'zone_3', percent: 70 },
        { zoneKey: 'zone_1', percent: 42 },
      ]),
      SETTINGS
    );
    expect(secondary?.zoneKey).toBe('zone_1');
  });

  it('SUPPRESSES the second when it clears the share but not the absolute floor', () => {
    const { secondary } = zonePatterns(
      resultsWith([
        { zoneKey: 'zone_3', percent: 30 },
        { zoneKey: 'zone_1', percent: 24 },
      ]),
      SETTINGS
    );
    expect(secondary).toBeNull();
  });

  it('SUPPRESSES the second when it clears the absolute floor but not the share', () => {
    const { secondary } = zonePatterns(
      resultsWith([
        { zoneKey: 'zone_3', percent: 90 },
        { zoneKey: 'zone_1', percent: 26 },
      ]),
      SETTINGS
    );
    expect(secondary).toBeNull();
  });

  it('names no Zone at all when nothing is showing up', () => {
    const { primary, secondary } = zonePatterns(
      resultsWith([{ zoneKey: 'zone_3', percent: 0 }]),
      SETTINGS
    );
    expect(primary).toBeNull();
    expect(secondary).toBeNull();
  });
});

describe('the whole reading', () => {
  it('builds sections loudest first, ties broken by the section order', () => {
    const results = buildResults({
      ...BASE,
      zoneOrder: ZONE_ORDER,
      answers: answerAll('cycles', 'sometimes'),
      routingOptionKey: 'cycles',
      settings: SETTINGS,
    });
    expect(results.sections.length).toBe(9);
    for (let i = 1; i < results.sections.length; i += 1) {
      expect(results.sections[i - 1]!.percent).toBeGreaterThanOrEqual(results.sections[i]!.percent);
    }
    // All nine tie at fifty, so the order is the sections' own.
    expect(results.sections.map((s) => s.sectionKey)).toEqual(
      SECTIONS.slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.sectionKey)
    );
  });

  it('stores the routing answer alongside the reading it decided', () => {
    const results = buildResults({
      ...BASE,
      zoneOrder: ZONE_ORDER,
      answers: answerAll('menopause', 'often'),
      routingOptionKey: 'menopause',
      settings: SETTINGS,
    });
    expect(results.routingOptionKey).toBe('menopause');
  });

  it('recommends at most two priorities, and none at all when nothing is showing up', () => {
    const loud = buildResults({
      ...BASE,
      zoneOrder: ZONE_ORDER,
      answers: answerAll('none_apply', 'almost_always'),
      routingOptionKey: 'none_apply',
      settings: SETTINGS,
    });
    expect(recommendedPriorities(loud, SETTINGS).length).toBe(2);

    // Every direct question at Never and every reverse question at Almost
    // Always is a member with nothing showing up anywhere.
    const quietAnswers: Record<string, string> = {};
    for (const question of shownQuestions(QUESTIONS, 'none_apply', BRANCH_RULES)) {
      quietAnswers[question.questionRef] =
        question.direction === 'reverse' ? 'almost_always' : 'never';
    }
    const quiet = buildResults({
      ...BASE,
      zoneOrder: ZONE_ORDER,
      answers: quietAnswers,
      routingOptionKey: 'none_apply',
      settings: SETTINGS,
    });
    expect(quiet.sections.every((section) => section.percent === 0)).toBe(true);
    expect(recommendedPriorities(quiet, SETTINGS)).toEqual([]);
  });

  it('the section results and the Signal Load are built from ONE pass over one set of answers', () => {
    const answers = answerAll('changing', 'often');
    const results = buildResults({
      ...BASE,
      zoneOrder: ZONE_ORDER,
      answers,
      routingOptionKey: 'changing',
      settings: SETTINGS,
    });
    const rebuilt = buildSignalLoad({
      sections: buildSectionResults({
        ...BASE,
        answers,
        routingOptionKey: 'changing',
      }),
      weightA: SETTINGS.weightA,
      weightB: SETTINGS.weightB,
      weightC: SETTINGS.weightC,
      elevatedMinPercent: SETTINGS.elevatedMinPercent,
      topComponentCount: SETTINGS.topComponentCount,
    });
    expect(results.load).toEqual(rebuilt);
  });
});
