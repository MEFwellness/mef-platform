/**
 * The experience runtime, rendered for real.
 *
 * What is asserted here is what she can SEE and what she can LEAVE BY:
 * one question at a time, the section's own opening line where the brief
 * puts it, a Continue that is disabled with a visible reason until she
 * answers, a Close on every screen, and no Back on the first one because
 * there is nowhere behind it.
 *
 * TWO SOURCE-SHAPE ASSERTIONS, and they are deliberate rather than lazy.
 * This suite has no DOM testing library, so "press Continue four times"
 * cannot be driven here. The two properties worth holding anyway are
 * structural, and a source check holds them exactly:
 *
 *   the pending-versus-completed branch lives inside the client component,
 *   not on the page, because a Server Action re-renders the route it was
 *   called from and a branch at page level made the Weekly Reflection's
 *   closing screen flash past on production, 2026-08-28.
 *
 *   the submit action does not revalidate the route she is standing on,
 *   for the same reason.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('@/app/actions/stressLoad', () => ({
  submitStressLoadDeepDiveAction: async () => ({ ok: false, error: 'not used in this test' }),
  startStressLoadExperimentAction: async () => ({ ok: true }),
}));

const { StressLoadExperience } = await import('@/components/stress-load/StressLoadExperience');
const { STRESS_LOAD_COPY, STRESS_LOAD_SECTIONS } = await import('@/lib/stress-load/copy');
const { STRESS_LOAD_QUESTIONS } = await import('@/lib/stress-load/questions');
const { buildStressLoadReading } = await import('@/lib/stress-load/patterns');
const { fullAnswers } = await import('./stress-load-questions.test');

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

describe('the first screen', () => {
  const html = renderToStaticMarkup(<StressLoadExperience status="pending" completed={null} />);

  it('shows one question, the first one, and its position', () => {
    expect(html).toContain('Question 1 of 11');
    expect(html).toContain(STRESS_LOAD_QUESTIONS[0]!.prompt);
    // And not the second one.
    expect(html).not.toContain(STRESS_LOAD_QUESTIONS[1]!.prompt);
  });

  it("carries the section's own opening line, which is where the approved heading lives", () => {
    expect(html).toContain(escapeHtml(STRESS_LOAD_SECTIONS[0].heading));
    expect(html).toContain(STRESS_LOAD_SECTIONS[0].name);
  });

  it('disables Continue and shows the reason, rather than dying silently', () => {
    expect(html).toContain('disabled=""');
    expect(html).toContain(STRESS_LOAD_QUESTIONS[0]!.blockedReason);
  });

  it('offers a way out, and no Back, because there is nothing behind it', () => {
    expect(html).toContain(`aria-label="${STRESS_LOAD_COPY.exitLabel}"`);
    expect(html).not.toContain(`aria-label="${STRESS_LOAD_COPY.questionBack}"`);
  });

  it('shows all five load words as real choices', () => {
    for (const option of ['Light', 'Manageable', 'Full', 'Heavy', 'Crushing']) {
      expect(html).toContain(`>${option}<`);
    }
  });

  it('carries no em dash', () => {
    expect(html).not.toContain('—');
  });
});

describe('opening a sitting she has already finished', () => {
  const answers = fullAnswers();
  const completed = {
    sessionId: 'session-1',
    answers,
    interpretation: { ...buildStressLoadReading(answers), crossReference: null },
  };
  const html = renderToStaticMarkup(
    <StressLoadExperience status="completed" completed={completed} />
  );

  it('answers her rather than bouncing her', () => {
    expect(html).toContain(STRESS_LOAD_COPY.alreadyDoneHeading);
    expect(html).toContain(STRESS_LOAD_COPY.alreadyDoneBody);
  });

  it('shows the reading back, with both sides', () => {
    expect(html).toContain(STRESS_LOAD_COPY.loadSideHeading);
    expect(html).toContain(STRESS_LOAD_COPY.recoverySideHeading);
  });

  it('offers no questions at all', () => {
    expect(html).not.toContain('Question 1 of 11');
  });
});

describe('the Server Action re-render, held shut structurally', () => {
  it('the page decides nothing about pending versus completed', () => {
    const page = read('app/stress-load/page.tsx');
    expect(page).toContain('<StressLoadExperience');
    expect(page).not.toContain("state.status === 'pending' ?");
    expect(page).not.toContain("{state.status === 'completed' && <");
  });

  it('the branch is inside the client component, which survives the re-render', () => {
    const component = read('components/stress-load/StressLoadExperience.tsx');
    expect(component).toContain("if (status === 'completed' && !finished) {");
  });

  it('the submit action revalidates Home and not the route she is standing on', () => {
    const action = read('app/actions/stressLoad.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/stress-load')");
  });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
