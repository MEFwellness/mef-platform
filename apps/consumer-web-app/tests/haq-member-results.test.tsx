// @vitest-environment jsdom

/**
 * HER HEALTH APPRAISAL RESULTS PAGE: what it says, in what order, and what
 * it can never carry.
 *
 * THE APPROVED WORDING IS QUOTED HERE A SECOND TIME, taken from the build
 * prompt rather than from lib/haq/copy.ts, so a reworded constant fails here
 * instead of shipping. The title, the intro and all three explanations are
 * approved word for word.
 *
 * THE PAYLOAD CARRIES NO NUMBER AT ALL. The three counts she reads are
 * counted from the cards on the way to the screen, which is what lets this
 * suite assert the view is empty of numbers outright: no total, no cutoff,
 * no hidden value and no overall grade can hide among them.
 *
 * What the database gives her is proved against the real database in
 * tests/haq-coach-integration.test.ts. Here the results are the rows the
 * database would have returned.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { HaqResults } = await import('../components/haq/HaqResults');
const {
  HAQ_RESULT_COLOR_ORDER,
  buildHaqResultCards,
  haqResultCounts,
  haqTrend,
} = await import('../lib/haq/results');
const copy = await import('../lib/haq/copy');
const { HAQ_SECTIONS } = await import('../lib/haq/questionBank');

import type { HaqMemberSectionResult, HaqResultColor } from '../lib/haq/types';
import type { HaqMemberResults } from '../lib/haq/results';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// ---------------------------------------------------------------------
// The approved wording, a second copy.
// ---------------------------------------------------------------------

const APPROVED_TITLE = 'HEALTH APPRAISAL RESULTS';

const APPROVED_INTRO =
  'Your answers help show which areas are currently quieter and which may deserve more attention.';

const APPROVED_EXPLANATIONS: Record<HaqResultColor, string> = {
  green: 'This area is currently showing fewer reported concerns.',
  yellow: 'This area is showing enough reported signals to be worth paying attention to.',
  red: 'This area is showing a stronger group of reported concerns and may be worth reviewing more closely with your coach or healthcare professional.',
};

const APPROVED_COMPARISON_LINE = 'Compared with your previous Health Appraisal, based on what you reported.';

const APPROVED_LABELS: Record<HaqResultColor, string> = {
  green: 'Doing Well',
  yellow: 'Needs Attention',
  red: 'High Attention',
};

// ---------------------------------------------------------------------
// Fixtures: the rows haq_member_section_results() would return.
// ---------------------------------------------------------------------

/**
 * THE SITTING THE TEST MEMBER ACTUALLY HAS ON PRODUCTION: 13 Red, 1 Yellow,
 * 7 Green. Assigned to real section ids in the instrument's own order, so
 * the ordering assertions below are about real sections.
 */
const LIVE_SHAPE: HaqResultColor[] = [
  'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red',
  'yellow',
  'green', 'green', 'green', 'green', 'green', 'green', 'green',
];

function resultsFrom(colors: readonly HaqResultColor[]): HaqMemberSectionResult[] {
  return HAQ_SECTIONS.map((section, index) => {
    const color = colors[index]!;
    return {
      sectionId: section.id,
      resultColor: color,
      memberResultLabel: APPROVED_LABELS[color] as HaqMemberSectionResult['memberResultLabel'],
    };
  });
}

function viewOf(
  colors: readonly HaqResultColor[],
  previous: readonly HaqResultColor[] | null = null
): HaqMemberResults {
  const before = previous ? resultsFrom(previous) : null;
  return {
    completedAt: '2026-09-17T14:00:00.000Z',
    cards: buildHaqResultCards(resultsFrom(colors), before),
    hasPrevious: before !== null,
  };
}

// ---------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(results: HaqMemberResults) {
  act(() => {
    root.render(<HaqResults results={results} />);
  });
}

const text = () => container.textContent ?? '';

/** Every number anywhere inside a value, with the path it sits at. */
function numericLeaves(value: unknown, at = '$'): string[] {
  if (typeof value === 'number') return [at];
  if (Array.isArray(value)) return value.flatMap((item, index) => numericLeaves(item, `${at}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => numericLeaves(item, `${at}.${key}`));
  }
  return [];
}

// ---------------------------------------------------------------------

describe('the order the areas stand in', () => {
  it('is Red, then Yellow, then Green, and inside one colour the instrument\'s own section order', () => {
    // Deliberately interleaved, so a list that merely kept its input order fails.
    const mixed: HaqResultColor[] = HAQ_SECTIONS.map((_, index) =>
      index % 3 === 0 ? 'green' : index % 3 === 1 ? 'red' : 'yellow'
    );
    const cards = buildHaqResultCards(resultsFrom(mixed), null);

    const colors = cards.map((card) => card.resultColor);
    const firstYellow = colors.indexOf('yellow');
    const firstGreen = colors.indexOf('green');
    expect(colors.lastIndexOf('red')).toBeLessThan(firstYellow);
    expect(colors.lastIndexOf('yellow')).toBeLessThan(firstGreen);

    for (const color of HAQ_RESULT_COLOR_ORDER) {
      const orders = cards
        .filter((card) => card.resultColor === color)
        .map((card) => HAQ_SECTIONS.findIndex((section) => section.id === card.sectionId));
      expect([...orders], color).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it('holds all 21 sections, once each, and the three counts always sum to 21', () => {
    for (const shape of [LIVE_SHAPE, HAQ_SECTIONS.map(() => 'green' as const), HAQ_SECTIONS.map(() => 'red' as const)]) {
      const cards = buildHaqResultCards(resultsFrom(shape), null);
      expect(cards).toHaveLength(21);
      expect(new Set(cards.map((card) => card.sectionId)).size).toBe(21);
      const counts = haqResultCounts(cards);
      expect(counts.red + counts.yellow + counts.green).toBe(21);
    }
    expect(haqResultCounts(buildHaqResultCards(resultsFrom(LIVE_SHAPE), null))).toEqual({
      red: 13,
      yellow: 1,
      green: 7,
    });
  });
});

describe('the approved copy, word for word', () => {
  it('the title and the intro', () => {
    expect(copy.HAQ_RESULTS_TITLE).toBe(APPROVED_TITLE);
    expect(copy.HAQ_RESULTS_INTRO).toBe(APPROVED_INTRO);
    mount(viewOf(LIVE_SHAPE));
    expect(text()).toContain(APPROVED_TITLE);
    expect(text()).toContain(APPROVED_INTRO);
  });

  it('all three explanations, and each colour gets its own and no other', () => {
    expect(copy.HAQ_RESULT_EXPLANATIONS).toEqual(APPROVED_EXPLANATIONS);

    // Every colour is present in this shape, so all three reach the screen.
    mount(viewOf(['red', ...HAQ_SECTIONS.slice(1).map((_, i) => (i % 2 ? 'yellow' : 'green') as HaqResultColor)]));
    for (const color of HAQ_RESULT_COLOR_ORDER) {
      expect(text(), color).toContain(APPROVED_EXPLANATIONS[color]);
    }

    const cards = buildHaqResultCards(resultsFrom(LIVE_SHAPE), null);
    for (const card of cards) expect(card.explanation, card.sectionId).toBe(APPROVED_EXPLANATIONS[card.resultColor]);
  });

  it('the summary block names all three states with her own counts, and never writes "1 areas"', () => {
    mount(viewOf(LIVE_SHAPE));
    const summary = container.querySelector('[data-testid="haq-results-summary"]')!.textContent ?? '';
    expect(summary).toContain('High Attention');
    expect(summary).toContain('13 areas');
    expect(summary).toContain('Needs Attention');
    expect(summary).toContain('1 area');
    expect(summary).not.toContain('1 areas');
    expect(summary).toContain('Doing Well');
    expect(summary).toContain('7 areas');
  });

  it('names every one of the 21 sections by its own stored name', () => {
    mount(viewOf(LIVE_SHAPE));
    for (const section of HAQ_SECTIONS) expect(text(), section.id).toContain(section.title);
  });
});

describe('no score, no grade and no number of the instrument reaches her', () => {
  it('the page props carry no number at all', () => {
    for (const view of [viewOf(LIVE_SHAPE), viewOf(LIVE_SHAPE, HAQ_SECTIONS.map(() => 'green' as const))]) {
      expect(numericLeaves(view)).toEqual([]);
      expect(JSON.stringify(view)).not.toMatch(
        /hidden_value|hiddenValue|raw_total|rawTotal|green_max|yellow_max|cutoff|points|score|priority/i
      );
    }
  });

  it('the rendered screen shows no total, percentage, overall result or priority word', () => {
    mount(viewOf(LIVE_SHAPE, HAQ_SECTIONS.map(() => 'green' as const)));
    const rendered = text();
    // The only digits she may read are the three area counts.
    const digits = rendered.match(/\d+/g) ?? [];
    expect(digits.sort()).toEqual(['1', '13', '7'].sort());
    expect(rendered).not.toMatch(/%|overall|total|out of|Low Priority|Moderate Priority|High Priority|grade/i);
  });

  it('describes reported symptoms, never a condition', () => {
    mount(viewOf(LIVE_SHAPE, HAQ_SECTIONS.map(() => 'green' as const)));
    const rendered = text();
    expect(rendered).not.toMatch(
      /diagnos|disease|disorder|condition|your thyroid is|you have\b|illness|symptom of|treat(ment)?\b/i
    );
    // Each of the three explanations says what an AREA is showing.
    for (const explanation of Object.values(APPROVED_EXPLANATIONS)) {
      expect(explanation).toMatch(/^This area is/);
    }
  });
});

describe('the trend, and only when there is something to compare with', () => {
  it('an improved colour is Quieter, the same colour is Unchanged, a worsened colour is Louder', () => {
    expect(haqTrend('red', 'green')).toBe('quieter');
    expect(haqTrend('red', 'yellow')).toBe('quieter');
    expect(haqTrend('yellow', 'green')).toBe('quieter');
    expect(haqTrend('green', 'green')).toBe('unchanged');
    expect(haqTrend('yellow', 'yellow')).toBe('unchanged');
    expect(haqTrend('red', 'red')).toBe('unchanged');
    expect(haqTrend('green', 'yellow')).toBe('louder');
    expect(haqTrend('green', 'red')).toBe('louder');
    expect(haqTrend('yellow', 'red')).toBe('louder');
  });

  it('every section carries its own chip, and the comparison line stands at the top', () => {
    // Section by section: the first was Red and is Green, the second was
    // Green and is Green, the third was Green and is Red.
    const previous: HaqResultColor[] = HAQ_SECTIONS.map((_, index) => (index === 0 ? 'red' : 'green'));
    const current: HaqResultColor[] = HAQ_SECTIONS.map((_, index) => (index === 2 ? 'red' : 'green'));

    const view = viewOf(current, previous);
    mount(view);
    expect(container.querySelector('[data-testid="haq-results-comparison-line"]')?.textContent).toBe(
      APPROVED_COMPARISON_LINE
    );
    expect(copy.HAQ_RESULTS_COMPARISON_LINE).toBe(APPROVED_COMPARISON_LINE);

    const trendOf = (sectionId: string) =>
      view.cards.find((card) => card.sectionId === sectionId)?.trend ?? null;
    expect(trendOf(HAQ_SECTIONS[0]!.id)).toBe('quieter');
    expect(trendOf(HAQ_SECTIONS[1]!.id)).toBe('unchanged');
    expect(trendOf(HAQ_SECTIONS[2]!.id)).toBe('louder');

    // Every one of the 21 carries a chip, and each chip is one of the three words.
    expect(view.cards.filter((card) => card.trend !== null)).toHaveLength(21);
    const chips = Array.from(container.querySelectorAll('[data-testid^="haq-trend-"]')).map(
      (node) => node.textContent
    );
    expect(chips).toHaveLength(21);
    expect(new Set(chips).size).toBeGreaterThan(1);
    for (const chip of chips) expect(['Quieter', 'Unchanged', 'Louder']).toContain(chip);
  });

  it('a first sitting has no chip and no comparison line', () => {
    const view = viewOf(LIVE_SHAPE);
    expect(view.hasPrevious).toBe(false);
    expect(view.cards.every((card) => card.trend === null)).toBe(true);

    mount(view);
    expect(container.querySelector('[data-testid="haq-results-comparison-line"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid^="haq-trend-"]')).toHaveLength(0);
    expect(text()).not.toMatch(/Quieter|Unchanged|Louder|Compared with/);
  });

  it('never frames a trend as getting better or getting worse', () => {
    mount(viewOf(HAQ_SECTIONS.map(() => 'green' as const), HAQ_SECTIONS.map(() => 'red' as const)));
    expect(text()).not.toMatch(
      /improv|worse|better|deteriorat|declin|recover|relaps|progress(ing)?\b|healed|cured/i
    );
  });

  it('a section the earlier sitting did not carry gets no chip rather than a guessed one', () => {
    const cards = buildHaqResultCards(resultsFrom(LIVE_SHAPE), [
      { sectionId: HAQ_SECTIONS[0]!.id, resultColor: 'green', memberResultLabel: 'Doing Well' },
    ]);
    expect(cards.find((card) => card.sectionId === HAQ_SECTIONS[0]!.id)?.trend).toBe('louder');
    expect(cards.filter((card) => card.trend !== null)).toHaveLength(1);
  });
});

const EM_DASH = String.fromCharCode(0x2014);

describe('no em dash in anything she reads on this page', () => {
  it('the copy and the rendered screen', () => {
    for (const value of Object.values(copy.HAQ_RESULT_EXPLANATIONS)) expect(value).not.toContain(EM_DASH);
    for (const value of Object.values(copy.HAQ_TREND_LABELS)) expect(value).not.toContain(EM_DASH);
    for (const value of [
      copy.HAQ_RESULTS_TITLE,
      copy.HAQ_RESULTS_INTRO,
      copy.HAQ_RESULTS_COMPARISON_LINE,
      copy.HAQ_RESULTS_SUMMARY_HEADING,
      copy.HAQ_SEE_RESULTS_LABEL,
    ]) {
      expect(value).not.toContain(EM_DASH);
    }
    mount(viewOf(LIVE_SHAPE, HAQ_SECTIONS.map(() => 'green' as const)));
    expect(text()).not.toContain(EM_DASH);
  });
});
