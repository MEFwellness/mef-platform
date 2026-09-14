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
 *   1. THE ORDER. Pattern, interpretation, why, range, plate, watch for,
 *      Continue, in that order, top to bottom.
 *   2. WHAT IS ON IT. The right range words and the right plate for each
 *      of the four readings.
 *   3. WHAT IS NEVER ON IT. No score, no confidence, no digit anywhere,
 *      no em dash, no prescriptive vocabulary, and no mention of a meal
 *      system or an experiment, because neither exists yet.
 *   4. THE HONEST EMPTY STATE. A sitting whose answers supported fewer
 *      than two lines still draws the section, saying so in words.
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

function render(pattern: FuelPattern, observations: string[]) {
  act(() => {
    root.render(<FuelPatternResultView result={{ pattern, observations }} withReveal={false} />);
  });
  return container.textContent ?? '';
}

const OBSERVATIONS = [
  'Protein appears to support your satisfaction and staying power between meals.',
  'Long gaps between meals appear to work against you.',
  'Balanced meals tend to hold your energy well.',
];

describe('1. the order of the page', () => {
  it('runs pattern, interpretation, why, range, plate, watch for, Continue', () => {
    const text = render('protein_supportive', OBSERVATIONS);
    const positions = [
      FUEL_PATTERN_LABEL.protein_supportive,
      FUEL_PATTERN_INTERPRETATION.protein_supportive,
      FPA_SECTION_HEADERS.why,
      FPA_SECTION_HEADERS.range,
      FPA_SECTION_HEADERS.plate,
      FPA_SECTION_HEADERS.watchFor,
    ].map((fragment) => {
      const at = text.indexOf(fragment);
      expect(at, fragment).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe('Continue');
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
      // One drawn plate, and its wedges add up to the whole plate.
      expect(container.querySelectorAll('svg'), pattern).toHaveLength(1);
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
  it('shows no score, no confidence level and no digit anywhere', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS);
      for (const word of ['score', 'Score', 'confidence', 'Confidence', 'tendency']) {
        expect(text, `${pattern} ${word}`).not.toContain(word);
      }
      expect(text, pattern).not.toMatch(/[0-9]/);
    }
  });

  it('never mentions a meal system, a 7 day experiment, a check-in or meal feedback', () => {
    for (const pattern of PATTERNS) {
      const text = render(pattern, OBSERVATIONS).toLowerCase();
      for (const word of [
        'experiment',
        'check-in',
        'check in',
        'coming soon',
        '7 day',
        'seven day',
        'meal plan',
        'log your meals',
      ]) {
        expect(text, `${pattern} ${word}`).not.toContain(word);
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
