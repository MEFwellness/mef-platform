// @vitest-environment jsdom
/**
 * THE REDUCED-MOTION HALF OF THE TREATMENT, DRIVEN RATHER THAN DESCRIBED.
 *
 * Every other assertion about this build is pure (does the math say the
 * right number) or static (do all five templates import the right
 * component). Neither one proves the part that actually matters to a member
 * who has asked her device for less motion: that she can read the question
 * and use the writing box the instant the screen arrives, with nothing
 * timed and nothing withheld.
 *
 * So this file mounts the real components into a real DOM with the real
 * media query answering "reduce", and asserts on the real HTML.
 *
 * SIX THINGS ARE PROVED, and each one is a way this treatment could have
 * gone wrong in exactly the way an accessibility preference is usually got
 * wrong, by being made slower instead of being turned off:
 *
 *   THE QUESTION IS COMPLETE IMMEDIATELY. Not typing faster. Present.
 *   THE WRITING BOX IS THERE IMMEDIATELY. It is genuinely absent during the
 *     typed arrival, so "reduced motion still works" has to mean the box
 *     exists on the first frame, not that it arrives sooner.
 *   THE FIVE SECOND RING BECOMES A STILL MARK AND NO WAIT. The one question
 *     in the family that asks her to sit inside a length of time still
 *     shows its mark, drawn complete, with the box open beside it.
 *   THE CLOSING IS WHOLE ON ARRIVAL, her own words and the fixed line both,
 *     and her words are still character for character what was stored.
 *   THE SECOND HALF OF A QUESTION IS THERE TOO. Your Own Company's five
 *     interactive questions type their written half after she has picked,
 *     through the same shared arrival, so under reduced motion that prompt
 *     is complete and its box is open on the first frame.
 *   A CLOSING THAT CARRIES A PICTURE IN TWO BEATS still arrives whole. The
 *     one worth two beats is a sentence replaced by another, and a reduced
 *     motion reader gets both of them with the fixed line, immediately.
 *
 * The last of those is asserted with motion ON as well, because "verbatim"
 * has to survive the staged reveal: the lines are spans inside one
 * pre-wrapped block precisely so the text content of that block is her
 * stored string whatever is currently visible.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { QuestionStage } = await import('@/components/happiness-deep-dive/QuestionStage');
const { ClosingCenterpiece } = await import(
  '@/components/happiness-deep-dive/ClosingCenterpiece'
);
const { FollowUpPrompt } = await import('@/components/happiness-deep-dive/FollowUpPrompt');
const { SupersededPair } = await import('@/components/happiness-deep-dive/SupersededPair');
const { BSN_QUESTIONS } = await import('@/lib/being-seen/questions');
const { YOC_QUESTIONS } = await import('@/lib/your-own-company/questions');
const { YOC_CLOSING_FIRST_LABEL, YOC_CLOSING_LINE, YOC_CLOSING_SECOND_LABEL } = await import(
  '@/lib/your-own-company/copy'
);
const { BSN_CLOSING_LABEL, BSN_CLOSING_LINE, BSN_HOLD_LABEL } = await import(
  '@/lib/being-seen/copy'
);
const { PoleMap } = await import('@/components/happiness-deep-dive/PoleMap');
const { TLYB_QUESTIONS, tlybLeadPromptFor } = await import(
  '@/lib/the-life-youre-building/questions'
);
const {
  TLYB_CLOSING_STANDALONE_LINE,
  TLYB_SLIDER_COPY,
} = await import('@/lib/the-life-youre-building/copy');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

/** The one media query the whole treatment branches on, answered either way. */
function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useRealTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) =>
      clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
  }
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const HOLD_QUESTION = BSN_QUESTIONS[5]!;
const PLAIN_QUESTION = BSN_QUESTIONS[0]!;

function renderStage(question: (typeof BSN_QUESTIONS)[number]) {
  act(() => {
    root.render(
      <QuestionStage
        counter="Question 1 of 9"
        prompt={question.prompt}
        revealKey={question.key}
        hold={
          question.holdSeconds
            ? { seconds: question.holdSeconds, label: BSN_HOLD_LABEL }
            : null
        }
      >
        <textarea aria-label={question.prompt} />
        <button type="button">Continue</button>
      </QuestionStage>
    );
  });
}

describe('with reduced motion asked for', () => {
  beforeEach(() => setReducedMotion(true));

  it('the question is complete on arrival, not typed faster', () => {
    renderStage(PLAIN_QUESTION);
    // Once for the screen reader duplicate, once visibly. Both whole.
    expect(container.textContent).toContain(PLAIN_QUESTION.prompt);
    const visible = container.querySelector('h1 span[aria-hidden="true"]');
    expect(visible?.textContent).toBe(PLAIN_QUESTION.prompt);
  });

  it('there is no blinking caret, because nothing is being typed', () => {
    renderStage(PLAIN_QUESTION);
    expect(container.querySelector('.mef-typewriter-caret')).toBeNull();
  });

  it('the writing box and its button are usable immediately', () => {
    renderStage(PLAIN_QUESTION);
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Continue');
  });

  it('nothing arrives with a fade delay attached to it', () => {
    renderStage(PLAIN_QUESTION);
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });

  it('the five second question shows a still ring and does not withhold the box', () => {
    renderStage(HOLD_QUESTION);
    // The mark is there, and it says its one sentence.
    expect(container.textContent).toContain(BSN_HOLD_LABEL);
    expect(container.querySelector('svg')).not.toBeNull();
    // Drawn complete: no offset left to travel, and no transition to run.
    const circles = container.querySelectorAll('circle');
    const progress = circles[circles.length - 1];
    expect(progress?.getAttribute('stroke-dashoffset')).toBe('0');
    expect(progress?.getAttribute('style') ?? '').not.toContain('transition');
    // And the box is open beside it rather than five seconds away.
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('the closing arrives whole: her words and the fixed line together', () => {
    act(() => {
      root.render(
        <ClosingCenterpiece
          eyebrow={BSN_CLOSING_LABEL}
          entries={[{ text: 'that I am tired and still here' }]}
          fixedLine={BSN_CLOSING_LINE}
        />
      );
    });
    expect(container.textContent).toContain(BSN_CLOSING_LABEL);
    expect(container.textContent).toContain('that I am tired and still here');
    expect(container.textContent).toContain(BSN_CLOSING_LINE);
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });
});

describe('with motion on', () => {
  beforeEach(() => setReducedMotion(false));

  it('the writing box is genuinely absent until the question has finished, so she cannot type ahead', () => {
    renderStage(PLAIN_QUESTION);
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    // The screen reader still has the whole question from the first frame.
    expect(container.querySelector('.sr-only')?.textContent).toBe(PLAIN_QUESTION.prompt);
  });

  it('the closing screen is quiet first: nothing of hers and no fixed line yet', () => {
    act(() => {
      root.render(
        <ClosingCenterpiece
          eyebrow={BSN_CLOSING_LABEL}
          entries={[{ text: 'that I am tired and still here' }]}
          fixedLine={BSN_CLOSING_LINE}
        />
      );
    });
    expect(container.textContent).not.toContain('that I am tired and still here');
    expect(container.textContent).not.toContain(BSN_CLOSING_LINE);
  });

  it('her words are reproduced exactly, line breaks included, once they arrive', async () => {
    const stored = 'that I am tired\nand still here.  ';
    vi.useFakeTimers();
    act(() => {
      root.render(
        <ClosingCenterpiece
          eyebrow={BSN_CLOSING_LABEL}
          entries={[{ text: stored }]}
          fixedLine={BSN_CLOSING_LINE}
        />
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    vi.useRealTimers();

    // The one pre-wrapped block holding her writing. Its text content is
    // her stored string, character for character: nothing trimmed, nothing
    // re-wrapped, and the newline she typed still a newline.
    const block = container.querySelector('p.whitespace-pre-wrap');
    expect(block?.textContent).toBe(stored);
    expect(container.textContent).toContain(BSN_CLOSING_LINE);
  });
});

// ---------------------------------------------------------------------
// The second half of a question, and a closing that carries a picture
// which arrives in two beats. Your Own Company's shapes, on the shared
// treatment.
// ---------------------------------------------------------------------

const FOLLOW_UP = YOC_QUESTIONS[1]!;

function renderFollowUp() {
  act(() => {
    root.render(
      <FollowUpPrompt prompt={FOLLOW_UP.prompt} revealKey={`${FOLLOW_UP.key}#written`}>
        <textarea aria-label={FOLLOW_UP.prompt} />
      </FollowUpPrompt>
    );
  });
}

function renderSupersededClosing() {
  act(() => {
    root.render(
      <ClosingCenterpiece
        entries={[]}
        fixedLine={YOC_CLOSING_LINE}
        visualBeats={2}
        visual={
          <SupersededPair
            firstCaption={YOC_CLOSING_FIRST_LABEL}
            first="You should have known better"
            secondCaption={YOC_CLOSING_SECOND_LABEL}
            second="That went badly and I know why"
          />
        }
      />
    );
  });
}

describe('with reduced motion asked for, the second half of a question', () => {
  beforeEach(() => setReducedMotion(true));

  it('is complete on arrival, not typed faster', () => {
    renderFollowUp();
    expect(container.textContent).toContain(FOLLOW_UP.prompt);
    expect(container.querySelector('.mef-typewriter-caret')).toBeNull();
  });

  it('has its writing box open on the first frame', () => {
    renderFollowUp();
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });

  it('is a paragraph rather than a second first-level heading on the same screen', () => {
    renderFollowUp();
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('p')).not.toBeNull();
  });
});

describe('with reduced motion asked for, a closing worth two beats', () => {
  beforeEach(() => setReducedMotion(true));

  it('arrives whole: both her sentences and the fixed line, together', () => {
    renderSupersededClosing();
    expect(container.textContent).toContain('You should have known better');
    expect(container.textContent).toContain('That went badly and I know why');
    expect(container.textContent).toContain(YOC_CLOSING_LINE);
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });
});

describe('with motion on, the second half and the two beat closing', () => {
  beforeEach(() => setReducedMotion(false));

  it('the follow-up box is genuinely absent until its prompt has finished', () => {
    renderFollowUp();
    expect(container.querySelector('textarea')).toBeNull();
    // The screen reader still has the whole prompt from the first frame.
    expect(container.querySelector('.sr-only')?.textContent).toBe(FOLLOW_UP.prompt);
  });

  it('the closing is quiet first, and the fixed line waits out both beats', async () => {
    vi.useFakeTimers();
    renderSupersededClosing();
    expect(container.textContent).not.toContain('You should have known better');
    expect(container.textContent).not.toContain(YOC_CLOSING_LINE);

    // Twice, deliberately. The picture's own second beat is scheduled by an
    // effect that only exists once the centerpiece has mounted the picture,
    // and an effect registered during a timer advance has nothing left to
    // advance it. Real time has no such seam.
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    vi.useRealTimers();

    expect(container.textContent).toContain('You should have known better');
    expect(container.textContent).toContain('That went badly and I know why');
    expect(container.textContent).toContain(YOC_CLOSING_LINE);
  });
});

// ---------------------------------------------------------------------
// The Life You're Building's closing: a picture of three lines she placed
// herself on, and one sentence beneath it. The same shared treatment, a
// different shape.
// ---------------------------------------------------------------------

const HER_SENTENCE = 'I am building something that already has me in it';

function renderPoleMapClosing() {
  act(() => {
    root.render(
      <ClosingCenterpiece
        entries={[{ text: HER_SENTENCE }]}
        fixedLine={TLYB_CLOSING_STANDALONE_LINE}
        visualBeats={1}
        visual={
          <PoleMap
            lines={TLYB_QUESTIONS.filter((question) => question.kind === 'slider').map(
              (question, index) => ({
                key: question.key,
                label: tlybLeadPromptFor(question),
                poles: question.poles ?? { near: '', far: '' },
                value: [8, 50, 95][index]!,
              })
            )}
            heading={TLYB_SLIDER_COPY.mapHeading}
            label={TLYB_SLIDER_COPY.mapLabel}
            unsetLabel={TLYB_SLIDER_COPY.unset}
          />
        }
      />
    );
  });
}

describe('with reduced motion asked for, a closing that carries her three marks', () => {
  beforeEach(() => setReducedMotion(true));

  it('arrives whole: the picture, her sentence and the fixed line, on the first frame', () => {
    renderPoleMapClosing();
    // Every one of her three lines, labelled and read back in words.
    for (const question of TLYB_QUESTIONS.filter((entry) => entry.kind === 'slider')) {
      expect(container.textContent).toContain(tlybLeadPromptFor(question));
    }
    expect(container.textContent).toContain('halfway between At the beginning and Almost there');
    expect(container.textContent).toContain(HER_SENTENCE);
    expect(container.textContent).toContain(TLYB_CLOSING_STANDALONE_LINE);
    // Nothing is waiting, and nothing is fading.
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });

  it('reproduces her sentence character for character', () => {
    renderPoleMapClosing();
    const words = Array.from(container.querySelectorAll('p')).find((node) =>
      (node.textContent ?? '').includes(HER_SENTENCE)
    );
    expect(words?.textContent).toBe(HER_SENTENCE);
  });
});

describe('with motion on, a closing that carries her three marks', () => {
  beforeEach(() => setReducedMotion(false));

  it('is quiet first, and the fixed line waits out the picture and her sentence', async () => {
    vi.useFakeTimers();
    renderPoleMapClosing();
    expect(container.textContent).not.toContain(HER_SENTENCE);
    expect(container.textContent).not.toContain(TLYB_CLOSING_STANDALONE_LINE);

    // Twice, for the reason the superseded closing above needs it twice.
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    vi.useRealTimers();

    expect(container.textContent).toContain(TLYB_SLIDER_COPY.mapHeading);
    expect(container.textContent).toContain(HER_SENTENCE);
    expect(container.textContent).toContain(TLYB_CLOSING_STANDALONE_LINE);
  });
});
