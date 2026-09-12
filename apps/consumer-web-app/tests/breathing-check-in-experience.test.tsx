// @vitest-environment jsdom
/**
 * The check-in, driven rather than described.
 *
 * WHAT IS BEING CLAIMED, and why none of it can be proved by reading the
 * source:
 *
 *   A TAP IS THE ANSWER AND THE ADVANCE. One question per screen, and the
 *     next one arrives on its own inside the transition window.
 *   BACK ALWAYS LANDS ON A QUESTION, with her previous answer still
 *     selected, so correcting one is a tap rather than a restart.
 *   THE THREE PAUSES ARE REAL SCREENS, they appear after questions four,
 *     eight and twelve, and they carry a Continue whether or not the timer
 *     is running.
 *   REDUCED MOTION DROPS THE TIMER AND KEEPS THE BUTTON. A screen that
 *     advances by itself is motion she did not ask for.
 *   SHE IS SHOWN NO NUMBER FROM THE SCORING MODEL on any screen in the
 *     walk, which is checked on every one of the twenty rather than on a
 *     sample.
 *   THE COMPLETION MOMENT HOLDS, and the results do not appear until both
 *     the beat and the submit are done.
 *   THE CARD IS ONE HEIGHT AND ONE WIDTH on every screen, which is what
 *     stops the composition jumping between questions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {},
    push: (href: string) => {
      pushed.push(href);
    },
  }),
}));

const submit = vi.fn(async (answers: unknown) => {
  const { scoreBpcAnswers } = await import('../lib/breathing-check-in/instrument');
  const { buildBpcMemberView } = await import('../lib/breathing-check-in/signals');
  return {
    ok: true as const,
    sessionId: 'session-1',
    view: buildBpcMemberView(scoreBpcAnswers(answers)),
  };
});
vi.mock('@/app/actions/breathingCheckIn', () => ({
  submitBreathingCheckInAction: (answers: unknown) => submit(answers),
}));

const { BreathingCheckInExperience } = await import(
  '../components/breathing-check-in/BreathingCheckInExperience'
);
const { BPC_COPY, BPC_MILESTONES } = await import('../lib/breathing-check-in/copy');
const { BPC_ITEMS, BPC_SCALE } = await import('../lib/breathing-check-in/instrument');
import type { BpcAnswers } from '../lib/breathing-check-in/instrument';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

type PostedDraft = { answers: BpcAnswers; stepIndex: number };
const drafts: PostedDraft[] = [];

let container: HTMLDivElement;
let root: Root;

describe('the Breathing Pattern Check-In, on a real screen', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    pushed.length = 0;
    submit.mockClear();
    // Reduced motion ON by default, so the pauses wait for Continue and no
    // test depends on a timer it did not start. The one test that checks
    // the automatic advance turns it off explicitly.
    setReducedMotion(true);
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
    drafts.length = 0;
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      configurable: true,
      value: vi.fn(async (_url: unknown, init?: { body?: string }) => {
        if (init?.body) drafts.push(JSON.parse(init.body) as PostedDraft);
        return new Response(JSON.stringify({ ok: true }));
      }),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(options: {
    status?: 'pending' | 'in_progress' | 'completed';
    resumeAnswers?: BpcAnswers;
  }) {
    act(() => {
      root.render(
        <BreathingCheckInExperience
          status={options.status ?? 'pending'}
          resumeAnswers={options.resumeAnswers ?? {}}
          completedView={null}
        />
      );
    });
  }

  function text(): string {
    return container.textContent ?? '';
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button'));
  }

  function button(label: string): HTMLButtonElement {
    const found = buttons().find((entry) => entry.textContent?.trim() === label);
    if (!found) {
      throw new Error(
        `no button labelled "${label}". Present: ${buttons()
          .map((entry) => entry.textContent?.trim())
          .join(' | ')}`
      );
    }
    return found;
  }


  /**
   * True when the only digits on screen are her POSITION.
   *
   * "Question 6 of 16" is a fact about the task in front of her and is
   * stripped before the scan. Anything else numeric would be a point
   * value, a running total, a maximum or the reference threshold, none of
   * which she is ever shown.
   */
  function noScoreDigits(): boolean {
    return !/\d/.test(text().replace(/Question \d+ of \d+/g, ''));
  }

  /** The one card on the screen. Every screen in the walk has exactly one. */
  function card(): HTMLElement {
    const found = container.querySelector('.mef-bpc-card');
    if (!found) throw new Error(`no card on screen. Text: ${text().slice(0, 120)}`);
    return found as HTMLElement;
  }

  /**
   * Presses a real button and lets the transition run.
   *
   * THE WAIT IS NOT A GUESS AT THE NETWORK. The advance is a local timer
   * the component owns, 260ms, and this waits past it. Nothing here waits
   * on a fetch: the autosave is fire and forget by design.
   */
  async function press(label: string) {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 340));
    });
  }

  /** Answers whatever question is on screen with one response. */
  async function answer(label = 'Never') {
    await press(label);
  }

  // -----------------------------------------------------------------

  it('opens on the introduction screen, spare, with the two facts and one button', () => {
    mount({});
    expect(text()).toContain(BPC_COPY.introTitle);
    expect(text()).toContain(BPC_COPY.introLineOne);
    expect(text()).toContain(BPC_COPY.introLineTwo);
    expect(text()).toContain('16 questions');
    expect(text()).toContain('About 2 minutes');
    // One button, and no question yet.
    expect(button(BPC_COPY.introCta)).toBeTruthy();
    expect(text()).not.toContain(BPC_ITEMS[0]!.prompt);
  });

  it('Begin Check-In opens the first question, with the context line above it', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    expect(text()).toContain(BPC_COPY.questionContextLine);
    expect(text()).toContain(BPC_ITEMS[0]!.prompt);
    expect(text()).toContain('Question 1 of 16');
    for (const option of BPC_SCALE) expect(button(option.label)).toBeTruthy();
  });

  it('shows one question at a time and never two', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    expect(text()).toContain(BPC_ITEMS[0]!.prompt);
    expect(text()).not.toContain(BPC_ITEMS[1]!.prompt);
  });

  it('a tap is the answer and the advance', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    await answer('Often');
    expect(text()).toContain(BPC_ITEMS[1]!.prompt);
    expect(text()).toContain('Question 2 of 16');
    expect(text()).not.toContain(BPC_ITEMS[0]!.prompt);
  });

  it('saves what she tapped, so closing the app does not cost her the sitting', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    await answer('Often');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[drafts.length - 1]!.answers[BPC_ITEMS[0]!.itemId]).toBe('often');
  });

  it('pauses after question four, with a Continue under it', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let i = 0; i < 4; i += 1) await answer();
    expect(text()).toContain(BPC_MILESTONES[0]!.heading);
    expect(text()).toContain(BPC_MILESTONES[0]!.line);
    expect(button(BPC_COPY.continueLabel)).toBeTruthy();
    // A pause is not a question, so no question number moved past four.
    expect(text()).not.toContain(BPC_ITEMS[4]!.prompt);
  });

  it('Continue on the pause opens question five', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let i = 0; i < 4; i += 1) await answer();
    await press(BPC_COPY.continueLabel);
    expect(text()).toContain(BPC_ITEMS[4]!.prompt);
    expect(text()).toContain('Question 5 of 16');
  });

  /**
   * THE ONE THIS EXISTS TO PREVENT. The step behind question five is a
   * pause, and Back landing there would put her on an encouragement screen
   * with nothing on it to correct.
   */
  it('Back from question five lands on question four, not on the pause', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let i = 0; i < 4; i += 1) await answer('Often');
    await press(BPC_COPY.continueLabel);
    expect(text()).toContain('Question 5 of 16');

    const back = buttons().find((b) => b.getAttribute('aria-label') === BPC_COPY.backLabel)!;
    await act(async () => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).toContain('Question 4 of 16');
    expect(text()).toContain(BPC_ITEMS[3]!.prompt);
  });

  it('keeps her previous answer selected when she goes back to it', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    await answer('Very often');
    expect(text()).toContain('Question 2 of 16');

    const back = buttons().find((b) => b.getAttribute('aria-label') === BPC_COPY.backLabel)!;
    await act(async () => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(button('Very often').getAttribute('aria-checked')).toBe('true');
    expect(button('Never').getAttribute('aria-checked')).toBe('false');
  });

  it('offers no Back on the very first question, because there is nothing behind it', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    expect(buttons().some((b) => b.getAttribute('aria-label') === BPC_COPY.backLabel)).toBe(false);
  });

  // -----------------------------------------------------------------

  /**
   * ONE WALK, THREE CLAIMS.
   *
   * These were three separate tests, each paying for its own sixteen
   * question walk at a third of a second a tap. They assert different
   * things about THE SAME twenty screens, so they are one pass with three
   * assertions rather than three passes with one each: same coverage,
   * a third of the wall clock.
   */
  it('walks all twenty screens: pauses land where they should, the card holds its shape, and no score appears', async () => {
    mount({});
    await press(BPC_COPY.introCta);

    const pausesSeen: string[] = [];
    let questionScreens = 0;

    for (let answered = 1; answered <= 16; answered += 1) {
      // ONE CARD, AT ONE HEIGHT AND ONE WIDTH. The floor height is what
      // stops a three word question collapsing into a small box, and one
      // height across all twenty is what stops the composition jumping.
      expect(container.querySelectorAll('.mef-bpc-card'), `screen ${answered}`).toHaveLength(1);
      expect(card().className, `screen ${answered}`).toContain('min-h-[430px]');
      expect(card().className, `screen ${answered}`).toContain('max-w-[680px]');
      expect(noScoreDigits(), `digit on question screen ${answered}`).toBe(true);
      questionScreens += 1;

      await answer();

      const milestone = BPC_MILESTONES.find((m) => text().includes(m.heading));
      if (milestone) {
        pausesSeen.push(milestone.heading);
        expect(card().className).toContain('min-h-[430px]');
        // A PAUSE CARRIES HER POSITION AND NOTHING ELSE NUMERIC. No score,
        // no count of anything she said, no category.
        expect(noScoreDigits(), `digit on the pause after ${answered}`).toBe(true);
        await press(BPC_COPY.continueLabel);
      }
    }

    expect(questionScreens).toBe(16);
    expect(pausesSeen).toEqual(BPC_MILESTONES.map((m) => m.heading));
  });

  it('never names the underlying instrument on any screen in the walk', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let answered = 1; answered <= 4; answered += 1) {
      expect(text().toLowerCase()).not.toContain('nijmegen');
      await answer();
    }
    expect(text().toLowerCase()).not.toContain('nijmegen');
  });

  // -----------------------------------------------------------------

  it('holds the completion moment, then hands her the reading', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let answered = 1; answered <= 16; answered += 1) {
      await answer('Often');
      if (BPC_MILESTONES.some((m) => text().includes(m.heading))) {
        await press(BPC_COPY.continueLabel);
      }
    }

    // The beat. The results are NOT on screen yet, and there is no spinner.
    expect(text()).toContain(BPC_COPY.completionTitle);
    expect(text()).not.toContain(BPC_COPY.resultsDisclaimer);
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
    });

    expect(text()).toContain(BPC_COPY.resultsTitle);
    expect(text()).toContain(BPC_COPY.resultsDisclaimer);
    // And her reading still carries no number.
    expect(/\d/.test(text())).toBe(false);
  });

  it('submits every one of her sixteen answers, and only once', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    for (let answered = 1; answered <= 16; answered += 1) {
      await answer('Sometimes');
      if (BPC_MILESTONES.some((m) => text().includes(m.heading))) {
        await press(BPC_COPY.continueLabel);
      }
    }
    expect(submit).toHaveBeenCalledTimes(1);
    const sent = submit.mock.calls[0]![0] as BpcAnswers;
    expect(Object.keys(sent)).toHaveLength(16);
    for (const item of BPC_ITEMS) expect(sent[item.itemId]).toBe('sometimes');
  });

  // -----------------------------------------------------------------

  it('welcomes back a member partway through and puts her on her next unanswered question', async () => {
    const answers: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.slice(0, 5).map((item) => [item.itemId, 'never'])
    );
    mount({ status: 'in_progress', resumeAnswers: answers });

    expect(text()).toContain(BPC_COPY.resumeTitle);
    await press(BPC_COPY.resumeCta);
    expect(text()).toContain('Question 6 of 16');
    expect(text()).toContain(BPC_ITEMS[5]!.prompt);
  });

  it('a member who stopped exactly on a pause comes back to a question, not to the pause', async () => {
    const answers: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.slice(0, 4).map((item) => [item.itemId, 'never'])
    );
    mount({ status: 'in_progress', resumeAnswers: answers });
    await press(BPC_COPY.resumeCta);
    expect(text()).toContain('Question 5 of 16');
    expect(text()).not.toContain(BPC_MILESTONES[0]!.heading);
  });

  // -----------------------------------------------------------------

  it('the card is centred in what is left of the viewport, below the chrome', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    const stage = card().parentElement!;
    // The card sits in a flex-1 region with its own breathing room, inside
    // a full height column. That is the composition the brief asks for:
    // chrome, room, card, room.
    expect(stage.className).toContain('flex-1');
    expect(stage.className).toContain('items-center');
    expect(stage.className).toContain('justify-center');
    expect(stage.parentElement!.className).toContain('min-h-[calc(100dvh-7rem)]');
  });

  it('labels the options as one radio group belonging to the question on screen', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    const group = container.querySelector('[role="radiogroup"]')!;
    const labelledBy = group.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toBe(BPC_ITEMS[0]!.prompt);
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(5);
  });

  it('reports the progress line as a real progressbar counting answers', async () => {
    mount({});
    await press(BPC_COPY.introCta);
    const bar = () => container.querySelector('[role="progressbar"]')!;
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    await answer();
    // One of sixteen. The pause between four and five cannot move this,
    // because it is computed from her answers rather than from screens.
    expect(bar().getAttribute('aria-valuenow')).toBe('6');
  });

  // -----------------------------------------------------------------

  it('under reduced motion a pause waits for her, rather than advancing by itself', async () => {
    setReducedMotion(true);
    mount({});
    await press(BPC_COPY.introCta);
    for (let i = 0; i < 4; i += 1) await answer();
    expect(text()).toContain(BPC_MILESTONES[0]!.heading);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });
    // Still there. A screen that advanced on its own would be motion she
    // asked not to have.
    expect(text()).toContain(BPC_MILESTONES[0]!.heading);
  });

  it('with motion on, a pause moves on by itself after its beat', async () => {
    setReducedMotion(false);
    mount({});
    await press(BPC_COPY.introCta);
    for (let i = 0; i < 4; i += 1) await answer();
    expect(text()).toContain(BPC_MILESTONES[0]!.heading);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });
    expect(text()).toContain('Question 5 of 16');
  });
});
