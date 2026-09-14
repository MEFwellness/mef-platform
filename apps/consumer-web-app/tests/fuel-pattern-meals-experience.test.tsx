// @vitest-environment jsdom
/**
 * THE MEAL SECTION, DRIVEN RATHER THAN DESCRIBED.
 *
 * The brief for this section is almost entirely about what happens when
 * she taps something, and none of that is a property of a function's
 * return value. So the real component is rendered and the real buttons
 * are pressed.
 *
 *   1. FOUR CARDS, one per part of the day, all from her own pattern.
 *   2. SHOW ME ANOTHER cycles all six before repeating, stays in the
 *      slot, and tells the server without ever calling a Server Action.
 *   3. I DO NOT EAT THIS swaps the card immediately and records the meal
 *      with no reason at all, because the tap is already a complete
 *      answer.
 *   4. A STANDING REASON REACHES EVERY SLOT IN THE SAME TICK, not just
 *      the card she was looking at.
 *   5. SAVE fills in and tapping again empties.
 *
 * fetch is replaced so every call can be read back. That is also what
 * proves the third rule: the record has to arrive with reason null.
 *
 * THE SHEET IS LOOKED FOR ON THE DOCUMENT, NOT INSIDE THE SECTION. It is
 * drawn in ModalOverlay, which portals to the body so that no transformed
 * ancestor can capture it, and a test that searched the component's own
 * subtree would report it missing while it was on the screen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FuelMealsSection } from '@/components/fuel-pattern/meals/FuelMealsSection';
import { FPA_MEALS } from '@/lib/fuel-pattern/meals/library';
import { FPA_MEAL_CARD_COPY, FPA_REASON_LABEL } from '@/lib/fuel-pattern/meals/copy';
import type { FpaMealsPayload } from '@/lib/fuel-pattern/meals/memberPayload';
import {
  orderedOwnPool,
  orderedWiderPool,
  pickSlotMeal,
} from '@/lib/fuel-pattern/meals/selection';
import { FPA_MEAL_TYPES, type FpaMealType } from '@/lib/fuel-pattern/meals/types';
import type { FuelPattern } from '@/lib/fuel-pattern/types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let sent: Array<Record<string, unknown>>;

function payloadFor(pattern: FuelPattern): FpaMealsPayload {
  const slots = FPA_MEAL_TYPES.map((type) => {
    const ownPool = orderedOwnPool(pattern, type, 'member-under-test');
    const widerPool = orderedWiderPool(pattern, type);
    const pick = pickSlotMeal({
      ownPool,
      widerPool,
      filter: { rejectedMealIds: [], exclusions: [] },
      advance: false,
    });
    return {
      type,
      ownPool,
      widerPool,
      state: pick.state,
      mealId: pick.meal?.id ?? null,
      widened: pick.widened,
    };
  });
  return { pattern, slots, rejectedMealIds: [], exclusions: [], savedMealIds: [] };
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
  });

  // The sheet holds the body scroll lock, which restores the scroll
  // position on release. jsdom has no scrollTo, and its "not implemented"
  // is noise rather than a failure.
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => {},
  });

  class Stub {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: Stub,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(pattern: FuelPattern = 'balanced_fuel') {
  act(() => {
    root.render(<FuelMealsSection payload={payloadFor(pattern)} />);
  });
}

function cardFor(type: FpaMealType): HTMLElement {
  const card = container.querySelector<HTMLElement>(`article[data-fpa-meal-type="${type}"]`);
  expect(card, `no card for ${type}`).not.toBeNull();
  return card!;
}

function mealIdIn(type: FpaMealType): string {
  return cardFor(type).getAttribute('data-fpa-meal-id')!;
}

/** The reason sheet is portalled to the body, so it is looked for there. */
function reasonSheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="fpa-meal-reason-sheet"]');
}

function press(element: Element | null | undefined) {
  expect(element, 'nothing to press').not.toBeNull();
  act(() => {
    (element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('1. the four cards', () => {
  it('draws one card per part of the day, all from her own set', () => {
    render('protein_supportive');
    const cards = container.querySelectorAll('article[data-fpa-meal-id]');
    expect(cards).toHaveLength(4);
    for (const type of FPA_MEAL_TYPES) {
      const meal = FPA_MEALS.find((m) => m.id === mealIdIn(type))!;
      expect(meal.type).toBe(type);
      expect(meal.pattern).toBe('protein_supportive');
    }
  });

  it('appends the Flexible Fuel sentence for a flexible reading and not for a balanced one', () => {
    render('flexible_fuel');
    expect(container.textContent).toContain('With your flexible pattern');
    act(() => root.render(<FuelMealsSection payload={payloadFor('balanced_fuel')} />));
    expect(container.textContent).not.toContain('With your flexible pattern');
  });
});

describe('2. show me another', () => {
  it('cycles all six of that slot before any of them comes back', () => {
    render('balanced_fuel');
    const seen = [mealIdIn('lunch')];
    for (let i = 0; i < 5; i += 1) {
      press(cardFor('lunch').querySelector('[data-fpa-another]'));
      seen.push(mealIdIn('lunch'));
    }
    expect(new Set(seen).size).toBe(6);
    for (const id of seen) {
      const meal = FPA_MEALS.find((m) => m.id === id)!;
      expect(meal.type).toBe('lunch');
      expect(meal.pattern).toBe('balanced_fuel');
    }
  });

  it('moves only the slot she tapped', () => {
    render('balanced_fuel');
    const before = { breakfast: mealIdIn('breakfast'), dinner: mealIdIn('dinner') };
    press(cardFor('lunch').querySelector('[data-fpa-another]'));
    expect(mealIdIn('breakfast')).toBe(before.breakfast);
    expect(mealIdIn('dinner')).toBe(before.dinner);
  });

  it('records the swap over the route handler, with the slot it belongs to', () => {
    render('balanced_fuel');
    press(cardFor('dinner').querySelector('[data-fpa-another]'));
    const last = sent.at(-1)!;
    expect(last.action).toBe('slot');
    expect(last.mealType).toBe('dinner');
    expect(last.pattern).toBe('balanced_fuel');
    expect(last.currentMealId).toBe(mealIdIn('dinner'));
  });
});

describe('3. I do not eat this', () => {
  it('swaps the card at once and records the meal with no reason', () => {
    render('balanced_fuel');
    const declined = mealIdIn('breakfast');
    press(cardFor('breakfast').querySelector('[data-fpa-reject]'));

    expect(mealIdIn('breakfast')).not.toBe(declined);
    const rejection = sent.find((body) => body.action === 'reject')!;
    expect(rejection.mealId).toBe(declined);
    expect(rejection.reason).toBeNull();
  });

  it('never brings that meal back however many times she taps', () => {
    render('balanced_fuel');
    const declined = mealIdIn('snack');
    press(cardFor('snack').querySelector('[data-fpa-reject]'));
    const skip = reasonSheet()!.querySelectorAll('button');
    press(skip[skip.length - 1]);
    for (let i = 0; i < 10; i += 1) {
      expect(mealIdIn('snack')).not.toBe(declined);
      press(cardFor('snack').querySelector('[data-fpa-another]'));
    }
  });

  it('opens a sheet that can be left without answering', () => {
    render('balanced_fuel');
    press(cardFor('lunch').querySelector('[data-fpa-reject]'));
    const sheet = reasonSheet();
    expect(sheet).not.toBeNull();
    // The last button on the sheet is Skip, and it closes it.
    const buttons = sheet!.querySelectorAll('button');
    press(buttons[buttons.length - 1]);
    expect(document.querySelector('[data-testid="fpa-meal-reason-sheet"]')).toBeNull();
  });
});

describe('4. a standing reason reaches every slot', () => {
  it('takes dairy off all four cards the moment No dairy is recorded', () => {
    render('balanced_fuel');
    press(cardFor('breakfast').querySelector('[data-fpa-reject]'));

    const sheet = reasonSheet()!;
    const noDairy = [...sheet.querySelectorAll('button')].find(
      (button) => button.textContent === FPA_REASON_LABEL.no_dairy
    );
    press(noDairy);

    for (const type of FPA_MEAL_TYPES) {
      const meal = FPA_MEALS.find((m) => m.id === mealIdIn(type))!;
      expect(meal.flags, `${type} still shows dairy`).toContain('dairy_free');
    }

    // And it keeps holding through the rest of the rotation.
    for (let i = 0; i < 6; i += 1) {
      press(cardFor('dinner').querySelector('[data-fpa-another]'));
      expect(FPA_MEALS.find((m) => m.id === mealIdIn('dinner'))!.flags).toContain('dairy_free');
    }
  });

  it('sends the reason to the server so the rule outlives the page', () => {
    render('balanced_fuel');
    press(cardFor('breakfast').querySelector('[data-fpa-reject]'));
    const sheet = reasonSheet()!;
    press(
      [...sheet.querySelectorAll('button')].find(
        (button) => button.textContent === FPA_REASON_LABEL.vegetarian
      )
    );
    const reasoned = sent.filter((body) => body.action === 'reject' && body.reason === 'vegetarian');
    expect(reasoned).toHaveLength(1);
  });
});

describe('5. save', () => {
  it('fills in on the first tap and empties on the second', () => {
    render('balanced_fuel');
    const saveButton = () => cardFor('lunch').querySelector('[data-fpa-save]')!;
    expect(saveButton().textContent).toContain(FPA_MEAL_CARD_COPY.save);

    press(saveButton());
    expect(saveButton().getAttribute('aria-pressed')).toBe('true');
    expect(saveButton().textContent).toContain(FPA_MEAL_CARD_COPY.saved);
    expect(sent.at(-1)).toMatchObject({ action: 'save', saved: true });

    press(saveButton());
    expect(saveButton().getAttribute('aria-pressed')).toBe('false');
    expect(sent.at(-1)).toMatchObject({ action: 'save', saved: false });
  });
});

describe('6. it never calls a Server Action', () => {
  it('sends everything it sends to the meal route handler', () => {
    render('balanced_fuel');
    press(cardFor('lunch').querySelector('[data-fpa-another]'));
    press(cardFor('lunch').querySelector('[data-fpa-save]'));
    expect(sent.length).toBeGreaterThan(0);
    // Every body is one of the three the route accepts, and nothing else
    // left this component at all.
    for (const body of sent) {
      expect(['slot', 'reject', 'save']).toContain(body.action);
    }
  });
});
