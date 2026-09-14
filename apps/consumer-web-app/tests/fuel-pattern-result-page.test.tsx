// @vitest-environment jsdom
/**
 * The result page, rendered and read rather than described.
 *
 * WHAT THIS FILE IS FOR. The brief for this screen is mostly about order,
 * about what is on it and about what must never be on it, and every one
 * of those is a property of the rendered text rather than of a function's
 * return value. So the real component is rendered, for all four patterns,
 * and the text a member would actually read is what gets asserted.
 *
 *   1. THE ORDER. Pattern, interpretation, why, range, plate, meals,
 *      experiment, watch for, the button at the foot, in that order, top
 *      to bottom.
 *   2. WHAT IS ON IT. The right range words and the right plate for each
 *      of the four readings.
 *   3. WHAT IS NEVER ON IT. No score, no confidence, no digit outside the
 *      places a digit is allowed, no em dash and no prescriptive
 *      vocabulary.
 *   4. THE HONEST EMPTY STATE. A sitting whose answers supported fewer
 *      than two lines still draws the section, saying so in words.
 *   5. THE EXPERIMENT, which is Build 4: the offer, the approved copy,
 *      the two states of the button at the foot, and the fact that
 *      nothing above it moved when it arrived.
 *
 * THE PAGE IS RENDERED WITH ITS MEALS AND ITS EXPERIMENT ON IT, ALWAYS.
 * Each build added a section, and a guard that kept proving things about
 * the page as it was before that section arrived would be a guard that
 * cannot fail.
 *
 * THE DIGIT RULE CHANGED SHAPE TWICE RATHER THAN BEING DROPPED. Build 3
 * marked every preparation time data-fpa-prep. Build 4 marks every node
 * that legitimately carries a number data-fpa-digits: the experiment's
 * header and invitation, the day counter, the check count, the hunger
 * question's own header and the forward look that now names the
 * experiment. Both sets are removed before the text is read, everything
 * left still has to hold no digit at all, and both sets are separately
 * asserted to really carry digits so that neither is a hiding place.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FuelPatternResultView } from '@/components/fuel-pattern/FuelPatternResultView';
import {
  FPA_RANGE_FOOTNOTE,
  FPA_SECTION_HEADERS,
  FPA_STARTING_RANGE,
  FUEL_PATTERN_INTERPRETATION,
  FUEL_PATTERN_LABEL,
  fpaWatchForCopy,
} from '@/lib/fuel-pattern/copy';
import { FPA_NO_OBSERVATIONS_LINE } from '@/lib/fuel-pattern/observations';
import { FPA_PLATE_GUIDE } from '@/lib/fuel-pattern/plate';
import type { FuelPattern } from '@/lib/fuel-pattern/types';
import type { FpaMealsPayload } from '@/lib/fuel-pattern/meals/memberPayload';
import type { FpaExperimentPayload, FpaExperimentRun } from '@/lib/fuel-pattern/experiment/payload';
import {
  FPA_EXPERIMENT_COMPLETION,
  FPA_EXPERIMENT_DONE_LABEL,
  FPA_EXPERIMENT_HEADER,
  FPA_EXPERIMENT_INVITATION,
  FPA_EXPERIMENT_LOG_LABEL,
  FPA_EXPERIMENT_RESTART_LABEL,
  FPA_EXPERIMENT_START_LABEL,
  fpaExperimentCheckLine,
  fpaExperimentDayLine,
} from '@/lib/fuel-pattern/experiment/copy';
import { FPA_INSIGHT_RULES } from '@/lib/fuel-pattern/experiment/insights';
import type { FpaExperimentCheck } from '@/lib/fuel-pattern/experiment/types';
import {
  orderedOwnPool,
  orderedWiderPool,
  pickSlotMeal,
} from '@/lib/fuel-pattern/meals/selection';
import { FPA_MEAL_TYPES } from '@/lib/fuel-pattern/meals/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PATTERNS: FuelPattern[] = [
  'protein_supportive',
  'balanced_fuel',
  'carb_supportive',
  'flexible_fuel',
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // The sections below the hero reveal on scroll, which jsdom has no
  // observer for. Stubbed so they render at once and can be read.
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
});

function render(
  pattern: FuelPattern,
  observations: string[],
  experiment: FpaExperimentPayload = NOT_STARTED
) {
  act(() => {
    root.render(
      <FuelPatternResultView
        result={{ pattern, observations }}
        withReveal={false}
        meals={mealsFor(pattern)}
        experiment={experiment}
      />
    );
  });
  return container.textContent ?? '';
}

/** The whole page, minus every place a number is allowed to be. */
function renderWithoutNumbers(pattern: FuelPattern, observations: string[]): string {
  render(pattern, observations);
  for (const node of Array.from(
    container.querySelectorAll('[data-fpa-prep], [data-fpa-digits]')
  )) {
    node.remove();
  }
  return container.textContent ?? '';
}

/** Her calendar day, which on this page always arrives from the server. */
const TODAY = '2026-09-14';

function check(
  partial: Partial<FpaExperimentCheck> & { id: string }
): FpaExperimentCheck {
  return {
    loggedOn: TODAY,
    energy: 'steady',
    hunger: 'comfortable',
    clarity: 'normal',
    mealType: null,
    mealId: null,
    createdAt: `${TODAY}T12:00:00.000Z`,
    ...partial,
  };
}

function run(overrides: Partial<FpaExperimentRun> = {}): FpaExperimentRun {
  return {
    id: 'run-1',
    pattern: 'protein_supportive',
    startedOn: TODAY,
    dayNumber: 1,
    status: 'active',
    acknowledged: false,
    checks: [],
    ...overrides,
  };
}

function payload(runValue: FpaExperimentRun | null): FpaExperimentPayload {
  return { todayLocalDate: TODAY, run: runValue, taggableMeals: [] };
}

/** She has never started one. */
const NOT_STARTED = payload(null);

/** Her four cards, built by the real picker over the real library. */
function mealsFor(pattern: FuelPattern): FpaMealsPayload {
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

const OBSERVATIONS = [
  'Protein appears to support your satisfaction and staying power between meals.',
  'Long gaps between meals appear to work against you.',
  'Balanced meals tend to hold your energy well.',
];

describe('1. the order of the page', () => {
  it('runs pattern, interpretation, why, range, plate, meals, experiment, watch for', () => {
    const text = render('protein_supportive', OBSERVATIONS);
    const positions = [
      FUEL_PATTERN_LABEL.protein_supportive,
      FUEL_PATTERN_INTERPRETATION.protein_supportive,
      FPA_SECTION_HEADERS.why,
      FPA_SECTION_HEADERS.range,
      FPA_SECTION_HEADERS.plate,
      'MEALS BUILT FOR YOUR PATTERN',
      FPA_EXPERIMENT_HEADER,
      FPA_SECTION_HEADERS.watchFor,
    ].map((fragment) => {
      const at = text.indexOf(fragment);
      expect(at, fragment).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // The button at the foot is still the last thing on the page, and the
    // only buttons outside the meal cards are the two this section owns:
    // the one inside it and the one at the foot.
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.at(-1)!.getAttribute('data-fpa-bottom-cta')).toBe('true');
    const outside = buttons.filter((button) => !button.closest('[data-fpa-meal-id]'));
    expect(outside.map((button) => button.textContent)).toEqual([
      FPA_EXPERIMENT_START_LABEL,
      FPA_EXPERIMENT_START_LABEL,
    ]);
  });

  it('leads the observations with "You told us:"', () => {
    const text = render('protein_supportive', OBSERVATIONS);
    expect(text.indexOf(FPA_SECTION_HEADERS.whyLeadIn)).toBeGreaterThan(
      text.indexOf(FPA_SECTION_HEADERS.why)
    );
    expect(text.indexOf(OBSERVATIONS[0]!)).toBeGreaterThan(
      text.indexOf(FPA_SECTION_HEADERS.whyLeadIn)
    );
  });
});

describe('2. what is on it, per pattern', () => {
  it('prints the right interpretation and the right range for each of the four', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS);
      expect(text, pattern).toContain(FUEL_PATTERN_LABEL[pattern]);
      expect(text, pattern).toContain(FUEL_PATTERN_INTERPRETATION[pattern]);
      for (const row of FPA_STARTING_RANGE[pattern].rows) {
        expect(text, `${pattern} ${row.nutrient}`).toContain(row.nutrient);
        expect(text, `${pattern} ${row.level}`).toContain(row.level);
      }
      expect(text, pattern).toContain(FPA_RANGE_FOOTNOTE);
    }
  });

  it('gives Flexible Fuel its own extra line and no other pattern one', () => {
    const flexible = render('flexible_fuel', OBSERVATIONS);
    expect(flexible).toContain(FPA_STARTING_RANGE.flexible_fuel.extraLine);
    for (const pattern of PATTERNS) {
      if (pattern === 'flexible_fuel') continue;
      expect(FPA_STARTING_RANGE[pattern].extraLine, pattern).toBeNull();
    }
  });

  it('draws the right plate, names every segment in words, and adds healthy fat', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS);
      const guide = FPA_PLATE_GUIDE[pattern];
      for (const segment of guide.segments) {
        expect(text, `${pattern} ${segment.label}`).toContain(segment.label);
        expect(text, `${pattern} ${segment.proportion}`).toContain(segment.proportion);
      }
      expect(text, pattern).toContain(guide.addition);
      // One drawn plate in the starting plate section, and its wedges add
      // up to the whole plate. Meal cards draw plates of their own, which
      // is why this counts inside the section rather than on the page.
      expect(
        container.querySelectorAll('[data-fpa-starting-plate] svg'),
        pattern
      ).toHaveLength(1);
      const total = guide.shape.reduce((sum, slice) => sum + slice.share, 0);
      expect(total, pattern).toBeCloseTo(1, 6);
    }
  });

  it('captions the Flexible plate, because it is the Balanced plate and has to say why', () => {
    expect(FPA_PLATE_GUIDE.flexible_fuel.shape).toEqual(FPA_PLATE_GUIDE.balanced_fuel.shape);
    const text = render('flexible_fuel', OBSERVATIONS);
    expect(text).toContain('A balanced plate is your natural home base. Vary it freely.');
    expect(render('balanced_fuel', OBSERVATIONS)).not.toContain('natural home base');
  });

  it('names her own pattern in the forward look, and promises nothing', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS);
      expect(text, pattern).toContain(fpaWatchForCopy(pattern));
      expect(text, pattern).toContain(`Your ${FUEL_PATTERN_LABEL[pattern]} starting point`);
    }
  });
});

describe('3. what is never on it', () => {
  it('shows no score, no confidence level and no digit outside the places one is allowed', () => {
    for (const pattern of PATTERNS) {
      const text = renderWithoutNumbers(pattern, OBSERVATIONS);
      for (const word of ['score', 'Score', 'confidence', 'Confidence', 'tendency']) {
        expect(text, `${pattern} ${word}`).not.toContain(word);
      }
      expect(text, pattern).not.toMatch(/[0-9]/);
    }
  });

  it('puts a digit in the prep times and nowhere else, so the guard is not vacuous', () => {
    for (const pattern of PATTERNS) {
      render(pattern, OBSERVATIONS);
      const prepTimes = Array.from(container.querySelectorAll('[data-fpa-prep]'));
      expect(prepTimes.length, pattern).toBe(4);
      for (const node of prepTimes) {
        expect(node.textContent, pattern).toMatch(/^[0-9]+ min$/);
      }
    }
  });

  it('promises nothing that does not exist, and dates nothing it cannot date', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS).toLowerCase();
      for (const word of ['coming soon', 'meal plan', 'log your meals', 'streak']) {
        expect(text, `${pattern} ${word}`).not.toContain(word);
      }
    }
  });

  it('marks every node that carries a digit, so the strip is not a hiding place', () => {
    for (const pattern of PATTERNS) {
      render(pattern, OBSERVATIONS);
      const marked = Array.from(container.querySelectorAll('[data-fpa-digits]'));
      // The experiment header, its invitation, and the forward look that
      // now names it. Every one of them really does carry a number.
      expect(marked.length, pattern).toBeGreaterThanOrEqual(3);
      for (const node of marked) {
        expect(node.textContent, `${pattern} ${node.textContent}`).toMatch(/[0-9]/);
      }
    }
  });

  it('never uses prescriptive or diagnostic vocabulary, and never an em dash', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS);
      for (const phrase of [
        'ideal',
        'macros',
        'requires',
        'must',
        'your metabolism',
        'your body requires',
        'you must eat',
        'perfect macros',
        'biological type',
        'blood sugar',
        'intolerance',
        'diagnos',
      ]) {
        expect(text.toLowerCase(), `${pattern} ${phrase}`).not.toContain(phrase);
      }
      expect(text, pattern).not.toContain('—');
    }
  });
});

describe('4. the honest empty state', () => {
  it('still draws the section, and says what actually happened', () => {
    const text = render('flexible_fuel', []);
    expect(text).toContain(FPA_SECTION_HEADERS.why);
    expect(text).toContain(FPA_NO_OBSERVATIONS_LINE);
    // No lead-in, because there is no list under it to lead into.
    expect(text).not.toContain(FPA_SECTION_HEADERS.whyLeadIn);
    expect(container.querySelectorAll('li').length).toBeGreaterThan(0);
  });
});

/**
 * 5. THE 7 DAY FUEL EXPERIMENT, in every state it can be in, rendered
 * through the real component rather than described.
 */
describe('5. the experiment section', () => {
  it('offers it in the approved words, and puts the offer at the foot too', () => {
    const text = render('protein_supportive', OBSERVATIONS, NOT_STARTED);
    expect(text).toContain(FPA_EXPERIMENT_HEADER);
    expect(text).toContain(FPA_EXPERIMENT_INVITATION);
    const bottom = container.querySelector('[data-fpa-bottom-cta]')!;
    expect(bottom.textContent).toBe(FPA_EXPERIMENT_START_LABEL);
  });

  it('sits between the meals and the forward look, and moves neither of them', () => {
    const text = render('protein_supportive', OBSERVATIONS, NOT_STARTED);
    expect(text.indexOf(FPA_EXPERIMENT_HEADER)).toBeGreaterThan(
      text.indexOf('MEALS BUILT FOR YOUR PATTERN')
    );
    expect(text.indexOf(FPA_EXPERIMENT_HEADER)).toBeLessThan(
      text.indexOf(FPA_SECTION_HEADERS.watchFor)
    );
    // Her range, her plate and her meals are word for word what they were
    // before the section arrived.
    expect(text).toContain(FPA_RANGE_FOOTNOTE);
    expect(text).toContain(FPA_PLATE_GUIDE.protein_supportive.addition);
  });

  it('names the experiment in the forward look, in the approved words', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS, NOT_STARTED);
      expect(text, pattern).toContain(fpaWatchForCopy(pattern));
      expect(text, pattern).toContain('Your 7-Day Fuel Experiment is how it gets tested.');
    }
  });

  it('shows the day, the count and the way to log once a run is going', () => {
    const text = render(
      'protein_supportive',
      OBSERVATIONS,
      payload(run({ checks: [check({ id: 'c1' }), check({ id: 'c2' })] }))
    );
    expect(text).toContain(fpaExperimentDayLine(1));
    expect(text).toContain(fpaExperimentCheckLine(2));
    expect(text).toContain(FPA_EXPERIMENT_LOG_LABEL);
    expect(text).not.toContain(FPA_EXPERIMENT_INVITATION);
    // And the button at the foot has become Continue, because the offer
    // has been taken.
    expect(container.querySelector('[data-fpa-bottom-cta]')!.textContent).toBe('Continue');
  });

  it('shows the standing insight, and only one of them', () => {
    const hungry = Array.from({ length: 3 }, (_, i) =>
      check({ id: `h${i}`, hunger: 'hungry' })
    );
    const text = render('protein_supportive', OBSERVATIONS, payload(run({ checks: hungry })));
    const body = FPA_INSIGHT_RULES.find((rule) => rule.id === 'hungry_soon')!.body;
    expect(text).toContain('WE NOTICED SOMETHING');
    expect(text).toContain(body);
    expect(container.querySelectorAll('[data-fpa-insight]')).toHaveLength(1);
  });

  it('draws the completion state from her real rows once the seventh day has passed', () => {
    const finished = run({
      startedOn: '2026-09-01',
      checks: [check({ id: 'c1' }), check({ id: 'c2' }), check({ id: 'c3' })],
    });
    const text = render('protein_supportive', OBSERVATIONS, payload(finished));
    expect(text).toContain(FPA_EXPERIMENT_COMPLETION.header);
    expect(text).toContain('You logged 3 checks this week.');
    expect(text).toContain(FPA_EXPERIMENT_COMPLETION.closingLine);
    expect(text).toContain(FPA_EXPERIMENT_DONE_LABEL);
  });

  it('says the approved line for a week where nothing qualified', () => {
    const finished = run({ startedOn: '2026-09-01', checks: [check({ id: 'c1' })] });
    const text = render('protein_supportive', OBSERVATIONS, payload(finished));
    expect(text).toContain(FPA_EXPERIMENT_COMPLETION.noInsightLine);
  });

  it('collapses to one quiet line and a restart once she has pressed DONE', () => {
    const done = run({ startedOn: '2026-09-01', acknowledged: true, checks: [] });
    const text = render('protein_supportive', OBSERVATIONS, payload(done));
    expect(text).toContain(FPA_EXPERIMENT_RESTART_LABEL);
    expect(text).not.toContain(FPA_EXPERIMENT_COMPLETION.header);
    expect(text).not.toContain(FPA_EXPERIMENT_DONE_LABEL);
  });

  it('never scolds, never scores and never uses a prescriptive word', () => {
    for (const state of [
      NOT_STARTED,
      payload(run({ checks: [check({ id: 'c1', energy: 'low', hunger: 'hungry' })] })),
      payload(run({ startedOn: '2026-09-01', checks: [] })),
      payload(run({ startedOn: '2026-09-01', acknowledged: true, checks: [] })),
    ]) {
      render('protein_supportive', OBSERVATIONS, state);
      /*
        SCOPED TO THIS SECTION, on purpose. "not a prescription" is an
        approved line in the starting range above it, so a page wide scan
        would be asserting against a sentence this build never touched.
      */
      const text = (
        container.querySelector('[data-fpa-experiment]')?.textContent ?? ''
      ).toLowerCase();
      expect(text.length).toBeGreaterThan(0);
      for (const word of [
        'streak',
        'you missed',
        'you should',
        'you must',
        'required',
        'optimal',
        'ideal',
        'prescription',
        'diagnos',
      ]) {
        expect(text, word).not.toContain(word);
      }
      expect(text).not.toContain('\u2014');
    }
  });
});
