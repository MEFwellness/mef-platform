// @vitest-environment jsdom

/**
 * The two bugs the real app found, held down.
 *
 * NEITHER WAS VISIBLE TO ANY TEST THAT READS SOURCE OR MATH. Both needed a
 * signed-in walk of the running app, which is why
 * `scripts/verify-body-systems-live.mjs` exists and why these two are
 * written as unit tests now that they are understood.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BANDS, QUESTIONS, RED_FLAGS, SAFETY_LEVELS, SCALE, SECTIONS, MEMBER_COPY } from './body-systems-fixture';

// The experience pushes to Home from its own Home button, so it needs a
// router. Same shim every other component test in this suite uses.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { BodySystemsExperience } = await import('../components/body-systems/BodySystemsExperience');
const { displayName } = await import('../lib/naming/displayNames');

const ROOT = path.resolve(__dirname, '..');

/**
 * BUG ONE. A first-time member saw ten EMPTY sections.
 *
 * The branch question is the first thing on section eleven, so a member on
 * section one has genuinely not chosen a branch yet. The question filter
 * read that not-yet-chosen branch directly and returned nothing, so every
 * one of the ten shared sections rendered with no questions on it and a
 * Continue that did nothing. Ten of the eleven sections ask everybody the
 * identical questions, so the filter now uses a render-only default and
 * section eleven still refuses to move until she has really tapped one of
 * the two.
 *
 * PROVED BY DELETING THE FIX: putting `branch` back in place of
 * `renderBranch` makes the first assertion below fail.
 */
describe('a member with no chosen branch still gets her questions', () => {
  const html = renderToStaticMarkup(
    <BodySystemsExperience
      status="in_progress"
      content={{
        sections: SECTIONS,
        questions: QUESTIONS,
        scale: SCALE,
        bands: BANDS,
        redFlags: RED_FLAGS,
        safetyLevels: SAFETY_LEVELS,
        copy: MEMBER_COPY,
        minDeltaPercent: 1,
      }}
      rememberedBranch={null}
      resumeAnswers={{}}
      resumeRedFlagAnswers={{}}
      resumeStepIndex={0}
      completedView={null}
    />
  );

  /*
    A SCREEN CARRIES TWO OR THREE QUESTIONS SINCE 2026-09-11, so the claim
    is about the FIRST SCREEN of the first section rather than about the
    whole section: the bug was that it rendered nothing at all. Every
    question in the section really being reachable is driven end to end in
    tests/questionnaire-grouping.test.tsx, which walks the screens.
  */
  const firstSectionQuestions = QUESTIONS.filter((entry) => entry.sectionKey === 'digestion');

  it('renders the first screen of the first section questions', () => {
    expect(firstSectionQuestions.length).toBeGreaterThan(3);
    for (const question of firstSectionQuestions.slice(0, 3)) {
      expect(html, `${question.questionRef} did not render`).toContain(question.prompt);
    }
  });

  it('renders the five option scale under them', () => {
    for (const option of SCALE) expect(html).toContain(option.label);
  });

  it('does not ask the branch question on section one', () => {
    expect(html).not.toContain(MEMBER_COPY['member.branch_question']);
  });

  it('does not render a Hormonal Health question for either branch', () => {
    // She has chosen nothing, so neither family may appear anywhere yet.
    for (const question of QUESTIONS.filter((entry) => entry.branch !== 'all')) {
      expect(html, `${question.questionRef} leaked`).not.toContain(question.prompt);
    }
  });
});

/**
 * BUG TWO, and it was not this feature's. The coach's client detail page
 * crashed outright for any client the Root coaching engine had put on a
 * focused investigation or a reassessment.
 *
 * `lib/root-coaching-engine/selector.ts` has written two source states
 * since the coaching engine was built, and neither had a name in
 * `lib/naming/displayNames.ts`, so displayName() threw WHILE THE PAGE WAS
 * RENDERING. The coach got the error screen and no client detail at all,
 * with nothing on it saying why.
 *
 * The test is written over the selector's own source rather than over the
 * two values, so a third source state added later is caught the same way.
 */
describe('every coaching topic source state the engine writes has a name', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'lib/root-coaching-engine/selector.ts'),
    'utf8'
  );
  const written = Array.from(source.matchAll(/sourceState:\s*'([a-z_]+)'/g)).map((m) => m[1]!);

  it('finds the source states the selector actually writes', () => {
    // Non vacuous: if the scan found nothing, everything below would pass.
    expect(written.length).toBeGreaterThan(2);
  });

  it.each(Array.from(new Set(written)))('%s has a display name', (state) => {
    expect(() => displayName('coaching_topic_source_state', state)).not.toThrow();
    expect(displayName('coaching_topic_source_state', state).length).toBeGreaterThan(0);
  });
});
