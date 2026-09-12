/**
 * The order of screens, derived from the stored content rather than hard
 * coded.
 *
 * ONE QUESTION PER SCREEN, and that is a deliberate exception to this
 * app's own two-to-three-per-screen standard. This instrument is a guided
 * practitioner assessment rather than a form: the question sits in the
 * upper middle of a phone, the five answers sit in thumb reach, and a
 * normal question screen never scrolls.
 *
 * EVERY SECTION OPENS WITH ITS OWN BEAT and closes with another, so the
 * shape is: intro, question, question, ..., complete, next intro. The last
 * section closes into the completion screen instead, because there is no
 * next section to name and "Next:" with nothing after it would be a
 * screen apologising for itself.
 *
 * SECTION 8 CARRIES ITS ROUTING SCREEN BETWEEN ITS INTRO AND ITS FIRST
 * QUESTION, and the list it produces depends on what she answered there.
 * That is why nothing downstream trusts a stored index on its own: her
 * position is DERIVED from her own answers (`resumeStepIndex`), so a list
 * that is four questions long today and seven tomorrow still puts her back
 * on the first thing she has not answered.
 */

import { shownQuestionsInSection } from './scoring';
import type { BranchRule, MemberQuestion, WbsAnswers } from './types';

export type OrderedSection = { sectionKey: string; position: number };

export type WbsStep =
  | { kind: 'section_intro'; sectionKey: string; sectionNumber: number; sectionCount: number }
  | { kind: 'routing'; sectionKey: string; sectionNumber: number; sectionCount: number }
  | {
      kind: 'question';
      sectionKey: string;
      sectionNumber: number;
      sectionCount: number;
      questionRef: string;
      /** One based, within this section. */
      indexInSection: number;
      countInSection: number;
    }
  | {
      kind: 'section_complete';
      sectionKey: string;
      sectionNumber: number;
      sectionCount: number;
      nextSectionKey: string;
    }
  | { kind: 'completion' };

/** Which section carries the routing question, read off the content rather than named here. */
export function routingSectionKey(questions: readonly MemberQuestion[]): string | null {
  const branched = questions.find((question) => question.branchGroup !== null);
  return branched?.sectionKey ?? null;
}

export function buildSteps(input: {
  sections: readonly OrderedSection[];
  questions: readonly MemberQuestion[];
  branchRules: readonly BranchRule[];
  routingOptionKey: string | null;
}): WbsStep[] {
  const ordered = input.sections.slice().sort((a, b) => a.position - b.position);
  const sectionCount = ordered.length;
  const routingSection = routingSectionKey(input.questions);
  const steps: WbsStep[] = [];

  ordered.forEach((section, index) => {
    const sectionNumber = index + 1;
    steps.push({ kind: 'section_intro', sectionKey: section.sectionKey, sectionNumber, sectionCount });

    if (section.sectionKey === routingSection) {
      steps.push({ kind: 'routing', sectionKey: section.sectionKey, sectionNumber, sectionCount });
    }

    const asked = shownQuestionsInSection(
      input.questions,
      section.sectionKey,
      input.routingOptionKey,
      input.branchRules
    );
    asked.forEach((question, questionIndex) => {
      steps.push({
        kind: 'question',
        sectionKey: section.sectionKey,
        sectionNumber,
        sectionCount,
        questionRef: question.questionRef,
        indexInSection: questionIndex + 1,
        countInSection: asked.length,
      });
    });

    const next = ordered[index + 1];
    if (next) {
      steps.push({
        kind: 'section_complete',
        sectionKey: section.sectionKey,
        sectionNumber,
        sectionCount,
        nextSectionKey: next.sectionKey,
      });
    }
  });

  steps.push({ kind: 'completion' });
  return steps;
}

/** The index of the completion screen. Submitting happens on the step before it. */
export function completionStepIndex(steps: readonly WbsStep[]): number {
  return Math.max(0, steps.length - 1);
}

/** A stored index, clamped into this list rather than trusted. */
export function clampStepIndex(steps: readonly WbsStep[], stored: number): number {
  if (!Number.isFinite(stored) || stored < 0) return 0;
  return Math.min(Math.floor(stored), completionStepIndex(steps));
}

/**
 * Where a member picks up, whether it is her first screen or her fourth
 * sitting.
 *
 * DERIVED FROM HER OWN ANSWERS, never from a stored index alone, because
 * Section 8's length depends on what she answered to its routing question
 * and an index stored yesterday can mean a different screen today.
 *
 * THE FIRST SCREEN SHE HAS NOT DEALT WITH, and each kind of screen has its
 * own honest test:
 *
 *   a section intro     dealt with once she has answered something in that
 *                       section. A section she has not started opens on
 *                       its own intro, which is how a member resuming at a
 *                       section boundary still gets the beat rather than
 *                       being dropped straight onto a question. It is also
 *                       what puts a brand new sitting on screen one.
 *   the routing screen  dealt with once she has answered it.
 *   a question          dealt with once she has answered it.
 *   a section beat      always skipped. It is a closing, not a task.
 *
 * If she has answered everything she lands on the completion screen, which
 * is exactly where she was when she closed the tab on the last question.
 */
export function resumeStepIndex(input: {
  steps: readonly WbsStep[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
}): number {
  const started = new Set<string>();
  for (const step of input.steps) {
    if (step.kind !== 'question') continue;
    if (input.answers[step.questionRef]) started.add(step.sectionKey);
  }

  for (const [index, step] of input.steps.entries()) {
    if (step.kind === 'section_intro' && !started.has(step.sectionKey)) return index;
    if (step.kind === 'routing' && input.routingOptionKey === null) return index;
    if (step.kind === 'question' && !input.answers[step.questionRef]) return index;
  }
  return completionStepIndex(input.steps);
}

/**
 * How many sections she has finished, for the Welcome back line.
 *
 * A section counts when every question she was shown in it has an answer.
 * Counting the ones she has merely opened would tell her she is further
 * along than she is.
 */
export function completedSectionCount(input: {
  sections: readonly OrderedSection[];
  questions: readonly MemberQuestion[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
}): number {
  let count = 0;
  for (const section of input.sections) {
    const asked = shownQuestionsInSection(
      input.questions,
      section.sectionKey,
      input.routingOptionKey,
      input.branchRules
    );
    if (asked.length === 0) continue;
    if (asked.every((question) => Boolean(input.answers[question.questionRef]))) count += 1;
  }
  return count;
}
