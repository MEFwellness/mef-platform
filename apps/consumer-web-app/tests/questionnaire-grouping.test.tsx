// @vitest-environment jsdom

/**
 * The 2026-09-11 questionnaire pass, held down.
 *
 * WHAT IS BEING CLAIMED. A screen carries two or three questions and never
 * one lonely one at the end of a section. Continue and Back move one
 * screen at a time and an answer she already gave is still chosen when she
 * comes back to it. A section ending plays one short beat that names
 * nothing. And a resumed sitting opens on the screen holding the first
 * question she has not answered, at the top.
 *
 * WHY IT IS DRIVEN RATHER THAN DESCRIBED. Every one of those is a claim
 * about what happens when a real member presses a real button several
 * times in a row, so the tests press the real buttons and read the real
 * screen. The grouping arithmetic gets its own pure tests as well, because
 * the uneven cases (seven questions, ten questions) are the ones a rebuild
 * silently gets wrong.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

const saveProgress = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/app/actions/bodySystems', () => ({
  saveBodySystemsProgressAction: (...args: unknown[]) =>
    (saveProgress as unknown as (...a: unknown[]) => Promise<{ ok: true }>)(...args),
  submitBodySystemsSurveyAction: async () => ({ ok: false as const, error: 'not used here' }),
}));

const submitAnswer = vi.fn(async () => ({ ok: true as const }));
const submitContext = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/app/actions/assessments', () => ({
  submitAssessmentAnswer: (...args: unknown[]) =>
    (submitAnswer as unknown as (...a: unknown[]) => Promise<{ ok: true }>)(...args),
  submitAssessmentContext: (...args: unknown[]) =>
    (submitContext as unknown as (...a: unknown[]) => Promise<{ ok: true }>)(...args),
  completeMyAssessment: async () => null,
}));

const { groupSizes, chunkIntoGroups, groupIndexForItem } = await import(
  '../lib/questionnaire/groups'
);
const { BodySystemsExperience } = await import('../components/body-systems/BodySystemsExperience');
const { AssessmentTaker } = await import('../components/assessments/AssessmentTaker');
const { blindContent } = await import('../lib/body-systems/contentData');
const { SHORT_HAQ_QUESTIONNAIRE } = await import('../lib/assessments/short-haq');

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
const ANSWERING_CONTENT = blindContent(FULL_CONTENT);

/** Every word that names a body system, from the rows themselves. */
const NAMING_TEXT: string[] = SECTIONS.flatMap((section) => [
  section.displayName,
  section.memberIntroLine,
]);

// ---------------------------------------------------------------------
// 1. The arithmetic.
// ---------------------------------------------------------------------

describe('a screen holds two or three questions and never a lonely one', () => {
  it.each([
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [9, [3, 3, 3]],
    [10, [3, 3, 2, 2]],
    [11, [3, 3, 3, 2]],
    [12, [3, 3, 3, 3]],
  ])('%i questions becomes %j', (count, expected) => {
    expect(groupSizes(count)).toEqual(expected);
  });

  it('never leaves a screen holding one question unless there is only one', () => {
    for (let count = 2; count <= 60; count += 1) {
      for (const size of groupSizes(count)) {
        expect(size, `a screen of one appeared at ${count} questions`).toBeGreaterThan(1);
      }
    }
  });

  it('always adds back up to the number it was given', () => {
    for (let count = 0; count <= 60; count += 1) {
      const total = groupSizes(count).reduce((sum, size) => sum + size, 0);
      expect(total).toBe(count);
    }
  });

  it('keeps every item, once, in order', () => {
    const items = Array.from({ length: 10 }, (_, index) => index);
    expect(chunkIntoGroups(items).flat()).toEqual(items);
  });

  it('puts each item on the screen that really holds it', () => {
    // Ten questions, cut 3, 3, 2, 2.
    expect(groupIndexForItem(10, 0)).toBe(0);
    expect(groupIndexForItem(10, 2)).toBe(0);
    expect(groupIndexForItem(10, 3)).toBe(1);
    expect(groupIndexForItem(10, 6)).toBe(2);
    expect(groupIndexForItem(10, 9)).toBe(3);
    // Past the end lands on the last screen rather than nowhere.
    expect(groupIndexForItem(10, 99)).toBe(3);
  });
});

// ---------------------------------------------------------------------
// 2. The Body Systems Survey, driven.
// ---------------------------------------------------------------------

type Harness = {
  container: HTMLDivElement;
  root: Root;
};

function makeHarness(): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

/** Reduced motion on skips the section beat; off plays it. */
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe('the Body Systems Survey moves one screen at a time', () => {
  let harness: Harness;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
    setReducedMotion(true);
    saveProgress.mockClear();
    harness = makeHarness();
  });

  afterEach(() => {
    act(() => harness.root.unmount());
    harness.container.remove();
  });

  function mount(options: {
    resumeStepIndex: number;
    resumeAnswers?: Record<string, string>;
  }) {
    act(() => {
      harness.root.render(
        <BodySystemsExperience
          status="in_progress"
          content={ANSWERING_CONTENT}
          rememberedBranch="a"
          resumeAnswers={options.resumeAnswers ?? {}}
          resumeRedFlagAnswers={{}}
          resumeStepIndex={options.resumeStepIndex}
          completedView={null}
        />
      );
    });
  }

  function questionBlocks(): HTMLLIElement[] {
    return Array.from(harness.container.querySelectorAll('ol > li'));
  }

  function promptsOnScreen(): string[] {
    return questionBlocks().map((block) => block.querySelector('h2')?.textContent ?? '');
  }

  async function tapFirstOptionEverywhere() {
    for (const block of questionBlocks()) {
      const option = block.querySelector('button');
      expect(option).not.toBeNull();
      await act(async () => {
        option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(harness.container.querySelectorAll('button')).find((element) =>
      element.textContent?.trim().startsWith(label)
    );
    expect(found, `no "${label}" button on the screen`).toBeTruthy();
    return found as HTMLButtonElement;
  }

  async function press(label: string) {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async function pressBack() {
    const back = harness.container.querySelector<HTMLButtonElement>(
      `button[aria-label="${MEMBER_COPY['member.back']}"]`
    );
    expect(back).not.toBeNull();
    await act(async () => {
      back!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  const CONTINUE = MEMBER_COPY['member.continue']!;

  it('shows a whole section across several screens of two or three, each question once', async () => {
    mount({ resumeStepIndex: 0 });
    const sectionKey = SECTIONS[0]!.sectionKey;
    const expected = QUESTIONS.filter((question) => question.sectionKey === sectionKey).map(
      (question) => question.prompt
    );
    expect(expected.length).toBe(10);

    const seen: string[] = [];
    for (let screen = 0; screen < 4; screen += 1) {
      const prompts = promptsOnScreen();
      expect(prompts.length, 'a screen carried more than three questions').toBeLessThanOrEqual(3);
      expect(prompts.length, 'a screen carried a single question').toBeGreaterThan(1);
      seen.push(...prompts);
      await tapFirstOptionEverywhere();
      await press(CONTINUE);
    }

    expect(seen).toEqual(expected);
    expect(harness.container.textContent).toContain('Section 2 of 11');
  });

  it('names no body system on any screen of a section, not only the first', async () => {
    mount({ resumeStepIndex: 0 });
    for (let screen = 0; screen < 4; screen += 1) {
      const html = harness.container.innerHTML;
      for (const text of NAMING_TEXT) {
        expect(html.includes(text), `"${text}" leaked onto screen ${screen + 1}`).toBe(false);
      }
      await tapFirstOptionEverywhere();
      await press(CONTINUE);
    }
  });

  it('keeps her answers chosen when she steps back', async () => {
    mount({ resumeStepIndex: 0 });
    const firstScreenPrompts = promptsOnScreen();
    await tapFirstOptionEverywhere();
    await press(CONTINUE);

    expect(promptsOnScreen()).not.toEqual(firstScreenPrompts);
    await pressBack();

    expect(promptsOnScreen()).toEqual(firstScreenPrompts);
    for (const block of questionBlocks()) {
      const chosen = Array.from(block.querySelectorAll('button')).filter(
        (option) => option.getAttribute('aria-checked') === 'true'
      );
      expect(chosen.length, 'her answer was not still chosen').toBe(1);
      expect(chosen[0]!.textContent).toContain(SCALE[0]!.label);
    }
  });

  it('refuses to continue until every question on the screen is answered', async () => {
    mount({ resumeStepIndex: 0 });
    expect(button(CONTINUE).disabled).toBe(true);

    const blocks = questionBlocks();
    await act(async () => {
      blocks[0]!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(button(CONTINUE).disabled).toBe(true);

    await tapFirstOptionEverywhere();
    expect(button(CONTINUE).disabled).toBe(false);
  });

  it('steps back from the first screen of a section onto the LAST screen of the one before', async () => {
    mount({ resumeStepIndex: 1 });
    expect(harness.container.textContent).toContain('Section 2 of 11');
    await pressBack();

    expect(harness.container.textContent).toContain('Section 1 of 11');
    // Ten questions, cut 3, 3, 2, 2: the last screen is questions nine and ten.
    expect(harness.container.textContent).toContain('Questions 9 to 10 of 10');
  });

  it('resumes on the screen holding the first question she has not answered', () => {
    const section = SECTIONS[2]!;
    const questions = QUESTIONS.filter(
      (question) => question.sectionKey === section.sectionKey && question.branch === 'all'
    );
    const answered: Record<string, string> = {};
    for (const question of questions.slice(0, 4)) {
      answered[question.questionRef] = SCALE[0]!.valueKey;
    }

    mount({ resumeStepIndex: 2, resumeAnswers: answered });

    expect(harness.container.textContent).toContain('Section 3 of 11');
    expect(harness.container.textContent).toContain(`Questions 4 to 6 of ${questions.length}`);
    expect(promptsOnScreen()).toEqual(questions.slice(3, 6).map((question) => question.prompt));
  });

  it('writes her answer a moment after the tap, so a refresh mid screen keeps it', async () => {
    /*
      THE POINT OF THIS ONE. Her Continue has always written the draft, and
      still does. What it could not do was cover the member who answers one
      of three questions and then reloads, which is exactly the case the
      2026-09-11 pass was asked to hold. Every tap now queues the whole
      draft, and it goes over a route handler rather than the Server Action
      so that a hundred and three taps are not a hundred and three full
      page renders.
    */
    const calls: Array<{ url: string; body: unknown }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      configurable: true,
      value: async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({ ok: true }) };
      },
    });

    mount({ resumeStepIndex: 0 });
    const first = questionBlocks()[0]!;
    const prompt = first.querySelector('h2')!.textContent;
    await act(async () => {
      first.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Nothing yet: three taps in a row must not be three writes.
    expect(calls.length).toBe(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('/api/body-systems/progress');
    const saved = calls[0]!.body as { answers: Record<string, string>; stepIndex: number };
    expect(Object.keys(saved.answers).length).toBe(1);
    expect(saved.stepIndex).toBe(0);
    // The one answer written is the one she actually gave.
    const questionRef = Object.keys(saved.answers)[0]!;
    expect(QUESTIONS.find((question) => question.questionRef === questionRef)?.prompt).toBe(prompt);
    expect(saved.answers[questionRef]).toBe(SCALE[0]!.valueKey);
  }, 10000);

  it('plays one short beat between two sections, and it names nothing', async () => {
    setReducedMotion(false);
    mount({ resumeStepIndex: 0 });

    for (let screen = 0; screen < 4; screen += 1) {
      await tapFirstOptionEverywhere();
      await press(CONTINUE);
    }

    // The beat is on the screen, and it is not the next section yet.
    expect(harness.container.textContent).toContain('Section complete');
    expect(harness.container.textContent).toContain('another area');
    expect(harness.container.textContent).not.toContain('Section 2 of 11');
    for (const text of NAMING_TEXT) {
      expect(harness.container.innerHTML.includes(text), `"${text}" leaked onto the beat`).toBe(
        false
      );
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    expect(harness.container.textContent).toContain('Section 2 of 11');
    expect(harness.container.textContent).not.toContain('Section complete');
  }, 10000);

  it('skips the beat entirely when she has asked for reduced motion', async () => {
    mount({ resumeStepIndex: 0 });
    for (let screen = 0; screen < 4; screen += 1) {
      await tapFirstOptionEverywhere();
      await press(CONTINUE);
    }
    expect(harness.container.textContent).not.toContain('Section complete');
    expect(harness.container.textContent).toContain('Section 2 of 11');
  });
});

// ---------------------------------------------------------------------
// 3. The generic questionnaire taker, driven.
// ---------------------------------------------------------------------

describe('the generic questionnaire taker moves one screen at a time', () => {
  let harness: Harness;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
    setReducedMotion(true);
    submitAnswer.mockClear();
    submitContext.mockClear();
    harness = makeHarness();
  });

  afterEach(() => {
    act(() => harness.root.unmount());
    harness.container.remove();
  });

  function mount() {
    act(() => {
      harness.root.render(
        <AssessmentTaker
          questionnaire={SHORT_HAQ_QUESTIONNAIRE}
          displayTitle="Short Health Assessment"
          assessmentId="assessment-under-test"
          initialAnswers={{}}
          initialContext={{}}
          resumeCategoryId={null}
          resumeQuestionNumber={null}
        />
      );
    });
  }

  function questionBlocks(): HTMLLIElement[] {
    return Array.from(harness.container.querySelectorAll('ol > li'));
  }

  function continueButton(): HTMLButtonElement {
    const found = Array.from(harness.container.querySelectorAll('button')).find((element) =>
      element.textContent?.trim().startsWith('Continue')
    );
    expect(found, 'no Continue button on the screen').toBeTruthy();
    return found as HTMLButtonElement;
  }

  async function answerScreen() {
    for (const block of questionBlocks()) {
      await act(async () => {
        block.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
  }

  async function pressContinue() {
    await act(async () => {
      continueButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('opens on a screen of three questions with a range counter over them', () => {
    mount();
    expect(questionBlocks().length).toBe(3);
    expect(harness.container.textContent).toContain('Questions 1 to 3 of');
    expect(continueButton().disabled).toBe(true);
  });

  it('saves every answer individually, exactly as it did one question per screen', async () => {
    mount();
    await answerScreen();
    expect(submitAnswer).toHaveBeenCalledTimes(3);
    const [questionnaireId, assessmentId, categoryId] = submitAnswer.mock.calls[0] as unknown[];
    expect(questionnaireId).toBe('short-haq');
    expect(assessmentId).toBe('assessment-under-test');
    expect(categoryId).toBe(SHORT_HAQ_QUESTIONNAIRE.categories[0]!.id);
  });

  it('does not move her until she presses Continue, and then moves one screen', async () => {
    mount();
    const first = questionBlocks().map((block) => block.querySelector('h2')?.textContent);
    await answerScreen();
    // Still the same screen: nothing auto advances.
    expect(questionBlocks().map((block) => block.querySelector('h2')?.textContent)).toEqual(first);

    expect(continueButton().disabled).toBe(false);
    await pressContinue();
    expect(harness.container.textContent).toContain('Questions 4 to 5 of');
  });

  it('keeps her answers when she steps back', async () => {
    mount();
    await answerScreen();
    await pressContinue();

    const back = Array.from(harness.container.querySelectorAll('button')).find((element) =>
      element.textContent?.trim().startsWith('Back')
    );
    expect(back).toBeTruthy();
    await act(async () => {
      back!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(harness.container.textContent).toContain('Questions 1 to 3 of');
    for (const block of questionBlocks()) {
      const chosen = Array.from(block.querySelectorAll('button')).filter(
        (option) => option.getAttribute('aria-checked') === 'true'
      );
      expect(chosen.length).toBe(1);
    }
  });

  it('gives the one time intake prompt a screen of its own', async () => {
    mount();
    const gate = SHORT_HAQ_QUESTIONNAIRE.contextQuestions![0]!;
    // Walk until the gate appears rather than counting screens by hand.
    let guard = 0;
    while (!harness.container.textContent?.includes(gate.prompt) && guard < 40) {
      await answerScreen();
      await pressContinue();
      guard += 1;
    }
    expect(harness.container.textContent).toContain(gate.prompt);
    expect(questionBlocks().length).toBe(1);
  }, 20000);
});
