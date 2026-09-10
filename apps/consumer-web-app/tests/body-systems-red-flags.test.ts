/**
 * A red flag never touches a score, in either direction.
 *
 * PROVED BY IDENTITY, NOT BY INSPECTION. The whole scored reading is built
 * twice from the identical answers, once with every red flag answered Yes
 * and once with every one answered No, and the two are compared field by
 * field. Nothing about a percentage, a band, an order, an association, a
 * pattern or a Root Map row is allowed to differ.
 *
 * AND BY ABSENCE. The scoring module takes no argument a red flag could
 * arrive through, and this asserts that too, because an identity test only
 * proves today's code and the absence of the wire proves tomorrow's.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BANDS,
  LIBRARY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SECTIONS,
  answerAllFlags,
} from './body-systems-fixture';
import { buildResults } from '../lib/body-systems/scoring';
import { buildCoachReadingView } from '../lib/body-systems/coachView';
import { buildMemberResultsView } from '../lib/body-systems/memberView';
import { buildBodySystemsRegistryDrafts } from '../lib/body-systems/rootMap';
import { firedRedFlags, safetyResponseFor } from '../lib/body-systems/redFlags';

/** A varied, realistic sheet rather than one value everywhere. */
function variedAnswers(): Record<string, string> {
  const values = ['never', 'rarely', 'sometimes', 'often', 'almost_always'];
  const out: Record<string, string> = {};
  let i = 0;
  for (const question of QUESTIONS) {
    if (question.branch === 'b') continue;
    out[question.questionRef] = values[i % values.length]!;
    i += 1;
  }
  // One Does not apply to me, so the DNA path is inside the comparison too.
  out.L2 = 'dna';
  return out;
}

function readingFor(redFlagAnswers: Record<string, boolean>) {
  const answers = variedAnswers();
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    branch: 'a',
  });
  return {
    results,
    member: buildMemberResultsView({
      sections: SECTIONS,
      bands: BANDS,
      results,
      previousResults: null,
      minDeltaPercent: 1,
    }),
    coach: buildCoachReadingView({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      redFlags: RED_FLAGS,
      safetyLevels: SAFETY_LEVELS,
      library: LIBRARY,
      answers,
      redFlagAnswers,
      results,
      branch: 'a',
      previous: null,
      minDeltaPercent: 1,
    }),
    registry: buildBodySystemsRegistryDrafts({
      sections: SECTIONS,
      bands: BANDS,
      results,
      sessionId: 'fixed-session-id',
      recordedAt: '2026-09-10T00:00:00.000Z',
    }),
  };
}

describe('red flags never touch scoring', () => {
  const allYes = readingFor(answerAllFlags(true));
  const allNo = readingFor(answerAllFlags(false));

  it('produces identical section percentages, bands and order', () => {
    expect(allYes.results).toEqual(allNo.results);
  });

  it('produces an identical member results screen', () => {
    expect(allYes.member).toEqual(allNo.member);
  });

  it('produces identical Root Map rows, severities included', () => {
    expect(allYes.registry).toEqual(allNo.registry);
  });

  it('produces an identical coach reading everywhere except the pinned flags', () => {
    expect(allYes.coach.sections).toEqual(allNo.coach.sections);
    expect(allYes.coach.patterns).toEqual(allNo.coach.patterns);
    expect(allYes.coach.associations).toEqual(allNo.coach.associations);
    expect(allYes.coach.opener).toEqual(allNo.coach.opener);
  });

  it('does differ in the one place it is supposed to', () => {
    expect(allYes.coach.redFlags.value).toHaveLength(6);
    expect(allNo.coach.redFlags.value).toHaveLength(0);
  });

  it('is non vacuous: this fixture really does produce a scored reading', () => {
    // If the fixture scored nothing, the identity above would pass for the
    // wrong reason. It has to have real, varied, non zero content.
    expect(allNo.results.sections).toHaveLength(11);
    expect(allNo.results.sections.some((section) => section.percent > 0)).toBe(true);
    expect(allNo.coach.associations.value.length).toBeGreaterThan(0);
  });
});

describe('the scoring module cannot be reached by a red flag', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../lib/body-systems/scoring.ts'),
    'utf8'
  );

  it('imports nothing from the red flag module', () => {
    expect(source).not.toMatch(/from '\.\/redFlags'/);
  });

  it('names no red flag concept in any of its signatures', () => {
    // Comments are what this file uses to explain the rule, so only the
    // code is checked: no parameter, field or identifier may be about them.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/redFlag/i);
  });
});

describe('a Yes answers itself', () => {
  it('resolves the matching response for each level with no approval step', () => {
    const fired = firedRedFlags(RED_FLAGS, SAFETY_LEVELS, {
      chest_pain: true,
      blood_in_stool: true,
    });
    expect(fired.map((flag) => flag.level)).toEqual([1, 2]);
    expect(fired[0]!.memberResponse).toBe(safetyResponseFor(SAFETY_LEVELS, 1)?.memberResponse);
    expect(fired[1]!.memberResponse).toBe(safetyResponseFor(SAFETY_LEVELS, 2)?.memberResponse);
    expect(fired[0]!.levelLabel).toBe('Urgent evaluation');
    expect(fired[1]!.levelLabel).toBe('Medical follow-up');
  });

  it('reads anything that is not a literal true as No', () => {
    const fired = firedRedFlags(RED_FLAGS, SAFETY_LEVELS, {
      chest_pain: false,
    } as Record<string, boolean>);
    expect(fired).toEqual([]);
  });
});
