// @vitest-environment jsdom
/**
 * THE INTERACTIVE HALF OF THE HAPPINESS TREATMENT, DRIVEN RATHER THAN
 * DESCRIBED.
 *
 * What You Put Down is the first template in this family whose questions are
 * not all writing, and the three pieces it introduces are shared: a card
 * carrying her own words, the shelf it goes on with the deck she places it
 * from, and the two-pole line she puts a mark on. Your Own Company adds
 * three more, and adds them because the format ROTATES: the this-or-that
 * pair answered from the gut, the round of them with her own count at the
 * end, and the sentence that takes another sentence's place. Later
 * templates will use all six in different combinations, so what they
 * promise has to be proved against the real components rather than against
 * a description of them.
 *
 * FIVE THINGS ARE PROVED, and each one is a way an interactive element is
 * usually got wrong:
 *
 *   TAPS ALONE ARE ENOUGH, ON EVERY DEVICE. The card in her hand, the shelf
 *     it goes onto, and every card she chooses between are real buttons. A
 *     member with a phone, a keyboard or a screen reader can finish this
 *     sitting without ever dragging anything.
 *   THE DRAG IS AN ENHANCEMENT, AND IT NEVER DOUBLE FIRES. A pointer that
 *     travelled and was released on the shelf places ONE card, not two,
 *     because the click the browser fires after a drag is ignored. And a
 *     TAP is never captured, because a captured tap's click is retargeted
 *     away from the card's own button and the card becomes unplaceable by
 *     tapping. That one shipped and was found on production: a click
 *     dispatched straight at a button in a test never goes through the
 *     retargeting, so the invariant is asserted directly instead.
 *   REDUCED MOTION REMOVES THE DRAG ENTIRELY. No pointer handling at all, so
 *     nothing follows her finger and nothing travels. The card is placed by
 *     a tap and simply appears.
 *   THE GOLD IS A STATE, NOT A TRANSITION. Under reduced motion a lifted
 *     card is exactly as gold, with nothing left to animate.
 *   THE LINE IS A REAL RANGE INPUT, and it reads its position back in words
 *     rather than in a number.
 *
 * The closing with a picture in it is asserted here too, because What You
 * Put Down is the first template to hand the shared centerpiece one and the
 * beat it takes has to leave her own sentence still arriving after it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { WordCard } = await import('@/components/happiness-deep-dive/WordCard');
const { CardShelf } = await import('@/components/happiness-deep-dive/CardShelf');
const { PlacingDeck } = await import('@/components/happiness-deep-dive/PlacingDeck');
const { PoleSlider } = await import('@/components/happiness-deep-dive/PoleSlider');
const { PoleMap } = await import('@/components/happiness-deep-dive/PoleMap');
const { ClosingCenterpiece } = await import(
  '@/components/happiness-deep-dive/ClosingCenterpiece'
);
const { WYPD_POLES } = await import('@/lib/what-you-put-down/shelf');
const { WYPD_CLOSING_LABEL, WYPD_CLOSING_LINE, WYPD_SHELF_COPY } = await import(
  '@/lib/what-you-put-down/copy'
);
const { InstinctPair } = await import('@/components/happiness-deep-dive/InstinctPair');
const { RapidRound } = await import('@/components/happiness-deep-dive/RapidRound');
const { SupersededPair } = await import('@/components/happiness-deep-dive/SupersededPair');
const { YOC_RAPID_PAIR, YOC_RAPID_PHRASES, YOC_RAPID_QUESTION } = await import(
  '@/lib/your-own-company/questions'
);
const { YOC_CLOSING_FIRST_LABEL, YOC_CLOSING_SECOND_LABEL } = await import(
  '@/lib/your-own-company/copy'
);
const { TLYB_QUESTIONS, tlybLeadPromptFor } = await import(
  '@/lib/the-life-youre-building/questions'
);
const { TLYB_SLIDER_COPY } = await import('@/lib/the-life-youre-building/copy');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

const CARDS = [
  { id: 'c0', text: 'danced on Sundays' },
  { id: 'c1', text: 'read two books a week' },
  { id: 'c2', text: 'said what I thought' },
];

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

/**
 * A pointer event jsdom will actually deliver.
 *
 * jsdom has no PointerEvent constructor, and React listens for the plain
 * event names, so a bubbling Event carrying the coordinates is exactly what
 * the handlers receive in a browser.
 */
function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'touch' });
  return event;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useRealTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function deckAndShelf(onPlace: () => void, still: boolean) {
  function Harness() {
    const boardRef = { current: null as HTMLDivElement | null };
    return (
      <div>
        <PlacingDeck
          text={CARDS[0]!.text}
          placeLabel={WYPD_SHELF_COPY.placeCard}
          counter="1 of 3"
          onPlace={onPlace}
          boardRef={boardRef}
          onOverBoardChange={() => {}}
          still={still}
        />
        <CardShelf
          cards={[]}
          ariaLabel={WYPD_SHELF_COPY.shelfLabel}
          emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
          onDrop={onPlace}
          dropLabel={WYPD_SHELF_COPY.placeHere}
          boardRef={boardRef}
          still={still}
        />
      </div>
    );
  }
  act(() => {
    root.render(<Harness />);
  });
}

describe('taps alone are enough', () => {
  beforeEach(() => setReducedMotion(false));

  it('the card in her hand is a real button carrying her own words', () => {
    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const card = container.querySelector('button');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('danced on Sundays');
    expect(card?.getAttribute('aria-label')).toBe(
      `${WYPD_SHELF_COPY.placeCard}: danced on Sundays`
    );
    act(() => {
      card?.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('the shelf itself is a second way in, reachable with Tab', () => {
    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const shelf = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === WYPD_SHELF_COPY.placeHere
    );
    expect(shelf).toBeDefined();
    act(() => {
      shelf?.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('choosing between the cards on the shelf is a group of buttons, one of them pressed', () => {
    const onChoose = vi.fn();
    act(() => {
      root.render(
        <CardShelf
          cards={CARDS}
          ariaLabel={WYPD_SHELF_COPY.shelfLabel}
          emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
          markedId="c1"
          markedNote={WYPD_SHELF_COPY.stingNote}
          onChoose={onChoose}
          chooseLabel={WYPD_SHELF_COPY.chooseSting}
        />
      );
    });
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(3);
    expect(buttons[2]?.getAttribute('aria-label')).toBe(
      `${WYPD_SHELF_COPY.chooseSting}: said what I thought`
    );
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      buttons[0]?.click();
    });
    expect(onChoose).toHaveBeenCalledWith('c0');
  });

  it('a shelf that is being chosen from is never itself a button, so the controls do not nest', () => {
    act(() => {
      root.render(
        <CardShelf
          cards={CARDS}
          ariaLabel={WYPD_SHELF_COPY.shelfLabel}
          emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
          onChoose={() => {}}
          chooseLabel={WYPD_SHELF_COPY.chooseLift}
        />
      );
    });
    for (const button of Array.from(container.querySelectorAll('button'))) {
      expect(button.querySelector('button')).toBeNull();
    }
  });

  it('a card never shortens her words to fit', () => {
    const long =
      'played the piano badly every single evening after everyone else had gone to bed, for about eleven years';
    act(() => {
      root.render(<WordCard text={long} tone="resting" />);
    });
    expect(container.textContent).toContain(long);
    expect(container.innerHTML).not.toContain('line-clamp');
    expect(container.innerHTML).not.toContain('truncate');
  });
});

describe('the drag is an enhancement, and it never double fires', () => {
  beforeEach(() => {
    setReducedMotion(false);
    // jsdom measures nothing, so the shelf is given a real rectangle. Every
    // coordinate below therefore lands on it, which is the case worth
    // testing: a drag that DID land.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      top: 0,
      left: 0,
      right: 400,
      bottom: 400,
      toJSON: () => ({}),
    } as DOMRect);
  });

  it('a pointer that travelled and was released on the shelf places exactly one card', () => {
    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const card = container.querySelector('button') as HTMLElement;

    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointermove', 90, 120));
      card.dispatchEvent(pointer('pointerup', 90, 120));
    });
    expect(onPlace).toHaveBeenCalledTimes(1);

    // The browser fires a click straight after a drag on the same element.
    // It must not place a second card.
    act(() => {
      card.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('a pointer that barely moved is a tap, and the click it produces still places one card', () => {
    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const card = container.querySelector('button') as HTMLElement;

    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointermove', 12, 11));
      card.dispatchEvent(pointer('pointerup', 12, 11));
      card.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('A TAP IS NEVER CAPTURED, because a captured tap cannot place anything', () => {
    // THE BUG THIS PINS, found on production on 2026-09-07. Capturing the
    // pointer on pointerdown captures every tap as well as every drag, and
    // a captured pointer's click is dispatched to the CAPTURING element
    // rather than to what was under the finger. So the card's own button
    // never received a click and no card could be placed by tapping, which
    // is the only way a member without a mouse has.
    //
    // The retargeting itself is a browser behaviour jsdom does not model,
    // so what is asserted is the invariant underneath it: nothing is
    // captured until a drag has genuinely begun.
    const captured = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: captured,
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: () => {},
    });

    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const card = container.querySelector('button') as HTMLElement;

    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointerup', 10, 10));
      card.click();
    });
    expect(captured).not.toHaveBeenCalled();
    expect(onPlace).toHaveBeenCalledTimes(1);

    // A real drag still takes the pointer, which is what keeps the card
    // following her finger once it leaves the card's own bounds.
    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointermove', 90, 120));
      card.dispatchEvent(pointer('pointerup', 90, 120));
    });
    expect(captured).toHaveBeenCalledTimes(1);
  });

  it('a drag that swallowed its own click never swallows the NEXT genuine tap', () => {
    // The other half of the same browser behaviour. A drag's own click is
    // delivered to the capturing element, so it never reaches this button
    // to clear a flag. A flag would therefore still be set minutes later
    // and would eat a tap she made on purpose. What guards it expires on
    // its own instead.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onPlace = vi.fn();
    deckAndShelf(onPlace, false);
    const card = container.querySelector('button') as HTMLElement;

    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointermove', 90, 120));
      card.dispatchEvent(pointer('pointerup', 90, 120));
    });
    expect(onPlace).toHaveBeenCalledTimes(1);

    // The click that drag produced never arrives here at all.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      card.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('with reduced motion asked for', () => {
  beforeEach(() => setReducedMotion(true));

  it('the card in her hand has no drag at all: nothing follows her finger', () => {
    const onPlace = vi.fn();
    deckAndShelf(onPlace, true);
    const card = container.querySelector('button') as HTMLElement;
    const holder = card.closest('div[style]');

    act(() => {
      card.dispatchEvent(pointer('pointerdown', 10, 10));
      card.dispatchEvent(pointer('pointermove', 90, 120));
      card.dispatchEvent(pointer('pointerup', 90, 120));
    });

    // Nothing moved, and nothing was placed by the release.
    expect(holder?.getAttribute('style') ?? '').not.toContain('translate');
    expect(onPlace).not.toHaveBeenCalled();

    // And the tap still works, which is the whole point.
    act(() => {
      card.click();
    });
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('cards on the shelf are placed rather than settling in from above', () => {
    act(() => {
      root.render(
        <CardShelf
          cards={CARDS}
          ariaLabel={WYPD_SHELF_COPY.shelfLabel}
          emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
          still
          staggered
        />
      );
    });
    expect(container.querySelectorAll('.mef-settle-down')).toHaveLength(0);
    expect(container.textContent).toContain('danced on Sundays');
  });

  it('the lifted card is the same gold, arrived at without travelling', () => {
    act(() => {
      root.render(
        <WordCard text="danced on Sundays" tone="lifted" note={WYPD_SHELF_COPY.liftedNote} still />
      );
    });
    const card = container.querySelector('[data-tone="lifted"]') as HTMLElement;
    expect(card).not.toBeNull();
    // The gold is in the class list, not in a transition.
    expect(card.className + (card.firstElementChild?.className ?? '')).toContain('C4A050');
    expect(card.getAttribute('style') ?? '').not.toContain('transition');
    expect(card.getAttribute('style') ?? '').not.toContain('translateY');
    expect(container.textContent).toContain(WYPD_SHELF_COPY.liftedNote);
  });

  it('the line still moves, and never animates its mark there', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <PoleSlider
          value={72}
          onChange={onChange}
          poles={WYPD_POLES}
          label={WYPD_SHELF_COPY.lineLabel}
          unsetLabel={WYPD_SHELF_COPY.lineUnset}
          still
        />
      );
    });
    for (const painted of Array.from(container.querySelectorAll('span[style]'))) {
      expect(painted.getAttribute('style') ?? '').not.toContain('transition');
    }
  });

  it('the closing arrives whole: her shelf, her words and the fixed line together', () => {
    act(() => {
      root.render(
        <ClosingCenterpiece
          eyebrow={WYPD_CLOSING_LABEL}
          entries={[{ text: 'you were not wrong to put it down' }]}
          fixedLine={WYPD_CLOSING_LINE}
          visual={
            <CardShelf
              cards={CARDS}
              ariaLabel={WYPD_SHELF_COPY.shelfLabel}
              emptyLabel={WYPD_SHELF_COPY.shelfEmpty}
              still
            />
          }
        />
      );
    });
    expect(container.textContent).toContain('danced on Sundays');
    expect(container.textContent).toContain(WYPD_CLOSING_LABEL);
    expect(container.textContent).toContain('you were not wrong to put it down');
    expect(container.textContent).toContain(WYPD_CLOSING_LINE);
    expect(container.querySelectorAll('.mef-fade-in')).toHaveLength(0);
  });
});

/** One line, mounted with whatever state a check needs. */
function renderSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number) => void;
}) {
  act(() => {
    root.render(
      <PoleSlider
        value={value}
        onChange={onChange}
        poles={WYPD_POLES}
        label={WYPD_SHELF_COPY.lineLabel}
        unsetLabel={WYPD_SHELF_COPY.lineUnset}
      />
    );
  });
}

describe('the two-pole line', () => {
  beforeEach(() => setReducedMotion(false));

  it('is a real range input, so a keyboard and a screen reader already work on it', () => {
    act(() => {
      root.render(
        <PoleSlider
          value={null}
          onChange={() => {}}
          poles={WYPD_POLES}
          label={WYPD_SHELF_COPY.lineLabel}
          unsetLabel={WYPD_SHELF_COPY.lineUnset}
        />
      );
    });
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBe(WYPD_SHELF_COPY.lineLabel);
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
  });

  it('says she has not placed it yet, rather than showing a default she did not choose', () => {
    act(() => {
      root.render(
        <PoleSlider
          value={null}
          onChange={() => {}}
          poles={WYPD_POLES}
          label={WYPD_SHELF_COPY.lineLabel}
          unsetLabel={WYPD_SHELF_COPY.lineUnset}
        />
      );
    });
    expect(container.textContent).toContain(WYPD_SHELF_COPY.lineUnset);
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.getAttribute('aria-valuetext')).toBe(WYPD_SHELF_COPY.lineUnset);
  });

  it('reads her position back in words, in the readout and to a screen reader', () => {
    act(() => {
      root.render(
        <PoleSlider
          value={75}
          onChange={() => {}}
          poles={WYPD_POLES}
          label={WYPD_SHELF_COPY.lineLabel}
          unsetLabel={WYPD_SHELF_COPY.lineUnset}
        />
      );
    });
    expect(container.textContent).toContain('closer to A stranger');
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.getAttribute('aria-valuetext')).toBe('closer to A stranger');
    // Both ends are named on the screen, so the line means something
    // without the readout.
    expect(container.textContent).toContain(WYPD_POLES.near);
    expect(container.textContent).toContain(WYPD_POLES.far);
  });

  it('A TAP THAT LANDS WHERE THE MARK ALREADY IS STILL PLACES IT', () => {
    // Found on production. A range input fires `change` only when its VALUE
    // changes, so a member who felt exactly halfway and tapped the middle
    // of an unplaced line, whose mark is drawn at 50, moved nothing: no
    // event, no commit, and a screen that appeared not to have noticed her.
    const onChange = vi.fn();
    renderSlider({ value: null, onChange });
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;

    // No value change at all: exactly what a centre tap does.
    act(() => {
      input.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('and so does an arrow key pressed at an end it cannot move past', () => {
    const onChange = vi.fn();
    renderSlider({ value: 100, onChange });
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('hands the caller the number she landed on', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <PoleSlider
          value={50}
          onChange={onChange}
          poles={WYPD_POLES}
          label={WYPD_SHELF_COPY.lineLabel}
          unsetLabel={WYPD_SHELF_COPY.lineUnset}
        />
      );
    });
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    act(() => {
      setter?.call(input, '18');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(18);
  });
});

describe('the interactive pieces are shared, not owned by one template', () => {
  it('live in components/happiness-deep-dive and are exported from its one barrel', () => {
    const barrel = read('components/happiness-deep-dive/index.ts');
    for (const name of [
      'WordCard',
      'CardShelf',
      'PlacingDeck',
      'PoleSlider',
      'PoleMap',
      'InstinctPair',
      'RapidRound',
      'SupersededPair',
      'FollowUpPrompt',
    ]) {
      expect(barrel, name).toContain(name);
    }
    const experience = read('components/what-you-put-down/WhatYouPutDownExperience.tsx');
    expect(experience).toContain("from '@/components/happiness-deep-dive'");
    // The template imports them rather than defining its own.
    expect(experience).not.toContain('function CardShelf');
    expect(experience).not.toContain('function PoleSlider');
    expect(experience).not.toContain('function WordCard');
  });

  it('their numbers live in a plain module, so a server component can read them', () => {
    const source = read('lib/happiness-deep-dive/interactive.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain("'use client'");
    for (const file of [
      'components/happiness-deep-dive/WordCard.tsx',
      'components/happiness-deep-dive/CardShelf.tsx',
      'components/happiness-deep-dive/PlacingDeck.tsx',
      'components/happiness-deep-dive/PoleSlider.tsx',
      'components/happiness-deep-dive/PoleMap.tsx',
      'components/happiness-deep-dive/InstinctPair.tsx',
      'components/happiness-deep-dive/RapidRound.tsx',
      'components/happiness-deep-dive/SupersededPair.tsx',
      'components/happiness-deep-dive/FollowUpPrompt.tsx',
    ]) {
      expect(read(file), file).toContain("'use client'");
    }
  });

  it('none of them knows which template is using it', () => {
    for (const file of [
      'components/happiness-deep-dive/WordCard.tsx',
      'components/happiness-deep-dive/CardShelf.tsx',
      'components/happiness-deep-dive/PlacingDeck.tsx',
      'components/happiness-deep-dive/PoleSlider.tsx',
      'components/happiness-deep-dive/PoleMap.tsx',
      'components/happiness-deep-dive/InstinctPair.tsx',
      'components/happiness-deep-dive/RapidRound.tsx',
      'components/happiness-deep-dive/SupersededPair.tsx',
      'components/happiness-deep-dive/FollowUpPrompt.tsx',
    ]) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toContain('WYPD_');
      expect(source, file).not.toContain('what-you-put-down');
      expect(source, file).not.toContain('YOC_');
      expect(source, file).not.toContain('your-own-company');
      expect(source, file).not.toContain('TLYB_');
      expect(source, file).not.toContain('the-life-youre-building');
    }
  });
});

// ---------------------------------------------------------------------
// The instinct pick, the round of them, and the sentence that replaces
// another. Your Own Company's signature, and the rotation rule in practice.
// ---------------------------------------------------------------------

/** A pair that actually holds her pick, so changing her mind can be driven. */
function LivePair({ still = false }: { still?: boolean }) {
  const [value, setValue] = useState<'a' | 'b' | null>(null);
  return (
    <InstinctPair
      question="The voice sounds most like..."
      a="Someone I know"
      b="No one but me"
      value={value}
      onPick={setValue}
      still={still}
    />
  );
}

/** A round that actually holds her answers, so the whole five can be driven. */
function LiveRound({ tally = 'You said Never 5 times out of 5.' }: { tally?: string }) {
  const [answers, setAnswers] = useState<Record<string, 'a' | 'b'>>({});
  return (
    <RapidRound
      question={YOC_RAPID_QUESTION}
      items={YOC_RAPID_PHRASES}
      labels={YOC_RAPID_PAIR}
      answers={answers}
      onAnswer={(id, side) => setAnswers((previous) => ({ ...previous, [id]: side }))}
      tallySentence={tally}
      counterFor={(index, total) => `${index} of ${total}`}
    >
      <p data-testid="after-the-round">the written question</p>
    </RapidRound>
  );
}

function radios(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
}

/** Let the zero length beats a reduced-motion round schedules actually run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('the instinct pair', () => {
  beforeEach(() => setReducedMotion(false));

  it('is two real buttons in one radio group, named by the standing question', () => {
    act(() => {
      root.render(<LivePair />);
    });
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('The voice sounds most like...');
    expect(radios()).toHaveLength(2);
    for (const button of radios()) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('aria-checked')).toBe('false');
    }
    expect(container.textContent).toContain('Someone I know');
    expect(container.textContent).toContain('No one but me');
  });

  it('a tap picks one, and the pick is announced rather than only coloured', () => {
    act(() => {
      root.render(<LivePair />);
    });
    act(() => {
      radios()[0]!.click();
    });
    expect(radios()[0]!.getAttribute('aria-checked')).toBe('true');
    expect(radios()[1]!.getAttribute('aria-checked')).toBe('false');
    expect(radios()[0]!.getAttribute('data-chosen')).toBe('true');
  });

  it('she may change it: tapping the other card moves the pick, with no confirmation', () => {
    act(() => {
      root.render(<LivePair />);
    });
    act(() => {
      radios()[0]!.click();
    });
    act(() => {
      radios()[1]!.click();
    });
    expect(radios()[0]!.getAttribute('aria-checked')).toBe('false');
    expect(radios()[1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('never shortens the words on a card to make the two fit', () => {
    const long =
      'It happens, you are okay, and none of this is the disaster it feels like at four in the afternoon';
    act(() => {
      root.render(
        <InstinctPair question="q" a={long} b="short" value={null} onPick={() => {}} />
      );
    });
    expect(container.textContent).toContain(long);
    expect(container.innerHTML).not.toContain('line-clamp');
    expect(container.innerHTML).not.toContain('truncate');
  });

  it('neither card is drawn as the right one before she has chosen', () => {
    act(() => {
      root.render(<LivePair />);
    });
    const [first, second] = radios();
    // The same classes on both, so nothing on the screen suggests an answer.
    expect(first!.className).toBe(second!.className);
  });
});

describe('the rapid round', () => {
  beforeEach(() => setReducedMotion(false));

  it('shows one pair at a time, with the phrase above it and where she is', () => {
    act(() => {
      root.render(<LiveRound />);
    });
    expect(container.textContent).toContain('You should have known better');
    expect(container.textContent).not.toContain('You always do this');
    expect(container.textContent).toContain('1 of 5');
    expect(radios()).toHaveLength(2);
  });

  it('NOTHING ADVANCES ON ITS OWN: with no tap, the same pair is still there', async () => {
    act(() => {
      root.render(<LiveRound />);
    });
    await settle();
    expect(container.textContent).toContain('You should have known better');
    expect(container.textContent).toContain('1 of 5');
  });

  it('holds the pair she tapped on screen, lit, before it is replaced', () => {
    act(() => {
      root.render(<LiveRound />);
    });
    act(() => {
      radios()[1]!.click();
    });
    // Still phrase one, and her answer is showing on it.
    expect(container.textContent).toContain('You should have known better');
    expect(radios()[1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('the written question it sets up is genuinely absent until the round is finished', async () => {
    setReducedMotion(true);
    act(() => {
      root.render(<LiveRound />);
    });
    for (let index = 0; index < 4; index += 1) {
      act(() => {
        radios()[1]!.click();
      });
      await settle();
      expect(container.querySelector('[data-testid="after-the-round"]')).toBeNull();
    }
    act(() => {
      radios()[1]!.click();
    });
    await settle();
    expect(container.querySelector('[data-testid="after-the-round"]')).not.toBeNull();
  });

  it('prints the tally it was handed, and never computes one of its own', async () => {
    setReducedMotion(true);
    act(() => {
      root.render(<LiveRound tally="You said Never 4 times out of 5." />);
    });
    for (let index = 0; index < 5; index += 1) {
      act(() => {
        radios()[1]!.click();
      });
      await settle();
    }
    const tally = container.querySelector('[data-rapid-tally="true"]');
    expect(tally?.textContent).toBe('You said Never 4 times out of 5.');
    // The component holds no arithmetic at all: the sentence is the
    // caller's, from one shared function.
    const source = read('components/happiness-deep-dive/RapidRound.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain('filter(');
    expect(source).not.toContain('+= 1');
  });

  it('resumes: a round she already answered arrives at her tally, with nothing replayed', async () => {
    const answered = Object.fromEntries(
      YOC_RAPID_PHRASES.map((phrase) => [phrase.id, 'b' as const])
    );
    act(() => {
      root.render(
        <RapidRound
          question={YOC_RAPID_QUESTION}
          items={YOC_RAPID_PHRASES}
          labels={YOC_RAPID_PAIR}
          answers={answered}
          onAnswer={() => {}}
          tallySentence="You said Never 5 times out of 5."
          counterFor={(index, total) => `${index} of ${total}`}
        >
          <p data-testid="after-the-round">the written question</p>
        </RapidRound>
      );
    });
    // On the very first frame, with no timer having run.
    expect(container.querySelector('[data-rapid-tally="true"]')?.textContent).toBe(
      'You said Never 5 times out of 5.'
    );
    expect(container.querySelector('[data-testid="after-the-round"]')).not.toBeNull();
  });
});

describe('the sentence that takes another sentence’s place', () => {
  const OLD = 'You should have known better';
  const NEW = 'That went badly and I know why';

  beforeEach(() => setReducedMotion(false));

  it('shows the first sentence alone, and the second is genuinely absent until it is due', () => {
    act(() => {
      root.render(
        <SupersededPair
          firstCaption={YOC_CLOSING_FIRST_LABEL}
          first={OLD}
          secondCaption={YOC_CLOSING_SECOND_LABEL}
          second={NEW}
        />
      );
    });
    expect(container.querySelector('[data-superseded="first"]')?.textContent).toBe(OLD);
    expect(container.querySelector('[data-superseded="second"]')).toBeNull();
  });

  it('keeps the first legible rather than removing or striking it out', () => {
    act(() => {
      root.render(
        <SupersededPair
          firstCaption={YOC_CLOSING_FIRST_LABEL}
          first={OLD}
          secondCaption={YOC_CLOSING_SECOND_LABEL}
          second={NEW}
          instant
        />
      );
    });
    const first = container.querySelector('[data-superseded="first"]');
    expect(first?.textContent).toBe(OLD);
    expect(container.innerHTML).not.toContain('line-through');
    expect(container.querySelector('[data-superseded="second"]')?.textContent).toBe(NEW);
  });

  it('reproduces both sentences character for character, including her line breaks', () => {
    const messy = 'i AM so, so tired of this...\n  and nobody cares';
    act(() => {
      root.render(
        <SupersededPair
          firstCaption="a"
          first={messy}
          secondCaption="b"
          second={NEW}
          instant
        />
      );
    });
    expect(container.querySelector('[data-superseded="first"]')?.textContent).toBe(messy);
  });
});

describe('with reduced motion asked for, the instinct pieces', () => {
  beforeEach(() => setReducedMotion(true));

  it('a chosen card is simply the chosen card, with nothing left to animate', () => {
    act(() => {
      root.render(<LivePair still />);
    });
    act(() => {
      radios()[0]!.click();
    });
    const chosen = radios()[0]!;
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(chosen.style.transition).toBe('');
  });

  it('the round has no beats: the next pair is simply there', async () => {
    act(() => {
      root.render(<LiveRound />);
    });
    act(() => {
      radios()[1]!.click();
    });
    await settle();
    expect(container.textContent).toContain('You always do this');
    expect(container.textContent).toContain('2 of 5');
    expect(container.innerHTML).not.toContain('mef-fade-in');
  });

  it('both closing sentences are present on the first frame, with the rewrite primary', () => {
    act(() => {
      root.render(
        <SupersededPair
          firstCaption={YOC_CLOSING_FIRST_LABEL}
          first="You should have known better"
          secondCaption={YOC_CLOSING_SECOND_LABEL}
          second="That went badly and I know why"
        />
      );
    });
    const first = container.querySelector('[data-superseded="first"]');
    const second = container.querySelector('[data-superseded="second"]');
    expect(first?.textContent).toBe('You should have known better');
    expect(second?.textContent).toBe('That went badly and I know why');
    // Nothing is timed, and the rewrite is the larger of the two by the
    // same means it is with motion on.
    expect(container.innerHTML).not.toContain('mef-fade-in');
    expect(second?.className).toContain('text-[26px]');
    expect(first?.className).toContain('text-[20px]');
  });
});

// ---------------------------------------------------------------------
// The picture of several lines, read back. The Life You're Building's
// closing, and the rotation rule in practice a second time.
// ---------------------------------------------------------------------

/** The three lines that template asks her to stand on, with marks on two of them. */
function tlybLines(withThird: boolean) {
  return TLYB_QUESTIONS.filter((question) => question.kind === 'slider').map(
    (question, index) => ({
      key: question.key,
      label: tlybLeadPromptFor(question),
      poles: question.poles ?? { near: '', far: '' },
      value: index === 2 && !withThird ? null : [8, 50, 95][index]!,
    })
  );
}

function renderMap(withThird: boolean) {
  act(() => {
    root.render(
      <PoleMap
        lines={tlybLines(withThird)}
        heading={TLYB_SLIDER_COPY.mapHeading}
        label={TLYB_SLIDER_COPY.mapLabel}
        unsetLabel={TLYB_SLIDER_COPY.unset}
      />
    );
  });
}

describe('the picture of her lines', () => {
  beforeEach(() => setReducedMotion(false));

  it('names itself, and carries one row per line she was asked about', () => {
    renderMap(true);
    const map = container.querySelector(`[aria-label="${TLYB_SLIDER_COPY.mapLabel}"]`);
    expect(map).not.toBeNull();
    expect(map?.querySelectorAll('li')).toHaveLength(3);
    expect(container.textContent).toContain(TLYB_SLIDER_COPY.mapHeading);
  });

  it('labels every line with the statement her mark completed, in those words', () => {
    renderMap(true);
    for (const question of TLYB_QUESTIONS.filter((entry) => entry.kind === 'slider')) {
      expect(container.textContent).toContain(tlybLeadPromptFor(question));
      expect(container.textContent).toContain(question.poles!.near);
      expect(container.textContent).toContain(question.poles!.far);
    }
  });

  it('reads every position back in words, never as a number', () => {
    renderMap(true);
    const text = container.textContent ?? '';
    // 8, 50 and 95 on the three lines, in the shared bands.
    expect(text).toContain('built by me');
    expect(text).toContain('halfway between At the beginning and Almost there');
    expect(text).toContain('inside me');
    // No raw position anywhere on the picture.
    expect(text).not.toMatch(/\b8\b/);
    expect(text).not.toMatch(/\b95\b/);
    expect(text).not.toContain('%');
  });

  it('a line she never placed says so, and is drawn with no mark', () => {
    renderMap(false);
    expect(container.textContent).toContain(TLYB_SLIDER_COPY.unset);
    // Two marks on the picture, not three: the third line carries none
    // rather than a mark quietly sitting at its middle.
    const rows = Array.from(container.querySelectorAll('li'));
    const marked = rows.filter((row) => row.querySelectorAll('span[style]').length > 0);
    expect(marked).toHaveLength(2);
  });

  it('is not a control: nothing on it can be pressed or moved', () => {
    renderMap(true);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('never shortens her question labels to fit', () => {
    renderMap(true);
    expect(container.innerHTML).not.toContain('line-clamp');
    expect(container.innerHTML).not.toContain('truncate');
  });
});

describe('with reduced motion asked for, the picture of her lines', () => {
  it('is identical, because it has no motion to remove', () => {
    setReducedMotion(false);
    renderMap(true);
    const moving = container.innerHTML;

    setReducedMotion(true);
    renderMap(true);
    expect(container.innerHTML).toBe(moving);
    // And there is genuinely nothing timed on it either way.
    expect(moving).not.toContain('transition');
    expect(moving).not.toContain('animation');
  });
});
