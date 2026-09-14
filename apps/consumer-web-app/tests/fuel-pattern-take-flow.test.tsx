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
 *   THE REVEAL HOLDS, THEN LANDS. "Assessment complete" first, her
 *     pattern after a pause, and under reduced motion no pause at all.
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
const { FuelPatternReveal } = await import('@/components/fuel-pattern/FuelPatternReveal');
const { FPA_QUESTIONS } = await import('@/lib/fuel-pattern/questionContent');
const { FPA_PLATE_QUESTION_KEY, FPA_VITALITY_QUESTION_KEY } = await import(
  '@/lib/fuel-pattern/constants'
);
const { FPA_REVEAL_COPY, FUEL_PATTERN_LABEL, FUEL_PATTERN_SENTENCE } = await import(
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
  it('holds on "Assessment complete" before the pattern arrives', () => {
    act(() => {
      root.render(<FuelPatternReveal pattern="protein_supportive" />);
    });
    expect(container.textContent).toContain(FPA_REVEAL_COPY.completeHeadline);
    expect(container.textContent).not.toContain(FUEL_PATTERN_LABEL.protein_supportive);
  });

  it('lands on the pattern with one sentence and one Continue', async () => {
    vi.useFakeTimers();
    act(() => {
      root.render(<FuelPatternReveal pattern="flexible_fuel" />);
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).toContain(FPA_REVEAL_COPY.patternEyebrow);
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.flexible_fuel);
    expect(container.textContent).toContain(FUEL_PATTERN_SENTENCE.flexible_fuel);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('skips the pause entirely under reduced motion', async () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    act(() => {
      root.render(<FuelPatternReveal pattern="balanced_fuel" />);
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.balanced_fuel);
    vi.useRealTimers();
  });

  it('opens straight on the pattern when a reload landed her back on it', () => {
    act(() => {
      root.render(<FuelPatternReveal pattern="carb_supportive" startAtPattern />);
    });
    expect(container.textContent).toContain(FUEL_PATTERN_LABEL.carb_supportive);
    expect(container.textContent).not.toContain(FPA_REVEAL_COPY.completeHeadline);
  });

  it('shows her no raw score, no confidence level and no tendency', () => {
    act(() => {
      root.render(<FuelPatternReveal pattern="protein_supportive" startAtPattern />);
    });
    const text = container.textContent ?? '';
    for (const word of ['score', 'Score', 'confidence', 'Confidence', 'High', 'Moderate', 'Low']) {
      expect(text, word).not.toContain(word);
    }
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
