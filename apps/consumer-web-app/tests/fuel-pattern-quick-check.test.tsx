// @vitest-environment jsdom
/**
 * THE QUICK CHECK, DRIVEN RATHER THAN DESCRIBED.
 *
 * The brief for this sheet is a claim about effort: three taps, about ten
 * seconds, no extra screens. That is a property of what actually happens
 * when a finger lands, not of anything a function returns, so the real
 * component is mounted and really tapped.
 *
 * Four things:
 *   1. THREE TAPS AND IT IS WRITTEN. There is no submit button, and the
 *      answer goes out on the third of the three required taps.
 *   2. THE FOURTH TAP IS OPTIONAL AND IS ON SCREEN FROM THE FIRST TICK,
 *      which is what makes it genuinely one tap rather than a second
 *      screen.
 *   3. ONE ROW PER CHECK, EVER. A second tap after the answer has gone
 *      cannot send a second one.
 *   4. NOTHING ON IT GRADES HER.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuickCheckSheet, type FpaQuickCheckAnswer } from '@/components/fuel-pattern/experiment/QuickCheckSheet';
import { FPA_QUICK_CHECK } from '@/lib/fuel-pattern/experiment/copy';
import { FPA_MEALS } from '@/lib/fuel-pattern/meals/library';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // The sheet holds the app's shared body scroll lock, which restores the
  // page's scroll position on release. jsdom has no scrollTo.
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => {},
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

/** The sheet portals to the body, so the whole document is what is read. */
function text(): string {
  return document.body.textContent ?? '';
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button'));
}

function tap(label: string) {
  const button = buttons().find((node) => node.textContent === label);
  expect(button, `no button labelled "${label}"`).toBeTruthy();
  act(() => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function mount(options: { taggableMeals?: { id: string; name: string; type: string }[] } = {}) {
  const answers: FpaQuickCheckAnswer[] = [];
  const closes: number[] = [];
  act(() => {
    root.render(
      <QuickCheckSheet
        taggableMeals={options.taggableMeals ?? []}
        onAnswer={(answer) => answers.push(answer)}
        onClose={() => closes.push(1)}
      />
    );
  });
  return { answers, closes };
}

describe('1. three taps and it is written', () => {
  it('offers exactly the three questions and their nine answers', () => {
    mount();
    expect(text()).toContain(FPA_QUICK_CHECK.energyHeader);
    expect(text()).toContain(FPA_QUICK_CHECK.hungerHeader);
    expect(text()).toContain(FPA_QUICK_CHECK.clarityHeader);
    for (const label of [
      'Low',
      'Steady',
      'Great',
      'Hungry',
      'Comfortable',
      'Still very full',
      'Foggy',
      'Normal',
      'Clear',
    ]) {
      expect(buttons().map((node) => node.textContent), label).toContain(label);
    }
  });

  it('has no submit button at all', () => {
    mount();
    const labels = buttons().map((node) => node.textContent);
    for (const label of ['Save', 'Done', 'Log it', 'Submit', 'Continue']) {
      expect(labels, label).not.toContain(label);
    }
  });

  it('writes nothing after one tap, nothing after two, and the whole check on the third', () => {
    const { answers } = mount();
    tap('Steady');
    expect(answers).toHaveLength(0);
    tap('Comfortable');
    expect(answers).toHaveLength(0);
    tap('Clear');
    expect(answers).toEqual([
      { energy: 'steady', hunger: 'comfortable', clarity: 'clear', mealType: null, mealId: null },
    ]);
  });

  it('says one warm line and then closes itself', () => {
    vi.useFakeTimers();
    const { answers, closes } = mount();
    tap('Low');
    tap('Hungry');
    tap('Foggy');
    expect(answers).toHaveLength(1);
    expect(text()).toContain(FPA_QUICK_CHECK.confirmation);
    expect(closes).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(closes).toHaveLength(1);
    vi.useRealTimers();
  });

  it('takes the three in any order', () => {
    const { answers } = mount();
    tap('Foggy');
    tap('Great');
    tap('Still very full');
    expect(answers[0]).toMatchObject({
      energy: 'great',
      hunger: 'still_very_full',
      clarity: 'foggy',
    });
  });

  it('lets her change her mind before the third lands', () => {
    const { answers } = mount();
    tap('Low');
    tap('Great');
    tap('Comfortable');
    tap('Clear');
    expect(answers[0]!.energy).toBe('great');
  });
});

describe('2. the optional fourth tap', () => {
  it('is on screen from the first tick, before anything has been answered', () => {
    mount();
    expect(text()).toContain(FPA_QUICK_CHECK.mealHeader);
    expect(buttons().map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['Breakfast', 'Lunch', 'Dinner', 'Snack'])
    );
  });

  it('is genuinely optional', () => {
    const { answers } = mount();
    tap('Steady');
    tap('Comfortable');
    tap('Normal');
    expect(answers[0]!.mealType).toBeNull();
    expect(answers[0]!.mealId).toBeNull();
  });

  it('carries the part of the day when she names one', () => {
    const { answers } = mount();
    tap('Lunch');
    tap('Steady');
    tap('Comfortable');
    tap('Normal');
    expect(answers[0]!.mealType).toBe('lunch');
    expect(answers[0]!.mealId).toBeNull();
  });

  it('offers a meal she is looking at as one tap, and that tap carries its own meal type', () => {
    const meal = FPA_MEALS.find((entry) => entry.type === 'dinner')!;
    const { answers } = mount({
      taggableMeals: [{ id: meal.id, name: meal.name, type: meal.type }],
    });
    expect(text()).toContain(meal.name);
    tap(meal.name);
    tap('Steady');
    tap('Comfortable');
    tap('Normal');
    expect(answers[0]!.mealId).toBe(meal.id);
    expect(answers[0]!.mealType).toBe('dinner');
  });

  it('offers no meal names at all when she is looking at none', () => {
    mount();
    for (const meal of FPA_MEALS.slice(0, 5)) {
      expect(text()).not.toContain(meal.name);
    }
  });
});

describe('3. one row per check, ever', () => {
  it('takes every answer button off the sheet the moment the check is written', () => {
    const { answers } = mount();
    tap('Steady');
    tap('Comfortable');
    tap('Normal');
    expect(answers).toHaveLength(1);
    // There is physically nothing left to tap: the three questions and the
    // optional row are replaced by the confirmation line, so a second row
    // cannot be written by a second finger.
    const labels = buttons().map((node) => node.textContent);
    for (const label of ['Low', 'Steady', 'Great', 'Hungry', 'Breakfast']) {
      expect(labels, label).not.toContain(label);
    }
  });
});

describe('4. nothing on it grades her', () => {
  it('says no streak, no score, no target and no apology', () => {
    mount();
    const lower = text().toLowerCase();
    for (const word of [
      'streak',
      'score',
      'target',
      'goal',
      'you missed',
      'keep it up',
      'well done',
    ]) {
      expect(lower, word).not.toContain(word);
    }
  });

  it('has no em dash on it', () => {
    mount();
    expect(text()).not.toContain('—');
  });
});
