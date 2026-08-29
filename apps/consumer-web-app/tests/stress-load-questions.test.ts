/**
 * The eleven questions: required, ordered, and answerable only with her own
 * earlier answers where the brief says so.
 *
 * Three things are worth proving here and nothing else in the suite proves
 * them:
 *
 *   1. EVERY QUESTION IS REQUIRED AND EVERY ONE CARRIES ITS OWN SENTENCE.
 *      A disabled Continue with nothing on screen explaining it was a real
 *      reported bug in this app, and the fix was structural: a question
 *      cannot be declared without a blockedReason. This asserts that over
 *      the whole list rather than over the ones somebody remembered.
 *
 *   2. Q3 AND Q8 CAN ONLY OFFER WHAT SHE PICKED. The brief's own wording,
 *      and the failure it prevents is Root putting a source of pressure
 *      into her mouth.
 *
 *   3. THE SERVER SANITIZER REJECTS WHAT THE CLIENT COULD HAVE LIED ABOUT.
 *      Every test here runs the real sanitizeStressLoadAnswers, which is
 *      the function the server action actually calls.
 */

import { describe, it, expect } from 'vitest';
import {
  OTHER_BLOCKED_REASON,
  OTHER_VALUE,
  STRESS_LOAD_OTHER_MAX_LENGTH,
  STRESS_LOAD_QUESTIONS,
  STRESS_LOAD_QUESTION_KEYS,
  STRESS_LOAD_TEXT_MAX_LENGTH,
  blockedReasonFor,
  derivedOptionsFor,
  isAnswered,
  readableAnswer,
  sanitizeStressLoadAnswers,
  stressLoadQuestion,
  type StressLoadAnswers,
  type StressLoadDraft,
} from '@/lib/stress-load/questions';

/** A complete, valid answer set. Every test that needs one starts here and changes one thing. */
export function fullAnswers(overrides: Partial<StressLoadAnswers> = {}): StressLoadAnswers {
  return {
    load_weight: 4,
    load_sources: { selected: ['work', 'family'], otherText: null },
    load_follows_home: 'work',
    load_would_drop: 'The Thursday board call.',
    body_signals: { selected: ['sleep', 'tension'], otherText: null },
    body_loudest_when: 'night',
    response_actions: { selected: ['push_through', 'distract'], otherText: null },
    response_relied_on: 'push_through',
    recovery_sources: { selected: ['music', 'outside'], otherText: null },
    recovery_amount: 'not_enough',
    lean_on: { selected: ['partner'], otherText: null },
    ...overrides,
  };
}

describe('the eleven questions', () => {
  it('are eleven, in three screens, in the brief order', () => {
    expect(STRESS_LOAD_QUESTIONS).toHaveLength(11);
    expect(STRESS_LOAD_QUESTIONS.map((q) => q.key)).toEqual([...STRESS_LOAD_QUESTION_KEYS]);
    expect(STRESS_LOAD_QUESTIONS.map((q) => q.screen)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
  });

  it('every one of them carries a real blockedReason, so a dead Continue is unwritable', () => {
    for (const question of STRESS_LOAD_QUESTIONS) {
      expect(question.blockedReason.trim().length).toBeGreaterThan(0);
    }
  });

  it('an empty draft blocks on the first question and names why', () => {
    const draft: StressLoadDraft = {};
    for (const question of STRESS_LOAD_QUESTIONS) {
      expect(isAnswered(question, draft[question.key], draft)).toBe(false);
      expect(blockedReasonFor(question, draft)).toBe(question.blockedReason);
    }
  });

  it('no member-facing string in the question set carries an em dash', () => {
    for (const question of STRESS_LOAD_QUESTIONS) {
      const strings = [question.prompt, question.hint ?? '', question.blockedReason];
      if (question.kind === 'multi' || question.kind === 'single' || question.kind === 'scale') {
        strings.push(...question.options.map((option) => option.label));
      }
      for (const value of strings) expect(value).not.toContain('—');
    }
  });
});

describe('a multi-select with "something else" ticked and nothing typed', () => {
  const question = stressLoadQuestion('load_sources');

  it('is not answered, because the next screen would offer a button with no words on it', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: ['work', OTHER_VALUE], otherText: null },
    };
    expect(isAnswered(question, draft.load_sources, draft)).toBe(false);
  });

  it('gets its own sentence rather than the general one, because she has already picked something', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: ['work', OTHER_VALUE], otherText: '   ' },
    };
    expect(blockedReasonFor(question, draft)).toBe(OTHER_BLOCKED_REASON);
  });

  it('is answered once she types', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: ['work', OTHER_VALUE], otherText: 'The house move' },
    };
    expect(isAnswered(question, draft.load_sources, draft)).toBe(true);
  });
});

describe('Q3 and Q8 offer only her own selections', () => {
  it('Q3 lists exactly what she picked in Q2, in the order she picked it', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: ['money', 'work', 'health'], otherText: null },
    };
    const options = derivedOptionsFor(stressLoadQuestion('load_follows_home'), draft);
    expect(options.map((o) => o.value)).toEqual(['money', 'work', 'health']);
    expect(options.map((o) => o.label)).toEqual(['Money', 'Work or business', 'Health']);
  });

  it('Q3 shows her own words where she picked "Something else"', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: [OTHER_VALUE], otherText: 'The house move' },
    };
    const options = derivedOptionsFor(stressLoadQuestion('load_follows_home'), draft);
    expect(options).toEqual([{ value: OTHER_VALUE, label: 'The house move' }]);
  });

  it('Q3 refuses a source she never picked', () => {
    const draft: StressLoadDraft = {
      load_sources: { selected: ['work'], otherText: null },
      load_follows_home: 'money',
    };
    expect(isAnswered(stressLoadQuestion('load_follows_home'), 'money', draft)).toBe(false);
    expect(isAnswered(stressLoadQuestion('load_follows_home'), 'work', draft)).toBe(true);
  });

  it('Q8 does the same over Q7', () => {
    const draft: StressLoadDraft = {
      response_actions: { selected: ['alcohol', 'talk'], otherText: null },
    };
    const options = derivedOptionsFor(stressLoadQuestion('response_relied_on'), draft);
    expect(options.map((o) => o.value)).toEqual(['alcohol', 'talk']);
    expect(isAnswered(stressLoadQuestion('response_relied_on'), 'move', draft)).toBe(false);
  });

  it('offers nothing at all when the question it derives from is unanswered', () => {
    expect(derivedOptionsFor(stressLoadQuestion('load_follows_home'), {})).toEqual([]);
  });
});

describe('the server sanitizer', () => {
  it('accepts a complete answer set unchanged', () => {
    expect(sanitizeStressLoadAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('rejects a missing answer', () => {
    const partial = { ...fullAnswers() } as Record<string, unknown>;
    delete partial.recovery_amount;
    expect(sanitizeStressLoadAnswers(partial)).toBeNull();
  });

  it('rejects a scale value that is not on the scale', () => {
    expect(sanitizeStressLoadAnswers(fullAnswers({ load_weight: 9 }))).toBeNull();
    expect(sanitizeStressLoadAnswers(fullAnswers({ load_weight: 0 }))).toBeNull();
  });

  it('rejects an option value that is not in the question', () => {
    expect(
      sanitizeStressLoadAnswers(fullAnswers({ recovery_amount: 'loads_actually' }))
    ).toBeNull();
    expect(
      sanitizeStressLoadAnswers(
        fullAnswers({ body_signals: { selected: ['telepathy'], otherText: null } })
      )
    ).toBeNull();
  });

  it('rejects a derived answer she never selected, however well formed the request is', () => {
    expect(
      sanitizeStressLoadAnswers(
        fullAnswers({
          load_sources: { selected: ['work'], otherText: null },
          load_follows_home: 'money',
        })
      )
    ).toBeNull();
  });

  it('rejects an empty free text answer', () => {
    expect(sanitizeStressLoadAnswers(fullAnswers({ load_would_drop: '   ' }))).toBeNull();
  });

  it('drops duplicate selections rather than counting a source twice', () => {
    const clean = sanitizeStressLoadAnswers(
      fullAnswers({ load_sources: { selected: ['work', 'work', 'money'], otherText: null } })
    );
    expect(clean?.load_sources.selected).toEqual(['work', 'money']);
  });

  it('clamps free text and the "something else" label to their own limits', () => {
    const long = 'x'.repeat(900);
    const clean = sanitizeStressLoadAnswers(
      fullAnswers({
        load_would_drop: long,
        lean_on: { selected: [OTHER_VALUE], otherText: long },
      })
    );
    expect(clean?.load_would_drop).toHaveLength(STRESS_LOAD_TEXT_MAX_LENGTH);
    expect(clean?.lean_on.otherText).toHaveLength(STRESS_LOAD_OTHER_MAX_LENGTH);
  });

  it('rejects anything that is not an object at all', () => {
    expect(sanitizeStressLoadAnswers(null)).toBeNull();
    expect(sanitizeStressLoadAnswers('yes')).toBeNull();
    expect(sanitizeStressLoadAnswers([])).toBeNull();
  });
});

describe('reading answers back, in her own words', () => {
  it('renders the scale as its word and its number', () => {
    expect(readableAnswer(stressLoadQuestion('load_weight'), fullAnswers())).toEqual([
      'Heavy (4 of 5)',
    ]);
  });

  it('renders a derived answer through the list it came from, never as the word "other"', () => {
    const answers = fullAnswers({
      load_sources: { selected: [OTHER_VALUE], otherText: 'The house move' },
      load_follows_home: OTHER_VALUE,
    });
    expect(readableAnswer(stressLoadQuestion('load_follows_home'), answers)).toEqual([
      'The house move',
    ]);
  });

  it('renders a multi-select as her own labels, in her own order', () => {
    expect(readableAnswer(stressLoadQuestion('response_actions'), fullAnswers())).toEqual([
      'Push through and keep going',
      'Scroll, watch TV, or distract myself',
    ]);
  });
});
