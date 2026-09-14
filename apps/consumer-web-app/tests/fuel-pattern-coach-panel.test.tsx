// @vitest-environment jsdom
/**
 * The coach's Fuel Pattern card, rendered.
 *
 * THREE THINGS ARE PROVED HERE, and each is a way this card could be
 * quietly wrong on a real client page:
 *
 *   1. IT SHOWS HIM EVERYTHING HE IS OWED. Pattern, confidence, all three
 *      raw scores, tendencies, ambiguous areas, the discomfort signal,
 *      her vitality answer, and every sitting over time.
 *   2. IT IS READ ONLY. No button that writes, and no write anywhere in
 *      the module that feeds it. A panel is a render, and a render never
 *      decides anything.
 *   3. IT IS ON THE PAGE AND FINDABLE. The card is wired into the coach
 *      detail page and indexed in the pinned search, because a panel
 *      nothing renders is a result that lands nowhere.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FuelPatternPanel } from '@/app/coach/clients/[id]/FuelPatternPanel';
import { buildFpaCoachReading } from '@/lib/fuel-pattern/coachView';
import { computeFpaScoring } from '@/lib/fuel-pattern/scoring';
import { FPA_QUESTIONS } from '@/lib/fuel-pattern/questionContent';
import { FPA_LABEL } from '@/lib/fuel-pattern/constants';
import {
  FPA_DIGESTION_QUESTION_KEY,
  FPA_DIGESTIVE_DISCOMFORT_VALUE,
  FPA_VITALITY_QUESTION_KEY,
} from '@/lib/fuel-pattern/constants';
import type { CoachFuelPatternPanelState } from '@/app/actions/fuelPatternCoach';
import type { FpaWeightClass } from '@/lib/fuel-pattern/types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(__dirname, '..');

function optionValue(questionKey: string, weight: FpaWeightClass): string {
  const question = FPA_QUESTIONS.find((q) => q.key === questionKey)!;
  return (question.options.find((o) => o.weight === weight) ?? question.options[0]!).value;
}

function sitting(base: FpaWeightClass, overrides: Record<string, string> = {}) {
  const responses: Record<string, string> = {};
  for (const question of FPA_QUESTIONS) responses[question.key] = optionValue(question.key, base);
  return { ...responses, ...overrides };
}

function toSitting(id: string, completedAt: string, responses: Record<string, string>) {
  const scoring = computeFpaScoring(responses);
  return {
    id,
    sessionId: `session-${id}`,
    completedAt,
    reading: buildFpaCoachReading({
      pattern: scoring.pattern,
      confidence: scoring.confidence,
      scores: scoring.scores,
      scoredQuestionCount: scoring.scoredQuestionCount,
      zeroWeightCount: scoring.zeroWeightCount,
      responses: scoring.responses,
      tendencies: scoring.tendencies,
      digestiveDiscomfort: scoring.digestiveDiscomfort,
      vitalityResponse: scoring.vitalityResponse,
    }),
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(state: CoachFuelPatternPanelState) {
  act(() => {
    root.render(<FuelPatternPanel state={state} />);
  });
  return container.textContent ?? '';
}

/** Nothing recorded on her meal cards. Build 3's block draws one line and no control. */
const NO_MEALS = { preferences: [], rejections: [], savedCount: 0, saved: [] };

const EMPTY: CoachFuelPatternPanelState = {
  memberId: 'member-1',
  sittings: [],
  primalSittings: [],
  meals: NO_MEALS,
};

describe('1. what the coach sees', () => {
  const responses = sitting('protein', {
    fpa_q7: optionValue('fpa_q7', 'tendency'),
    fpa_q2: optionValue('fpa_q2', 'neutral'),
    [FPA_DIGESTION_QUESTION_KEY]: FPA_DIGESTIVE_DISCOMFORT_VALUE,
    [FPA_VITALITY_QUESTION_KEY]: 'comes_and_goes',
  });
  const state: CoachFuelPatternPanelState = {
    memberId: 'member-1',
    sittings: [toSitting('a', '2026-09-12T10:00:00.000Z', responses)],
    primalSittings: [],
    meals: NO_MEALS,
  };

  it('names the instrument, the pattern and the confidence level', () => {
    const text = render(state);
    expect(text).toContain(FPA_LABEL);
    expect(text).toContain('Protein-Supportive');
    expect(text).toContain('Confidence: High');
  });

  it('prints all three raw scores under their own names', () => {
    const text = render(state);
    const reading = state.sittings[0]!.reading;
    expect(text).toContain('Protein');
    expect(text).toContain('Balanced');
    expect(text).toContain('Carb');
    expect(text).toContain(String(reading.scores.protein));
    expect(text).toContain(String(reading.scores.balanced));
  });

  it('shows the tendencies, the ambiguous areas and her vitality answer', () => {
    const text = render(state);
    expect(text).toContain('Strongest response tendencies');
    expect(text).toContain('Usually does not eat breakfast');
    expect(text).toContain('Ambiguous and mixed areas');
    expect(text).toContain('Q2.');
    expect(text).toContain('Physical vitality, as she answered it');
    expect(text).toContain('Comes and goes');
  });

  it('shows the discomfort flag as a coaching signal, saying it moved nothing', () => {
    const text = render(state);
    expect(text).toContain('Digestive discomfort');
    expect(text).toContain('Coaching signal only, did not influence the pattern.');
  });

  it('says nothing at all when she has never taken it', () => {
    const text = render(EMPTY);
    expect(text).toContain('Not completed yet.');
    expect(text).not.toContain('Confidence');
  });
});

describe('2. pattern over time, and the record that came before', () => {
  const state: CoachFuelPatternPanelState = {
    memberId: 'member-1',
    sittings: [
      toSitting('newest', '2026-09-12T10:00:00.000Z', sitting('protein')),
      toSitting('older', '2026-08-01T10:00:00.000Z', sitting('neutral')),
    ],
    primalSittings: [
      {
        id: 'p1',
        completedAt: '2026-04-02T10:00:00.000Z',
        result: 'polar',
        label: 'Polar Diet Type',
      },
    ],
    meals: NO_MEALS,
  };

  it('lists every sitting with its date, pattern and confidence, most recent first', () => {
    const text = render(state);
    expect(text).toContain('Pattern over time');
    expect(text).toContain('Sep 12, 2026');
    expect(text).toContain('Aug 1, 2026');
    expect(text.indexOf('Sep 12, 2026')).toBeLessThan(text.lastIndexOf('Aug 1, 2026'));
    expect(text).toContain('Flexible Fuel');
  });

  it('does not draw the over time list for a single sitting', () => {
    const text = render({ ...state, sittings: [state.sittings[0]!], primalSittings: [] });
    expect(text).not.toContain('Pattern over time');
  });

  it('carries her retired Primal Pattern sittings, unconverted and unchanged', () => {
    const text = render(state);
    expect(text).toContain('Before this instrument');
    expect(text).toContain('Polar Diet Type');
    expect(text).toContain('Apr 2, 2026');
    expect(text).toContain('not converted into a fuel pattern');
  });

  it('draws no Primal section for a member who never took it', () => {
    const text = render({ ...state, primalSittings: [] });
    expect(text).not.toContain('Before this instrument');
  });
});

describe('3. it is read only, and it is on the page', () => {
  const panelSource = fs.readFileSync(
    path.join(ROOT, 'app/coach/clients/[id]/FuelPatternPanel.tsx'),
    'utf8'
  );
  const actionSource = fs.readFileSync(
    path.join(ROOT, 'app/actions/fuelPatternCoach.ts'),
    'utf8'
  );

  it('writes nothing, anywhere in the module that feeds it', () => {
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', 'revalidatePath']) {
      expect(actionSource, write).not.toContain(write);
    }
  });

  it('offers no control that could write, because this assessment is not coach assigned', () => {
    const state: CoachFuelPatternPanelState = {
      memberId: 'member-1',
      sittings: [toSitting('a', '2026-09-12T10:00:00.000Z', sitting('protein'))],
      primalSittings: [],
      meals: NO_MEALS,
    };
    render(state);
    // A single sitting draws no chips, so a single sitting draws no button.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    // No Server Action is called from the card at all, so there is no
    // control on it that could write even if one were drawn.
    expect(panelSource).not.toMatch(/\bawait\s+\w+Action\(/);
    expect(panelSource).not.toContain('startTransition');
    expect(panelSource).not.toContain('useRouter');
  });

  it('excludes test accounts in the data layer rather than on the screen', () => {
    expect(actionSource).toContain('isMemberVisibleToStaff');
    expect(panelSource).not.toContain('is_test');
  });

  it('is rendered by the coach detail page and indexed in the pinned search', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'app/coach/clients/[id]/detail/page.tsx'),
      'utf8'
    );
    expect(page).toContain('<FuelPatternPanel state={fuelPatternPanel} />');
    expect(page).toContain('id="detail-card-fuel-pattern"');
    const sections = fs.readFileSync(path.join(ROOT, 'lib/coach-detail/sections.ts'), 'utf8');
    expect(sections).toContain("{ id: 'detail-card-fuel-pattern', title: FPA_LABEL }");
  });
});
