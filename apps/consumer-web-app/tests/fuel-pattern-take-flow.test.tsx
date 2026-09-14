// @vitest-environment jsdom
/**
 * The answering experience, driven rather than described.
 *
 * FOUR THINGS ARE PROVED, and each is a way this screen could quietly be
 * wrong on a real phone:
 *
 *   ONE QUESTION IS ON THE SCREEN. This instrument takes a deliberate
 *     exception to the app wide two-to-three questions a screen standard,
 *     and an exception is only worth taking if it actually holds.
 *   TAPPING AN ANSWER NEVER ADVANCES. Selection and navigation are two
 *     separate acts, per the standing rule the check-in's own navigation
 *     fix set. The component under test here is handed a tap and must
 *     report the value and nothing else.
 *   THE PLATE QUESTION IS THREE PICTURES AND ONE ROW. Every plate is a
 *     real button with an accessible name carrying its own words, so a
 *     member using a screen reader hears the proportion described rather
 *     than hearing nothing at all.
 *   THE REVEAL HOLDS, THEN LANDS. "Assessment complete." first, her
 *     pattern after a pause, the interpretation and the rest of the page
 *     after that, and under reduced motion no pause at all. The full
 *     result page has its own file
 *     (tests/fuel-pattern-result-page.test.tsx).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { FuelPatternQuestionScreen, parseFpaOptions } = await import(
  '@/components/fuel-pattern/FuelPatternQuestionScreen'
);
const { FuelPatternResultView } = await import(
  '@/components/fuel-pattern/FuelPatternResultView'
);
const { FPA_QUESTIONS } = await import('@/lib/fuel-pattern/questionContent');
const { FPA_PLATE_QUESTION_KEY, FPA_VITALITY_QUESTION_KEY } = await import(
  '@/lib/fuel-pattern/constants'
);
const { FPA_REVEAL_COPY, FUEL_PATTERN_LABEL, FUEL_PATTERN_INTERPRETATION } = await import(
  '@/lib/fuel-pattern/copy'
);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

let container: HTMLDivElement;
let root: Root;

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
  setReducedMotion(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderQuestion(key: string, onChange: (v: string) => void, value?: string) {
  const authored = FPA_QUESTIONS.find((q) => q.key === key)!;
  const options = parseFpaOptions(
    authored.options.map((o) => (o.detail ? { value: o.value, label: o.label, detail: o.detail } : { value: o.value, label: o.label }))
  );
  act(() => {
    root.render(
      <FuelPatternQuestionScreen
        promptId={`fpa-prompt-${key}`}
        prompt={authored.prompt}
        description={authored.description ?? null}
        options={options}
        value={value}
        onChange={onChange}
        asPlates={key === FPA_PLATE_QUESTION_KEY}
      />
    );
  });
  return authored;
}

describe('one question is on the screen', () => {
  it('draws exactly one prompt and that question\'s own answers', () => {
    const authored = renderQuestion('fpa_q3', () => {});
    const headings = container.querySelectorAll('h2');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe(authored.prompt);

    const rows = container.querySelectorAll('[role="radio"]');
    expect(rows).toHaveLength(authored.options.length);
    expect([...rows].map((r) => r.textContent)).toEqual(authored.options.map((o) => o.label));
  });

  it('labels the answers as one group belonging to that prompt', () => {
    renderQuestion('fpa_q3', () => {});
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-labelledby')).toBe('fpa-prompt-fpa_q3');
  });

  it('carries the vitality question\'s supporting line under the prompt', () => {
    const authored = renderQuestion(FPA_VITALITY_QUESTION_KEY, () => {});
    expect(container.textContent).toContain(authored.description);
    expect(container.textContent).toContain('Prefer not to answer');
  });
});

describe('tapping an answer selects it and does nothing else', () => {
  it('reports the value once and marks the row checked', () => {
    const seen: string[] = [];
    renderQuestion('fpa_q3', (v) => seen.push(v));

    const rows = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[];
    act(() => {
      rows[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(seen).toEqual(['hungry_soon']);

    // Nothing moved: the same question is still on the screen, and the
    // component never asked to go anywhere.
    expect(container.querySelectorAll('h2')).toHaveLength(1);

    renderQuestion('fpa_q3', () => {}, 'hungry_soon');
    const checked = [...container.querySelectorAll('[role="radio"]')].filter(
      (r) => r.getAttribute('aria-checked') === 'true'
    );
    expect(checked).toHaveLength(1);
    expect(checked[0]!.textContent).toContain('Hungry again fairly quickly');
  });
});

describe('the plate question', () => {
  it('draws three plates and one plain row, all of them real buttons', () => {
    renderQuestion(FPA_PLATE_QUESTION_KEY, () => {});
    const rows = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[];
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.tagName === 'BUTTON')).toBe(true);
    expect(container.querySelectorAll('svg')).toHaveLength(3);
  });

  it('gives each plate an accessible name carrying its own words', () => {
    renderQuestion(FPA_PLATE_QUESTION_KEY, () => {});
    const names = [...container.querySelectorAll('[role="radio"]')].map((r) =>
      r.getAttribute('aria-label')
    );
    expect(names[0]).toContain('Protein-forward');
    expect(names[0]).toContain('smaller starch portion');
    expect(names[2]).toContain('Carbohydrate-forward');
    // The fourth answer is not a plate, so it keeps the shared row and its
    // own label rather than an invented one.
    expect(names[3]).toBeNull();
  });

  it('is answerable by a tap, like every other question', () => {
    const seen: string[] = [];
    renderQuestion(FPA_PLATE_QUESTION_KEY, (v) => seen.push(v));
    const rows = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[];
    act(() => {
      rows[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(seen).toEqual(['protein_forward']);
  });
});

describe('the reveal', () => {
  /** The result page reveals its sections on scroll, which jsdom has no observer for. */
  function stubIntersectionObserver() {
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
  }

  const result = { pattern: 'protein_supportive' as const, observations: ['A line she told us.'] };

  beforeEach(() => {
    stubIntersectionObserver();
  });

  it('holds on "Assessment complete." before the pattern arrives', () => {
    act(() => {
      root.render(<FuelPatternResultView result={result} withReveal />);
    });
    expect(container.textContent).toContain(FPA_REVEAL_COPY.completeHeadline);
    expect(container.textContent).not.toContain(FUEL_PATTERN_LABEL.protein_supportive);
  });

  it('lands on the pattern name before the interpretation and the rest of the page', async () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        <FuelPatternResultView
          result={{ pattern: 'flexible_fuel', observations: [] }}
          withReveal
        />
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(2300);
    });
    // Beat two: the eyebrow and the name, and nothing from the page below.
    expect(container.textContent).toContain(FPA_REVEAL_COPY.patternEyebrow);
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.flexible_fuel);
    expect(container.textContent).not.toContain('YOUR STARTING RANGE');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).toContain(FUEL_PATTERN_INTERPRETATION.flexible_fuel);
    expect(container.textContent).toContain('YOUR STARTING RANGE');
    vi.useRealTimers();
  });

  it('skips every pause entirely under reduced motion', async () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    act(() => {
      root.render(<FuelPatternResultView result={result} withReveal />);
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.protein_supportive);
    expect(container.textContent).toContain('YOUR STARTING RANGE');
    vi.useRealTimers();
  });

  it('opens straight on the finished page when she is revisiting a stored reading', () => {
    act(() => {
      root.render(<FuelPatternResultView result={result} withReveal={false} />);
    });
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.protein_supportive);
    expect(container.textContent).toContain('YOUR STARTING RANGE');
    expect(container.textContent).not.toContain(FPA_REVEAL_COPY.completeHeadline);
  });

  it('shows her no raw score, no confidence level and no number of any kind', () => {
    act(() => {
      root.render(<FuelPatternResultView result={result} withReveal={false} />);
    });
    const text = container.textContent ?? '';
    for (const word of ['score', 'Score', 'confidence', 'Confidence', 'tendency']) {
      expect(text, word).not.toContain(word);
    }
    // Every proportion on this page is a word, so a digit anywhere is a
    // number that escaped.
    expect(text, text).not.toMatch(/[0-9]/);
  });
});

describe('the taker itself, at the source', () => {
  const taker = read('components/fuel-pattern/FuelPatternTaker.tsx');

  it('advances only from Continue, never from a selection', () => {
    // The only thing that moves the index is the Continue handler.
    const advanceCalls = taker.match(/setIndex\(/g) ?? [];
    expect(advanceCalls.length).toBeGreaterThan(0);
    expect(taker).not.toMatch(/onChange=\{[^}]*setIndex/);
    expect(taker).toContain("onContinue={() => {");
  });

  it('disables Continue until the question on the screen has an answer', () => {
    expect(taker).toContain('continueDisabled={answers[current.question_key] === undefined}');
  });

  it('draws one question at a time, keyed so each one enters as its own screen', () => {
    expect(taker).toContain('key={current.question_key}');
    expect(read('components/fuel-pattern/FuelPatternQuestionScreen.tsx')).toContain('mef-screen-enter');
  });

  it('draws a thin gold progress line and no percentage', () => {
    expect(taker).toContain('bg-[#C4A050]');
    expect(taker).toContain('h-[3px]');
    expect(taker).not.toMatch(/\d+%\s*(complete|done)/i);
  });
});

/**
 * ONE SAVE IN FLIGHT AT A TIME.
 *
 * Found by driving production: eight questions answered, seven rows
 * stored. A Server Action dispatched while another is still in flight
 * makes the browser abort the one already running, and an aborted request
 * that had not yet committed is an answer that is gone. The only visible
 * sign was a resume putting her back on a question she had answered, and
 * at the end of the assessment the same hole becomes a member who
 * answered all twenty four being told she had not.
 *
 * Asserted at the source, because the defect is about the SHAPE of the
 * dispatch rather than about anything a rendered screen shows.
 */
describe('answers are saved one at a time, and the finish waits for them', () => {
  const taker = read('components/fuel-pattern/FuelPatternTaker.tsx');

  it('chains each save onto the one before it rather than firing them concurrently', () => {
    expect(taker).toContain('saveChain');
    expect(taker).toContain('saveChain.current = saveChain.current');
  });

  it('never dispatches a save inside a transition, which is what made them interrupt each other', () => {
    expect(taker).not.toContain('useTransition');
    expect(taker).not.toContain('startTransition');
  });

  it('retries a failed save once before telling her anything', () => {
    expect(taker).toMatch(/if \(!result\.ok\) result = await submitFpaAnswerAction/);
  });

  it('waits for the chain to drain before asking the server to finish', () => {
    const finishing = taker.slice(taker.indexOf("if (beat !== 'finishing')"));
    const awaitIndex = finishing.indexOf('await saveChain.current');
    const completeIndex = finishing.indexOf('completeFpaAssessmentAction');
    expect(awaitIndex).toBeGreaterThan(-1);
    expect(awaitIndex).toBeLessThan(completeIndex);
  });
});
