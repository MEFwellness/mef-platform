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
 * FOUR THINGS ARE PROVED, and each one is a way this treatment could have
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
const { BSN_QUESTIONS } = await import('@/lib/being-seen/questions');
const { BSN_CLOSING_LABEL, BSN_CLOSING_LINE, BSN_HOLD_LABEL } = await import(
  '@/lib/being-seen/copy'
);

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
