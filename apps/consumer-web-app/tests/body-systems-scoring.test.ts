/**
 * The arithmetic, the bands, the Does not apply to me rule, and the two
 * places a number could quietly become two numbers.
 */

import { describe, it, expect } from 'vitest';
import {
  BANDS,
  LIBRARY,
  QUESTIONS,
  SCALE,
  SECTIONS,
  answerAll,
} from './body-systems-fixture';
import {
  bandForPercent,
  buildResults,
  loudestSection,
  maxPoints,
  questionsInSection,
  scoreSection,
} from '../lib/body-systems/scoring';
import { buildMemberResultsView } from '../lib/body-systems/memberView';
import { buildCoachReadingView } from '../lib/body-systems/coachView';

const base = { sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS };

describe('one section', () => {
  it('is points earned over points possible, as a whole percent', () => {
    // Digestion, ten questions, all answered Sometimes (3 of a possible 8).
    const answers = Object.fromEntries(
      questionsInSection(QUESTIONS, 'digestion', 'a').map((q) => [q.questionRef, 'sometimes'])
    );
    const result = scoreSection({ ...base, answers, sectionKey: 'digestion', branch: 'a' });
    expect(result.points).toBe(30);
    expect(result.possible).toBe(80);
    expect(result.percent).toBe(38);
    expect(result.answeredCount).toBe(10);
  });

  it('gives Never a real zero and Almost always a real hundred', () => {
    const refs = questionsInSection(QUESTIONS, 'digestion', 'a').map((q) => q.questionRef);
    const never = Object.fromEntries(refs.map((ref) => [ref, 'never']));
    const always = Object.fromEntries(refs.map((ref) => [ref, 'almost_always']));
    expect(scoreSection({ ...base, answers: never, sectionKey: 'digestion', branch: 'a' }).percent).toBe(0);
    expect(scoreSection({ ...base, answers: always, sectionKey: 'digestion', branch: 'a' }).percent).toBe(100);
  });

  it('leaves a Does not apply to me answer out of BOTH sides of the fraction', () => {
    // Liver, nine questions. L2 is the one that can be skipped.
    const refs = questionsInSection(QUESTIONS, 'liver', 'a').map((q) => q.questionRef);
    const all = Object.fromEntries(refs.map((ref) => [ref, 'often']));
    const withDna = { ...all, L2: 'dna' };

    const scoredAll = scoreSection({ ...base, answers: all, sectionKey: 'liver', branch: 'a' });
    const scoredDna = scoreSection({ ...base, answers: withDna, sectionKey: 'liver', branch: 'a' });

    // Eight questions instead of nine, in both the numerator and the
    // denominator, so the percentage is unchanged. That is the whole point:
    // she is neither penalised nor falsely greened.
    expect(scoredAll.percent).toBe(75);
    expect(scoredDna.percent).toBe(75);
    expect(scoredDna.answeredCount).toBe(8);
    expect(scoredDna.dnaCount).toBe(1);
    expect(scoredDna.possible).toBe(scoredAll.possible - maxPoints(SCALE));
  });

  it('reports a section she skipped entirely as zero, with a denominator that says so', () => {
    const answers = { L2: 'dna' };
    const result = scoreSection({ ...base, answers, sectionKey: 'liver', branch: 'a' });
    expect(result.percent).toBe(0);
    expect(result.possible).toBe(0);
    expect(result.answeredCount).toBe(0);
  });
});

describe('the three bands', () => {
  it.each([
    [0, 'quiet'],
    [14, 'quiet'],
    [15, 'showing_up'],
    [34, 'showing_up'],
    [35, 'speaking_loudly'],
    [100, 'speaking_loudly'],
  ])('%i%% is %s', (percent, expected) => {
    expect(bandForPercent(BANDS, percent).bandKey).toBe(expected);
  });

  it('picks the band from the same rounded number every screen prints', () => {
    // A section landing on 14.6% displays 15% if it were rounded at render
    // time, and 14.6 would fall in Quiet if the band were picked from the
    // raw value. Picking both from one rounded number is what stops a
    // coach reading 15% beside the word Quiet.
    const refs = questionsInSection(QUESTIONS, 'kidney', 'a').map((q) => q.questionRef);
    // Eight questions, 64 possible. 9 points is 14.0625%, which rounds to 14.
    const answers: Record<string, string> = Object.fromEntries(refs.map((ref) => [ref, 'never']));
    answers[refs[0]!] = 'almost_always';
    answers[refs[1]!] = 'rarely';
    const result = scoreSection({ ...base, answers, sectionKey: 'kidney', branch: 'a' });
    expect(result.points).toBe(9);
    expect(result.possible).toBe(64);
    expect(result.percent).toBe(14);
    expect(bandForPercent(BANDS, result.percent).bandKey).toBe('quiet');
  });
});

describe('the whole reading', () => {
  it('orders loudest first, and breaks a tie by the section order she saw', () => {
    const answers = answerAll('a', 'sometimes');
    const results = buildResults({ ...base, answers, branch: 'a' });
    // Every section is on the same percentage, so the order must be the
    // survey's own.
    expect(new Set(results.sections.map((s) => s.percent)).size).toBe(1);
    expect(results.sections.map((s) => s.sectionKey)).toEqual(
      SECTIONS.slice().sort((a, b) => a.position - b.position).map((s) => s.sectionKey)
    );
  });

  it('asks the branch she chose and only that branch', () => {
    const a = buildResults({ ...base, answers: answerAll('a', 'often'), branch: 'a' });
    const b = buildResults({ ...base, answers: answerAll('b', 'often'), branch: 'b' });
    const hormonalA = a.sections.find((s) => s.sectionKey === 'hormonal');
    const hormonalB = b.sections.find((s) => s.sectionKey === 'hormonal');
    expect(hormonalA?.answeredCount).toBe(10);
    expect(hormonalB?.answeredCount).toBe(8);
  });

  it('adds nothing together, anywhere', () => {
    const results = buildResults({ ...base, answers: answerAll('a', 'often'), branch: 'a' });
    // There is no total field, no overall percent, and no grade. The shape
    // itself is the guarantee.
    expect(Object.keys(results).sort()).toEqual(['branch', 'sections']);
  });
});

describe('the top attention card', () => {
  it('names the loudest section when there is one', () => {
    const answers = answerAll('a', 'never');
    answers.D1 = 'almost_always';
    const results = buildResults({ ...base, answers, branch: 'a' });
    expect(loudestSection(results)?.sectionKey).toBe('digestion');

    const view = buildMemberResultsView({
      sections: SECTIONS,
      bands: BANDS,
      results,
      previousResults: null,
      minDeltaPercent: 1,
    });
    expect(view.topAttentionLine).toBe(
      'Right now, the loudest signals in your body are about how it handles food.'
    );
  });

  it('names nothing when nothing is showing up at all', () => {
    // Eleven sections tied at nought is eleven ties, not a loudest one, and
    // naming one would be Root claiming something untrue about her.
    const results = buildResults({ ...base, answers: answerAll('a', 'never'), branch: 'a' });
    expect(loudestSection(results)).toBeNull();
    const view = buildMemberResultsView({
      sections: SECTIONS,
      bands: BANDS,
      results,
      previousResults: null,
      minDeltaPercent: 1,
    });
    expect(view.topAttentionLine).toBeNull();
  });
});

describe('the coverage honesty rule', () => {
  it('marks a Speaking loudly section with no library match, and only that section', () => {
    // Muscles and Joints goes loud on questions no library entry reads:
    // M5, M6, M7, M9 and M10 appear in no trigger.
    const answers = answerAll('a', 'never');
    for (const ref of ['M5', 'M6', 'M7', 'M9', 'M10']) answers[ref] = 'almost_always';

    const results = buildResults({ ...base, answers, branch: 'a' });
    const muscles = results.sections.find((s) => s.sectionKey === 'muscles');
    expect(muscles?.bandKey).toBe('speaking_loudly');

    const view = buildCoachReadingView({
      ...base,
      redFlags: [],
      safetyLevels: [],
      library: LIBRARY,
      answers,
      redFlagAnswers: {},
      results,
      branch: 'a',
      previous: null,
      minDeltaPercent: 1,
    });

    const needing = view.sections.value.filter((row) => row.needsCoverageNote);
    expect(needing.map((row) => row.sectionKey)).toEqual(['muscles']);
    // And nothing was invented to fill the gap.
    expect(view.associations.value.filter((a) => a.sectionKey === 'muscles')).toEqual([]);
  });

  it('does not mark a loud section that a library entry did match', () => {
    const answers = answerAll('a', 'never');
    for (const ref of ['M1', 'M2', 'M8', 'M5', 'M6']) answers[ref] = 'almost_always';
    const results = buildResults({ ...base, answers, branch: 'a' });
    const view = buildCoachReadingView({
      ...base,
      redFlags: [],
      safetyLevels: [],
      library: LIBRARY,
      answers,
      redFlagAnswers: {},
      results,
      branch: 'a',
      previous: null,
      minDeltaPercent: 1,
    });
    const muscles = view.sections.value.find((row) => row.sectionKey === 'muscles');
    expect(muscles?.bandKey).toBe('speaking_loudly');
    expect(muscles?.needsCoverageNote).toBe(false);
    expect(view.associations.value.map((a) => a.entryCode)).toContain('M-1');
  });
});
