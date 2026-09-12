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
  optionForQuestion,
  optionsForQuestion,
  questionMaxPoints,
  sanitizeStoredAnswers,
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
  answerAllLoud,
  BANDS,
  BINARY_SCALE,
  FREQUENCY_SCALE,
  loudestValueFor,
  quietestValueFor,
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

function questionFor(ref: string) {
  return QUESTIONS.find((question) => question.questionRef === ref)!;
}

describe('response conversion', () => {
  it('converts Never through Almost Always to 0, 1, 2, 3, 4 on a direct question', () => {
    expect(FREQUENCY_SCALE.map((option) => option.directPoints)).toEqual([0, 1, 2, 3, 4]);
  });

  it('converts the same five to 4, 3, 2, 1, 0 on a reverse question', () => {
    expect(FREQUENCY_SCALE.map((option) => option.reversePoints)).toEqual([4, 3, 2, 1, 0]);
  });

  it('reads the direction off the question, so one tap scores two ways', () => {
    const never = optionFor('never');
    expect(signalPoints(never, 'direct')).toBe(0);
    expect(signalPoints(never, 'reverse')).toBe(4);
  });

  it('THE MEMBER SEES NO DIFFERENCE: the five labels are one list, with no direction on them', () => {
    expect(FREQUENCY_SCALE.map((option) => option.label)).toEqual([
      'Never',
      'Rarely',
      'Sometimes',
      'Often',
      'Almost Always',
    ]);
  });

  it('takes the top of the scale from the scale rather than assuming four', () => {
    expect(maxSignalPoints(FREQUENCY_SCALE)).toBe(4);
    expect(maxSignalPoints(BINARY_SCALE)).toBe(3);
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

/**
 * THE SECOND SCALE, AND WHAT MIXING THEM DOES TO A SECTION.
 *
 * Gut Environment holds six frequency questions and four binary ones, so
 * it is out of thirty six rather than out of forty. Everything here is
 * arithmetic over the content the migrations genuinely seed.
 */
describe('mixed scales', () => {
  function questionFor(ref: string) {
    return QUESTIONS.find((question) => question.questionRef === ref)!;
  }

  it('offers a binary question exactly Yes, No and Not sure, and nothing from the other scale', () => {
    const options = optionsForQuestion(SCALE, questionFor('GE1'));
    expect(options.map((option) => option.label)).toEqual(['Yes', 'No', 'Not sure']);
    expect(options.some((option) => option.valueKey === 'often')).toBe(false);
  });

  it('offers a frequency question its own five, and nothing from the binary one', () => {
    const options = optionsForQuestion(SCALE, questionFor('GE3'));
    expect(options.length).toBe(5);
    expect(options.some((option) => option.valueKey === 'yes')).toBe(false);
  });

  it('scores Yes as three on a direct binary question and Not sure as one', () => {
    const ge1 = questionFor('GE1');
    expect(answerSignal(ge1, SCALE, { GE1: 'yes' })).toBe(3);
    expect(answerSignal(ge1, SCALE, { GE1: 'no' })).toBe(0);
    expect(answerSignal(ge1, SCALE, { GE1: 'not_sure' })).toBe(1);
  });

  it('READS THE REVERSE FLAG ON A BINARY QUESTION TOO, from the stored column', () => {
    // No binary question in the bank is reverse scored today. The rule is
    // the scale's, not the question's, so this asserts it on the option
    // rows themselves: a coach who marks one reverse gets Yes at nought
    // and No at three without a deploy.
    const yes = BINARY_SCALE.find((option) => option.valueKey === 'yes')!;
    const no = BINARY_SCALE.find((option) => option.valueKey === 'no')!;
    const notSure = BINARY_SCALE.find((option) => option.valueKey === 'not_sure')!;
    expect(signalPoints(yes, 'reverse')).toBe(0);
    expect(signalPoints(no, 'reverse')).toBe(3);
    expect(signalPoints(notSure, 'reverse')).toBe(1);
  });

  it('caps a binary question at three and a frequency one at four', () => {
    expect(questionMaxPoints(SCALE, questionFor('GE1'))).toBe(3);
    expect(questionMaxPoints(SCALE, questionFor('GE3'))).toBe(4);
  });

  it('SUMS A SECTION MAXIMUM PER QUESTION: six at four plus four at three is thirty six', () => {
    const answers = answerAllLoud(null);
    const result = scoreSection({
      ...BASE,
      answers,
      sectionKey: 'gut_environment',
      routingOptionKey: null,
    });
    expect(result.answeredCount).toBe(10);
    expect(result.possible).toBe(6 * 4 + 4 * 3);
    expect(result.points).toBe(6 * 4 + 4 * 3);
    expect(result.percent).toBe(100);
  });

  it('keeps a mixed section on the same nought to a hundred scale as an unmixed one', () => {
    // Every question at the quiet end of its own scale is nought in both.
    const quiet: Record<string, string> = {};
    for (const question of shownQuestions(QUESTIONS, null, BRANCH_RULES)) {
      quiet[question.questionRef] = question.direction === 'reverse'
        ? loudestValueFor({ ...question, direction: 'direct' })
        : quietestValueFor(question);
    }
    const gut = scoreSection({ ...BASE, answers: quiet, sectionKey: 'gut_environment', routingOptionKey: null });
    const fuel = scoreSection({ ...BASE, answers: quiet, sectionKey: 'fuel_quality', routingOptionKey: null });
    expect(gut.percent).toBe(0);
    expect(fuel.percent).toBe(0);
  });

  it('places a mixed section between two unmixed ones rather than above or below both', () => {
    // Yes on the four binary questions and Often on the six frequency
    // ones: 4 x 3 + 6 x 3 = 30 out of 36, which is 83 percent. The same
    // Often everywhere else is 75 percent. The binary questions really are
    // louder, because Yes IS the top of its scale, and the section is
    // still read on one comparable number.
    const answers = answerAll(null, 'often');
    const gut = scoreSection({ ...BASE, answers, sectionKey: 'gut_environment', routingOptionKey: null });
    expect(gut.possible).toBe(36);
    expect(gut.points).toBe(30);
    expect(gut.percent).toBe(83);

    // And the same section on the frequency scale alone would have been
    // out of forty, which is the number this change corrects.
    expect(
      shownQuestionsInSection(QUESTIONS, 'gut_environment', null, BRANCH_RULES).length * 4
    ).toBe(40);
  });

  it('a Not sure on every binary question is a quiet section rather than a middling one', () => {
    const answers: Record<string, string> = {};
    for (const question of shownQuestions(QUESTIONS, null, BRANCH_RULES)) {
      if (question.sectionKey !== 'gut_environment') continue;
      answers[question.questionRef] = question.scaleKey === 'binary' ? 'not_sure' : 'never';
    }
    const gut = scoreSection({ ...BASE, answers, sectionKey: 'gut_environment', routingOptionKey: null });
    // Four Not sures at one point each, out of thirty six.
    expect(gut.points).toBe(4);
    expect(gut.possible).toBe(36);
    expect(gut.percent).toBe(11);
  });

  /**
   * A SITTING THAT WAS PART ANSWERED BEFORE A QUESTION CHANGED SCALE.
   *
   * Her stored "Often" on GE1 is not an answer to a Yes / No question, and
   * this is what happens to it: it is in neither side of the fraction, it
   * contributes to no Zone, and nothing throws.
   */
  describe('an answer from the other scale', () => {
    it('is treated as unanswered rather than scored', () => {
      const ge1 = questionFor('GE1');
      expect(answerSignal(ge1, SCALE, { GE1: 'often' })).toBeNull();
      expect(optionForQuestion(SCALE, ge1, 'often')).toBeNull();
    });

    it('leaves both sides of the section fraction', () => {
      const result = scoreSection({
        ...BASE,
        answers: { GE1: 'often', GE3: 'almost_always' },
        sectionKey: 'gut_environment',
        routingOptionKey: null,
      });
      expect(result.answeredCount).toBe(1);
      expect(result.possible).toBe(4);
      expect(result.points).toBe(4);
      expect(result.percent).toBe(100);
    });

    it('contributes to no Zone, on either side', () => {
      const zones = buildZoneResults({
        questions: QUESTIONS,
        scale: SCALE,
        branchRules: BRANCH_RULES,
        answers: { GE1: 'often' },
        routingOptionKey: null,
        zoneOrder: ZONE_ORDER,
      });
      expect(zones).toEqual([]);
    });

    it('is dropped on the way back into the screen, so she is asked that question again', () => {
      const cleaned = sanitizeStoredAnswers(QUESTIONS, SCALE, {
        GE1: 'often',
        GE3: 'often',
        HPU1: 'pnta',
        FQ1: 'pnta',
        NOT_A_QUESTION: 'often',
      });
      expect(cleaned).toEqual({
        GE3: 'often',
        // Section 8 offers Prefer not to answer, Section 1 does not.
        HPU1: 'pnta',
      });
    });

    it('builds a whole reading from a part answered sitting without throwing', () => {
      const answers = { ...answerAll(null, 'often'), GE1: 'often', GE2: 'sometimes' };
      const results = buildResults({
        ...BASE,
        zoneOrder: ZONE_ORDER,
        answers,
        routingOptionKey: null,
        settings: SETTINGS,
      });
      const gut = results.sections.find((section) => section.sectionKey === 'gut_environment')!;
      // Eight of the ten counted: six frequency at four, two binary at three.
      expect(gut.answeredCount).toBe(8);
      expect(gut.possible).toBe(6 * 4 + 2 * 3);
      expect(Number.isFinite(results.load.value)).toBe(true);
    });
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
    // Every question answered at the top of ITS OWN scale, which is Almost
    // Always on a direct frequency question, Never on a reverse one and
    // Yes on a binary one. Every Zone then reads a hundred whatever it is
    // fed by and whatever scales its questions are answered on.
    const answers = answerAllLoud('changing');
    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers,
      routingOptionKey: 'changing',
      zoneOrder: ZONE_ORDER,
    });
    expect(zones.length).toBe(6);
    for (const zone of zones) expect(zone.percent).toBe(100);
  });

  it('MIXES SCALES WITHOUT DISTORTING A ZONE: three of three reads the same as four of four', () => {
    // GE1 is binary and DF2 is frequency, and both are Zone 1 primary. At
    // the top of their own scales each reads a hundred, and the two
    // together still read a hundred rather than 3 and 4 over 8.
    const binary = questionFor('GE1');
    const frequency = questionFor('DF2');
    expect(binary.scaleKey).toBe('binary');
    expect(frequency.scaleKey).toBe('frequency');

    const zones = buildZoneResults({
      questions: QUESTIONS,
      scale: SCALE,
      branchRules: BRANCH_RULES,
      answers: { GE1: 'yes', DF2: 'almost_always' },
      routingOptionKey: null,
      zoneOrder: ZONE_ORDER,
    });
    const zoneOne = zones.find((zone) => zone.zoneKey === 'zone_1')!;
    expect(zoneOne.points).toBe(7);
    expect(zoneOne.possible).toBe(7);
    expect(zoneOne.percent).toBe(100);
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
      // At the top of every question's own scale, which is the one answer
      // set that ties all nine sections whatever scales they hold.
      answers: answerAllLoud('cycles'),
      routingOptionKey: 'cycles',
      settings: SETTINGS,
    });
    expect(results.sections.length).toBe(9);
    for (let i = 1; i < results.sections.length; i += 1) {
      expect(results.sections[i - 1]!.percent).toBeGreaterThanOrEqual(results.sections[i]!.percent);
    }
    // All nine tie at a hundred, so the order is the sections' own.
    expect(results.sections.every((section) => section.percent === 100)).toBe(true);
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
