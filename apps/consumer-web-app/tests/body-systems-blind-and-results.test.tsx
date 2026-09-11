// @vitest-environment jsdom

/**
 * The three things the 2026-09-11 member experience pass promised, held
 * down: she answers blind, every screen starts at the top, and her results
 * are one graph with one legend.
 *
 * WHY EACH ONE IS WRITTEN THE WAY IT IS
 *
 *   BLIND IS PROVED AGAINST THE PAYLOAD, NOT THE PIXELS. A section name
 *   that is merely not drawn is still in the props the page serialises
 *   into the HTML, so the check is run over the whole bundle the answering
 *   component is handed as well as over every screen it renders. The page
 *   is checked too, because a component that cannot leak a name is no help
 *   if the route stops calling `blindContent`.
 *
 *   THE SCROLL IS DRIVEN, NOT DESCRIBED. The bug was that nothing
 *   unmounts between one section and the next, so the only honest test is
 *   to answer a real section, press the real Continue, and watch what the
 *   component does to the window.
 *
 *   THE LEGEND IS COUNTED. "Explain the bands once" is a claim about how
 *   many times three sentences appear, which is exactly the kind of thing
 *   a rebuild quietly reintroduces.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BANDS,
  MEMBER_COPY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SECTIONS,
} from './body-systems-fixture';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/**
 * The two Server Actions her Continue calls.
 *
 * Mocked to the shape they really return, because what is under test here
 * is what the component does AFTER a save succeeds.
 */
const saveProgress = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/app/actions/bodySystems', () => ({
  saveBodySystemsProgressAction: (...args: unknown[]) =>
    (saveProgress as unknown as (...a: unknown[]) => Promise<{ ok: true }>)(...args),
  submitBodySystemsSurveyAction: async () => ({ ok: false as const, error: 'not used here' }),
}));

const { BodySystemsExperience } = await import('../components/body-systems/BodySystemsExperience');
const { BodySystemsResults } = await import('../components/body-systems/BodySystemsResults');
const { blindContent } = await import('../lib/body-systems/contentData');
const { buildMemberResultsView } = await import('../lib/body-systems/memberView');
const { buildResults } = await import('../lib/body-systems/scoring');

const ROOT = path.resolve(__dirname, '..');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const FULL_CONTENT = {
  sections: SECTIONS,
  questions: QUESTIONS,
  scale: SCALE,
  bands: BANDS,
  redFlags: RED_FLAGS,
  safetyLevels: SAFETY_LEVELS,
  copy: MEMBER_COPY,
  minDeltaPercent: 1,
};

/** Exactly what app/body-systems/page.tsx hands the answering component. */
const ANSWERING_CONTENT = blindContent(FULL_CONTENT);

/** Every word that names a body system, from the rows themselves. */
const NAMING_TEXT: string[] = SECTIONS.flatMap((section) => [
  section.displayName,
  section.memberIntroLine,
]);

function answeringHtml(stepIndex: number): string {
  return renderToStaticMarkup(
    <BodySystemsExperience
      status="in_progress"
      content={ANSWERING_CONTENT}
      rememberedBranch={null}
      resumeAnswers={{}}
      resumeRedFlagAnswers={{}}
      resumeStepIndex={stepIndex}
      completedView={null}
    />
  );
}

// ---------------------------------------------------------------------
// 1. She answers blind.
// ---------------------------------------------------------------------

describe('no body system is named anywhere she answers', () => {
  it('is non vacuous: the names really are in the stored rows', () => {
    expect(SECTIONS.length).toBe(11);
    expect(NAMING_TEXT).toContain('Digestion');
    expect(NAMING_TEXT).toContain('Adrenals and Stress Response');
  });

  it.each(SECTIONS.map((section, index) => [index + 1, section.sectionKey] as const))(
    'section screen %i (%s) names no system',
    (sectionNumber) => {
      const html = answeringHtml(sectionNumber - 1);
      // The screen really is the one being claimed about.
      expect(html).toContain(`Section ${sectionNumber} of 11`);
      for (const text of NAMING_TEXT) {
        expect(html.includes(text), `"${text}" leaked onto section ${sectionNumber}`).toBe(false);
      }
    }
  );

  it('names no system on any of the six red flag screens either', () => {
    for (let index = 0; index < RED_FLAGS.length; index += 1) {
      const html = answeringHtml(SECTIONS.length + index);
      for (const text of NAMING_TEXT) {
        expect(html.includes(text), `"${text}" leaked onto a red flag screen`).toBe(false);
      }
    }
  });

  it('shows the neutral progress counter and the task heading instead', () => {
    const html = answeringHtml(2);
    expect(html).toContain('Section 3 of 11');
    expect(html).toContain(MEMBER_COPY['member.section_heading']!);
  });

  it('keeps the section 11 branch question exactly as it was', () => {
    const html = answeringHtml(10);
    expect(html).toContain(MEMBER_COPY['member.branch_question']!);
    expect(html).toContain(MEMBER_COPY['member.branch_option_a']!);
    expect(html).toContain(MEMBER_COPY['member.branch_option_b']!);
  });

  it('keeps the six red flag questions exactly as they were', () => {
    for (const [index, flag] of RED_FLAGS.entries()) {
      const html = answeringHtml(SECTIONS.length + index);
      expect(html).toContain(flag.prompt);
      expect(html).toContain(`${index + 1} of ${RED_FLAGS.length}`);
    }
  });

  it('does not reveal a name in the resume note either', () => {
    const html = renderToStaticMarkup(
      <BodySystemsExperience
        status="in_progress"
        content={ANSWERING_CONTENT}
        rememberedBranch={null}
        resumeAnswers={{}}
        resumeRedFlagAnswers={{}}
        resumeStepIndex={4}
        completedView={null}
      />
    );
    expect(html).toContain(MEMBER_COPY['member.resume_note']!);
    for (const text of NAMING_TEXT) expect(html.includes(text)).toBe(false);
  });

  it('is not in the props the page serialises, not merely undrawn', () => {
    const payload = JSON.stringify(ANSWERING_CONTENT);
    for (const text of NAMING_TEXT) {
      expect(payload.includes(text), `"${text}" is still in the answering bundle`).toBe(false);
    }
    // And what it does still carry is what the step list needs.
    expect(ANSWERING_CONTENT.sections.map((section) => section.sectionKey)).toEqual(
      SECTIONS.map((section) => section.sectionKey)
    );
  });

  it('is the route that blinds it, so the component is never handed a name', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/body-systems/page.tsx'), 'utf8');
    expect(page).toContain('content={blindContent(content)}');
  });

  it('tells her once, in the intro, why the sections are unnamed', () => {
    const html = renderToStaticMarkup(
      <BodySystemsExperience
        status="pending"
        content={ANSWERING_CONTENT}
        rememberedBranch={null}
        resumeAnswers={{}}
        resumeRedFlagAnswers={{}}
        resumeStepIndex={0}
        completedView={null}
      />
    );
    expect(html).toContain(MEMBER_COPY['member.intro_title']!);
    for (const text of NAMING_TEXT) expect(html.includes(text)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 2. Every change of screen starts at the top.
// ---------------------------------------------------------------------

describe('a new section opens at the top of itself', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      configurable: true,
      value: scrollTo,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    saveProgress.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(resumeStepIndex: number) {
    act(() => {
      root.render(
        <BodySystemsExperience
          status="in_progress"
          content={ANSWERING_CONTENT}
          rememberedBranch="a"
          resumeAnswers={{}}
          resumeRedFlagAnswers={{}}
          resumeStepIndex={resumeStepIndex}
          completedView={null}
        />
      );
    });
  }

  /** One tap on the first option of every question on the screen. */
  async function answerEveryQuestion() {
    const questions = Array.from(container.querySelectorAll('ol > li'));
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      const option = question.querySelector('button');
      expect(option).not.toBeNull();
      await act(async () => {
        option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
  }

  function continueButton(): HTMLButtonElement {
    const label = MEMBER_COPY['member.continue']!;
    const found = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    );
    expect(found, 'no Continue button on the screen').toBeTruthy();
    return found as HTMLButtonElement;
  }

  it('scrolls to the top when a resumed sitting opens', () => {
    mount(3);
    expect(container.textContent).toContain('Section 4 of 11');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls to the top again when she finishes a section and the next loads', async () => {
    mount(0);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    await answerEveryQuestion();
    // Answering is not a change of screen, so nothing has scrolled.
    expect(scrollTo).toHaveBeenCalledTimes(1);

    await act(async () => {
      continueButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(saveProgress).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Section 2 of 11');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('takes the scroll position off the browser while she is in the survey', () => {
    /*
      THE BUG THIS IS FOR WAS FOUND ON PRODUCTION. Every section change
      landed at the top and a refresh in the middle of a section landed
      2,797px down, because a reload restores the position the browser
      remembers and does it after hydration. Scoped to the survey: her back
      button position everywhere else is the browser's business again the
      moment she leaves.
    */
    window.history.scrollRestoration = 'auto';
    mount(3);
    expect(window.history.scrollRestoration).toBe('manual');
    act(() => root.unmount());
    expect(window.history.scrollRestoration).toBe('auto');
    // The afterEach unmount must still be safe.
    root = createRoot(container);
  });

  it('scrolls to the top when she steps back as well', async () => {
    mount(2);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    const back = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${MEMBER_COPY['member.back']}"]`
    );
    expect(back).not.toBeNull();
    await act(async () => {
      back!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Section 2 of 11');
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------
// 3. The results screen.
// ---------------------------------------------------------------------

function viewFor(previous: boolean) {
  /*
    A SPREAD ACROSS ALL THREE BANDS, decided per SECTION rather than per
    question, because a mix inside every section gives all eleven of them
    the same percentage and the screen would then be one band deep.
  */
  const answers: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branch === 'b') continue;
    const sectionIndex = SECTIONS.findIndex(
      (section) => section.sectionKey === question.sectionKey
    );
    answers[question.questionRef] =
      sectionIndex % 3 === 0
        ? 'almost_always'
        : sectionIndex % 3 === 1
          ? question.position % 2 === 0
            ? 'sometimes'
            : 'rarely'
          : 'rarely';
  }
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    branch: 'a',
  });
  return buildMemberResultsView({
    sections: SECTIONS,
    bands: BANDS,
    results,
    previousResults: previous ? results : null,
    minDeltaPercent: 1,
  });
}

describe('her results are one graph with one legend', () => {
  const view = viewFor(false);
  const html = renderToStaticMarkup(<BodySystemsResults view={view} copy={MEMBER_COPY} />);
  const text = html.replace(/<[^>]*>/g, ' ');

  it('reveals all eleven system names, loudest first', () => {
    for (const section of SECTIONS) expect(html).toContain(section.displayName);
    const percents = view.bars.map((bar) => bar.percent);
    expect([...percents].sort((a, b) => b - a)).toEqual(percents);
  });

  it('has all three bands really represented, so the check is not vacuous', () => {
    expect(new Set(view.bars.map((bar) => bar.bandKey)).size).toBe(3);
  });

  it('explains each band exactly once', () => {
    for (const band of BANDS) {
      const sentence = band.memberStatusLine.slice(`${band.memberLabel}.`.length).trim();
      const count = text.split(sentence).length - 1;
      expect(count, `"${sentence}" appears ${count} times`).toBe(1);
    }
  });

  it('prints no band sentence under a bar', () => {
    // The legend is the only place a band's own sentence may appear, and
    // the legend is above the graph.
    const graph = html.slice(html.indexOf('<ul class="mt-4 divide-y'));
    for (const band of BANDS) {
      const sentence = band.memberStatusLine.slice(`${band.memberLabel}.`.length).trim();
      expect(graph.includes(sentence), `"${sentence}" is under a bar`).toBe(false);
    }
  });

  it('keeps the one word band label on every row', () => {
    for (const bar of view.bars) expect(html).toContain(bar.bandLabel);
  });

  it('carries the closing card and the next action inside it', () => {
    const withAction = renderToStaticMarkup(
      <BodySystemsResults
        view={view}
        copy={MEMBER_COPY}
        action={<button type="button">{MEMBER_COPY['member.results_done']}</button>}
      />
    );
    const closing = MEMBER_COPY['member.results_closing']!.replace(/'/g, '&#x27;');
    expect(withAction).toContain(closing);
    const card = withAction.slice(withAction.indexOf(closing));
    expect(card).toContain(MEMBER_COPY['member.results_done']!);
  });

  it('still says nothing about a total, a grade or a score', () => {
    expect(text).not.toMatch(/\boverall\b/i);
    expect(text).not.toMatch(/\btotal\b/i);
    expect(text).not.toMatch(/\bgrade\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});

describe('the graph arrives one bar at a time', () => {
  const view = viewFor(false);
  const html = renderToStaticMarkup(<BodySystemsResults view={view} copy={MEMBER_COPY} />);

  it('gives every bar the shared grow class and its own delay, in order', () => {
    const delays = Array.from(html.matchAll(/mef-bs-bar[^>]*animation-delay:\s*(\d+)ms/g)).map(
      (match) => Number(match[1])
    );
    expect(delays.length).toBe(view.bars.length);
    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index]!).toBeGreaterThan(delays[index - 1]!);
    }
  });

  it('opens the headline before the first bar', () => {
    const opens = Array.from(html.matchAll(/mef-bs-open[^>]*animation-delay:\s*(\d+)ms/g)).map(
      (match) => Number(match[1])
    );
    const bars = Array.from(html.matchAll(/mef-bs-bar[^>]*animation-delay:\s*(\d+)ms/g)).map(
      (match) => Number(match[1])
    );
    expect(opens.length).toBeGreaterThan(2);
    expect(Math.min(...opens)).toBe(0);
    expect(bars[0]!).toBeGreaterThan(opens[1]!);
  });

  it('turns both animations off under prefers-reduced-motion', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    const block = css.slice(css.indexOf('@keyframes mef-bs-bar-grow'));
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.mef-bs-open');
    expect(reduced).toContain('.mef-bs-bar');
    expect(reduced).toContain('animation: none !important');
  });
});

describe('the retake comparison still works, in the same graph', () => {
  const view = viewFor(true);
  const html = renderToStaticMarkup(<BodySystemsResults view={view} copy={MEMBER_COPY} />);

  it('is a retake, with a comparison on every section', () => {
    expect(view.isRetake).toBe(true);
    expect(view.bars.every((bar) => bar.comparison !== null)).toBe(true);
  });

  it('names this time next to last time, once', () => {
    const text = html.replace(/<[^>]*>/g, ' ');
    const heading = MEMBER_COPY['member.compare_heading']!;
    expect(text.split(heading).length - 1).toBe(1);
    expect(text).toContain(MEMBER_COPY['member.compare_last_time']!);
  });

  it('says which way each system moved in words, not only in a tick', () => {
    // Identical sittings, so every section is unchanged and the word for
    // it has to be on every row.
    const unchanged = MEMBER_COPY['member.compare_unchanged']!;
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text.split(unchanged).length - 1).toBe(view.bars.length);
  });
});
