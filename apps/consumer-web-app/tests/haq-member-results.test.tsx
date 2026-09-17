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
 * THE MAP IS GROUPED BY THE INSTRUMENT'S OWN TEN PARTS, and no longer stands
 * loudest first. The summary strip already counts her three states, so what
 * the map is for is showing WHERE a result falls in the body system
 * structure, and a colour never moves a section out of its Part. The
 * ordering assertions below are about that, and they are the only thing in
 * this file that changed with it: every approved sentence is still quoted
 * word for word.
 *
 * THE EXPLANATION IS NOW ONE TAP AWAY rather than printed under all twenty
 * one. It stays in the document when the row is closed, so the approved
 * wording is still asserted on the rendered screen exactly as before, and
 * there are new assertions that opening a row really shows it and that only
 * one row is open at a time.
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
  HAQ_BAND_FILL,
  HAQ_RESULT_COLOR_ORDER,
  buildHaqResultCards,
  haqResultCounts,
  haqResultGroups,
  haqTrend,
} = await import('../lib/haq/results');
const copy = await import('../lib/haq/copy');
const { HAQ_PARTS, HAQ_SECTIONS } = await import('../lib/haq/questionBank');

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
  it("is the instrument's own section order, and a colour never moves a section", () => {
    // Deliberately interleaved: a list that sorted by colour fails here.
    const mixed: HaqResultColor[] = HAQ_SECTIONS.map((_, index) =>
      index % 3 === 0 ? 'green' : index % 3 === 1 ? 'red' : 'yellow'
    );

    // Shuffled on the way in, so an implementation that merely kept its
    // input order fails too.
    const shuffled = [...resultsFrom(mixed)].reverse();
    const cards = buildHaqResultCards(shuffled, null);

    expect(cards.map((card) => card.sectionId)).toEqual(HAQ_SECTIONS.map((section) => section.id));

    // And the same 21 colours, still attached to the same 21 sections.
    for (const card of cards) {
      const index = HAQ_SECTIONS.findIndex((section) => section.id === card.sectionId);
      expect(card.resultColor, card.sectionId).toBe(mixed[index]);
    }
  });

  it('groups into the ten Parts, in Part order, each holding its own sections in order', () => {
    const groups = haqResultGroups(buildHaqResultCards(resultsFrom(LIVE_SHAPE), null));

    expect(groups.map((group) => group.partId)).toEqual(HAQ_PARTS.map((part) => part.id));
    expect(groups.map((group) => group.partName)).toEqual(HAQ_PARTS.map((part) => part.name));

    for (const group of groups) {
      const expected = HAQ_SECTIONS.filter((section) => section.partId === group.partId);
      expect(group.cards.map((card) => card.sectionId), group.partId).toEqual(
        expected.map((section) => section.id)
      );
    }
    expect(groups.flatMap((group) => group.cards)).toHaveLength(21);
  });

  it('draws every Part by its real name, and never by its numeral', () => {
    mount(viewOf(LIVE_SHAPE));
    const rendered = text();
    for (const part of HAQ_PARTS) expect(rendered, part.id).toContain(part.name);
    // "Part I of 10" belongs to the question flow, not to her results.
    expect(rendered).not.toMatch(/\bPart\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/);
    expect(rendered).not.toMatch(/\bPart\b/);
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

// ---------------------------------------------------------------------
// The map itself: one colour a row, a bar that says only which band, a
// summary strip that emphasises without filtering, and a row that opens.
// ---------------------------------------------------------------------

function click(node: Element | null | undefined): void {
  expect(node).toBeTruthy();
  act(() => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const rowOf = (sectionId: string) =>
  container.querySelector(`[data-testid="haq-result-card-${sectionId}"]`);
const barOf = (sectionId: string) =>
  container.querySelector(`[data-testid="haq-bar-${sectionId}"]`) as HTMLElement | null;
const panelOf = (sectionId: string) =>
  container.querySelector(`#haq-detail-${sectionId}`) as HTMLElement | null;
const toggleOf = (sectionId: string) => rowOf(sectionId)?.querySelector('button');

describe('one section, one colour, one bar', () => {
  it('every row wears exactly one of the three colours, and it is its own result', () => {
    const view = viewOf(LIVE_SHAPE);
    mount(view);

    for (const card of view.cards) {
      const row = rowOf(card.sectionId);
      expect(row, card.sectionId).toBeTruthy();
      expect(row!.getAttribute('data-result'), card.sectionId).toBe(card.resultColor);

      // The row names its own result in words, beside the colour, so nothing
      // on this page is carried by colour alone.
      expect(row!.textContent, card.sectionId).toContain(APPROVED_LABELS[card.resultColor]);

      // And never a second state's words on the same row.
      for (const other of HAQ_RESULT_COLOR_ORDER) {
        if (other === card.resultColor) continue;
        expect(row!.textContent, `${card.sectionId} / ${other}`).not.toContain(APPROVED_LABELS[other]);
      }
    }
  });

  it('fills a third for Doing Well, two thirds for Needs Attention, and the whole track for High Attention', () => {
    expect(HAQ_BAND_FILL).toEqual({ green: '33%', yellow: '66%', red: '100%' });

    const view = viewOf(LIVE_SHAPE);
    mount(view);

    for (const card of view.cards) {
      const bar = barOf(card.sectionId);
      expect(bar, card.sectionId).toBeTruthy();
      expect(bar!.getAttribute('data-fill'), card.sectionId).toBe(HAQ_BAND_FILL[card.resultColor]);
      expect(bar!.style.width, card.sectionId).toBe(HAQ_BAND_FILL[card.resultColor]);
    }
  });

  it('draws two Red sections identically, whatever sat behind them', () => {
    // The sections do not share a scale, so a bar may never imply that one
    // Red section is worse than another Red section.
    const view = viewOf(LIVE_SHAPE);
    mount(view);
    const reds = view.cards.filter((card) => card.resultColor === 'red');
    expect(reds.length).toBeGreaterThan(1);
    const widths = new Set(reds.map((card) => barOf(card.sectionId)!.style.width));
    expect([...widths]).toEqual(['100%']);
  });

  it('the bar is decoration, and the screen reader is never asked to read it', () => {
    mount(viewOf(LIVE_SHAPE));
    const bar = barOf(HAQ_SECTIONS[0]!.id)!;
    expect(bar.closest('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('a row opens for the sentence, one at a time', () => {
  it('starts closed, opens on a tap, and closes on a second', () => {
    const first = HAQ_SECTIONS[0]!.id;
    mount(viewOf(LIVE_SHAPE));

    expect(toggleOf(first)!.getAttribute('aria-expanded')).toBe('false');
    expect(panelOf(first)!.getAttribute('aria-hidden')).toBe('true');

    click(toggleOf(first));
    expect(toggleOf(first)!.getAttribute('aria-expanded')).toBe('true');
    expect(panelOf(first)!.getAttribute('aria-hidden')).toBe('false');

    click(toggleOf(first));
    expect(toggleOf(first)!.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows that section\'s own approved sentence and no other', () => {
    const view = viewOf(LIVE_SHAPE);
    mount(view);

    for (const sectionId of [HAQ_SECTIONS[0]!.id, HAQ_SECTIONS[14]!.id]) {
      const card = view.cards.find((one) => one.sectionId === sectionId)!;
      click(toggleOf(sectionId));
      const panel = panelOf(sectionId)!;
      expect(panel.textContent!.trim(), sectionId).toBe(APPROVED_EXPLANATIONS[card.resultColor]);
      click(toggleOf(sectionId));
    }
  });

  it('opening a second row closes the first', () => {
    const first = HAQ_SECTIONS[0]!.id;
    const second = HAQ_SECTIONS[1]!.id;
    mount(viewOf(LIVE_SHAPE));

    click(toggleOf(first));
    click(toggleOf(second));

    expect(toggleOf(first)!.getAttribute('aria-expanded')).toBe('false');
    expect(toggleOf(second)!.getAttribute('aria-expanded')).toBe('true');
    expect(
      container.querySelectorAll('[aria-expanded="true"]'),
      'exactly one row open'
    ).toHaveLength(1);
  });
});

describe('the summary strip emphasises, and never filters', () => {
  const sectionOrder = () =>
    Array.from(container.querySelectorAll('[data-testid^="haq-result-card-"]')).map((node) =>
      (node.getAttribute('data-testid') ?? '').replace('haq-result-card-', '')
    );

  it('holds one colour up across the map without reordering or removing a single row', () => {
    const view = viewOf(LIVE_SHAPE);
    mount(view);
    const before = sectionOrder();

    click(container.querySelector('[data-testid="haq-summary-red"]'));

    expect(sectionOrder(), 'nothing reordered and nothing removed').toEqual(before);
    expect(sectionOrder()).toHaveLength(21);

    for (const card of view.cards) {
      expect(rowOf(card.sectionId)!.getAttribute('data-dimmed'), card.sectionId).toBe(
        card.resultColor === 'red' ? 'false' : 'true'
      );
    }
    // Every section is still readable: emphasis steps rows back, it does not
    // take them away.
    for (const section of HAQ_SECTIONS) expect(text(), section.id).toContain(section.title);
  });

  it('a second tap on the same count puts the whole map back', () => {
    mount(viewOf(LIVE_SHAPE));
    const strip = () => container.querySelector('[data-testid="haq-summary-yellow"]')!;

    click(strip());
    expect(strip().getAttribute('aria-pressed')).toBe('true');

    click(strip());
    expect(strip().getAttribute('aria-pressed')).toBe('false');
    for (const section of HAQ_SECTIONS) {
      expect(rowOf(section.id)!.getAttribute('data-dimmed'), section.id).toBe('false');
    }
  });

  it('only one count is held up at a time', () => {
    mount(viewOf(LIVE_SHAPE));
    click(container.querySelector('[data-testid="haq-summary-red"]'));
    click(container.querySelector('[data-testid="haq-summary-green"]'));

    expect(container.querySelector('[data-testid="haq-summary-red"]')!.getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(
      container.querySelector('[data-testid="haq-summary-green"]')!.getAttribute('aria-pressed')
    ).toBe('true');
  });
});

describe('reduced motion is the same page without the travel', () => {
  it('draws every bar at its band width with no transition at all', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    });

    const view = viewOf(LIVE_SHAPE);
    mount(view);

    for (const card of view.cards) {
      const bar = barOf(card.sectionId)!;
      expect(bar.style.width, card.sectionId).toBe(HAQ_BAND_FILL[card.resultColor]);
      expect(bar.style.transition, card.sectionId).toBe('none');
    }

    // @ts-expect-error restoring jsdom's own absence of matchMedia
    delete window.matchMedia;
  });
});
