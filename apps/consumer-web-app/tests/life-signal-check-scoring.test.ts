import { describe, it, expect } from 'vitest';
import { computeSignalScores, computeLscScoring, allLscQuestionsAnswered } from '../lib/life-signal-check/scoring';
import { computeLoudSignals, generateQ10Options } from '../lib/life-signal-check/q10';
import { isAdjacent, VALUE_ADJACENT_SIGNALS } from '../lib/life-signal-check/adjacency';
import { buildLscWhatRootLearned, LSC_ECHO_LINE, LSC_SURPRISE_LINE } from '../lib/life-signal-check/copy';
import { buildLscNarrativeDrafts } from '../lib/life-signal-check/narrative';
import type { SessionAnswers } from '../lib/assessment-runtime/types';
import type { Signal } from '../lib/life-signal-check/constants';
import type { CvsContextForEcho } from '../lib/life-signal-check/types';
import type { ValueArea } from '../lib/core-values-snapshot/constants';

/** Option values that yield a specific 0-3 score per signal, per migration 138's real answer_options. Tension has no option scoring exactly 1 by design (0, 2, 2, 2, 3) — callers must never ask for that. */
const OPTION_FOR_SCORE: Record<Signal, Record<number, string>> = {
  energy: { 0: 'never', 1: 'once_or_twice', 2: 'most_days', 3: 'every_day' },
  sleep: { 0: 'rested', 1: 'slow_start', 2: 'needed_more', 3: 'barely_slept' },
  tension: { 0: 'didnt_notice', 2: 'shoulders_neck', 3: 'everywhere' },
  digestion: { 0: 'settled', 1: 'heavy_bloated', 2: 'unpredictable', 3: 'uncomfortable' },
  body: { 0: 'no', 1: 'worked_around_it', 2: 'most_days', 3: 'constantly' },
  mind: { 0: 'usually', 1: 'sometimes', 2: 'rarely', 3: 'no_quiet_moments' },
};

const QUESTION_KEY: Record<Signal, string> = {
  energy: 'lsc_q4',
  sleep: 'lsc_q5',
  tension: 'lsc_q6',
  digestion: 'lsc_q7',
  body: 'lsc_q8',
  mind: 'lsc_q9',
};

function zeroScores(): Record<Signal, number> {
  return { energy: 0, sleep: 0, tension: 0, digestion: 0, body: 0, mind: 0 };
}

function answers(params: {
  scores?: Partial<Record<Signal, number>>;
  q1?: string;
  q2?: string;
  q3?: string;
  q10?: Signal;
  q11?: string;
}): SessionAnswers {
  const scores = { ...zeroScores(), ...params.scores };
  const out: SessionAnswers = {
    lsc_q1: params.q1 ?? 'mornings',
    lsc_q2: params.q2 ?? 'evenings',
    lsc_q3: params.q3 ?? 'tired',
    lsc_q11: params.q11 ?? 'just_this_week',
  };
  for (const [signal, score] of Object.entries(scores) as [Signal, number][]) {
    const optionValue = OPTION_FOR_SCORE[signal][score];
    if (optionValue === undefined) throw new Error(`No real option scores ${score} for ${signal} (tension has no option scoring 1)`);
    out[QUESTION_KEY[signal]] = optionValue;
  }
  if (params.q10) out.lsc_q10 = params.q10;
  return out;
}

describe('computeSignalScores', () => {
  it('maps each Screen 2 answer to its real 0-3 score, including tension’s asymmetric scale', () => {
    const scores = computeSignalScores(
      answers({ scores: { energy: 3, sleep: 1, tension: 2, digestion: 0, body: 1, mind: 3 } })
    );
    expect(scores).toEqual({ energy: 3, sleep: 1, tension: 2, digestion: 0, body: 1, mind: 3 });
  });

  it('tension’s "everywhere, honestly" scores 3, its three middle options each score 2', () => {
    const everywhere = computeSignalScores(answers({ scores: { tension: 3 } }));
    expect(everywhere.tension).toBe(3);
    const shoulders = computeSignalScores(answers({ scores: { tension: 2 } }));
    expect(shoulders.tension).toBe(2);
  });

  it('unanswered Screen 2 questions default to 0, never undefined or NaN', () => {
    const scores = computeSignalScores({ lsc_q1: 'mornings' });
    expect(scores).toEqual(zeroScores());
  });
});

describe('computeLoudSignals / generateQ10Options', () => {
  it('a signal is loud at score 2 or 3, not at 0 or 1', () => {
    const scores = { energy: 0, sleep: 1, tension: 2, digestion: 3, body: 1, mind: 0 } as Record<Signal, number>;
    expect(computeLoudSignals(scores).sort()).toEqual(['digestion', 'tension'].sort());
  });

  it('offers only loud signals, with "quiet" framing, when at least one is loud', () => {
    const scores = { energy: 3, sleep: 0, tension: 0, digestion: 0, body: 0, mind: 0 } as Record<Signal, number>;
    const { options, framing } = generateQ10Options(scores);
    expect(framing).toBe('quiet');
    expect(options.map((o) => o.value)).toEqual(['energy']);
  });

  it('offers all six signals, with "protect" framing, when nothing is loud', () => {
    const scores = zeroScores();
    const { options, framing } = generateQ10Options(scores);
    expect(framing).toBe('protect');
    expect(options).toHaveLength(6);
  });
});

describe('computeLscScoring — the four patterns', () => {
  it('quiet_body: fires only when nothing scores 2 or higher', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 1, sleep: 1 } }), null);
    expect(scoring.loudSignals).toEqual([]);
    expect(scoring.pattern).toBe('quiet_body');
  });

  it('quiet_body never fires when even one signal is loud', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 2 } }), null);
    expect(scoring.pattern).not.toBe('quiet_body');
  });

  it('one_loud: fires with exactly one loud signal', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 } }), null);
    expect(scoring.loudSignals).toEqual(['mind']);
    expect(scoring.pattern).toBe('one_loud');
  });

  it('one_loud: also covers exactly two loud signals (a leader plus one elevated), per the build brief reserving "chorus" for three or more', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3, tension: 2 } }), null);
    expect(scoring.loudSignals).toHaveLength(2);
    expect(scoring.pattern).toBe('one_loud');
  });

  it('one_loud never fires with zero or three-plus loud signals', () => {
    expect(computeLscScoring(answers({ scores: {} }), null).pattern).not.toBe('one_loud');
    expect(
      computeLscScoring(answers({ scores: { energy: 2, sleep: 2, tension: 2 } }), null).pattern
    ).not.toBe('one_loud');
  });

  it('chorus: fires with three or more loud signals', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 2, sleep: 3, mind: 2 } }), null);
    expect(scoring.loudSignals).toHaveLength(3);
    expect(scoring.pattern).toBe('chorus');
  });

  it('chorus never fires with fewer than three loud signals', () => {
    expect(computeLscScoring(answers({ scores: { energy: 2, sleep: 2 } }), null).pattern).not.toBe('chorus');
  });
});

describe('computeLscScoring — pick-wins rule', () => {
  it('the member’s Question 10 pick always becomes chosenSignal, even when a different signal scored louder', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 3, mind: 2 }, q10: 'mind' }), null);
    expect(scoring.loudestSignal).toBe('energy');
    expect(scoring.chosenSignal).toBe('mind');
    expect(scoring.pickDivergedFromLoudest).toBe(true);
  });

  it('pickDivergedFromLoudest is false when the pick matches the loudest signal', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 3 }, q10: 'energy' }), null);
    expect(scoring.pickDivergedFromLoudest).toBe(false);
  });
});

describe('computeLscScoring — surprise beat', () => {
  it('fires only when Q3 is "I\'m okay, actually" AND at least one signal is loud', () => {
    const scoring = computeLscScoring(answers({ q3: 'okay_actually', scores: { energy: 2 } }), null);
    expect(scoring.surpriseFires).toBe(true);
  });

  it('never fires when Q3 is "okay, actually" but nothing is loud', () => {
    const scoring = computeLscScoring(answers({ q3: 'okay_actually', scores: {} }), null);
    expect(scoring.surpriseFires).toBe(false);
  });

  it('never fires when something is loud but Q3 was not "okay, actually"', () => {
    const scoring = computeLscScoring(answers({ q3: 'tired', scores: { energy: 3 } }), null);
    expect(scoring.surpriseFires).toBe(false);
  });
});

describe('adjacency — Body-Value Echo mapping', () => {
  it('is explicitly defined for every value area, and Sleep/Digestion are never adjacent to anything', () => {
    const allAdjacent = new Set(Object.values(VALUE_ADJACENT_SIGNALS).flat());
    expect(allAdjacent.has('sleep')).toBe(false);
    expect(allAdjacent.has('digestion')).toBe(false);
  });

  it('the build brief’s own worked example: peace is adjacent to mind and tension', () => {
    expect(isAdjacent('peace', 'mind')).toBe(true);
    expect(isAdjacent('peace', 'tension')).toBe(true);
    expect(isAdjacent('peace', 'digestion')).toBe(false);
  });
});

describe('computeLscScoring — Body-Value Echo', () => {
  const peaceGap: CvsContextForEcho = { topValue: 'peace', branch: 'clear_gap' };

  it('fires when the loudest signal is adjacent to the Core Values Snapshot top value and that value has a real gap', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 } }), peaceGap);
    expect(scoring.loudestSignal).toBe('mind');
    expect(scoring.echoFires).toBe(true);
  });

  it('never fires when the loudest signal is not adjacent to the top value', () => {
    const scoring = computeLscScoring(answers({ scores: { digestion: 3 } }), peaceGap);
    expect(scoring.echoFires).toBe(false);
  });

  it('never fires on the "aligned" branch, even when otherwise adjacent (no real gap to echo)', () => {
    const alignedPeace: CvsContextForEcho = { topValue: 'peace', branch: 'aligned' };
    const scoring = computeLscScoring(answers({ scores: { mind: 3 } }), alignedPeace);
    expect(scoring.echoFires).toBe(false);
  });

  it('never fires when there is no Core Values Snapshot context at all', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 } }), null);
    expect(scoring.echoFires).toBe(false);
  });

  it('is reachable for every value area that has at least one adjacent signal (non-vacuous across the whole mapping)', () => {
    for (const [value, signals] of Object.entries(VALUE_ADJACENT_SIGNALS) as [ValueArea, Signal[]][]) {
      for (const signal of signals) {
        const scores = zeroScores();
        scores[signal] = 3;
        const scoring = computeLscScoring(answers({ scores }), { topValue: value, branch: 'slipping' });
        expect(scoring.echoFires).toBe(true);
      }
    }
  });
});

describe('allLscQuestionsAnswered', () => {
  it('is false until every one of the eleven questions has an answer', () => {
    expect(allLscQuestionsAnswered(answers({ scores: {} }))).toBe(false);
  });

  it('is true once Q1-Q9, Q10, and Q11 are all answered', () => {
    expect(allLscQuestionsAnswered(answers({ scores: {}, q10: 'energy' }))).toBe(true);
  });
});

describe('buildLscWhatRootLearned — copy accuracy per pattern', () => {
  it('one_loud names the loudest signal', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 }, q10: 'mind' }), null);
    expect(buildLscWhatRootLearned(scoring)).toContain('Mind');
  });

  it('chorus names the chosen signal as the start and acknowledges the others', () => {
    const scoring = computeLscScoring(answers({ scores: { energy: 2, sleep: 3, mind: 2 }, q10: 'sleep' }), null);
    const text = buildLscWhatRootLearned(scoring);
    expect(text).toContain('Sleep');
    expect(text).toMatch(/Energy|Mind/);
  });

  it('quiet_body never names a specific signal as loud', () => {
    const scoring = computeLscScoring(answers({ scores: {} }), null);
    const text = buildLscWhatRootLearned(scoring);
    expect(text).toContain('surprised me');
    expect(text).not.toContain('loudest voice');
  });

  it('includes the honest pick-diverged line only when the pick differs from the loudest, never on quiet_body', () => {
    const diverged = computeLscScoring(answers({ scores: { energy: 3, mind: 2 }, q10: 'mind' }), null);
    expect(buildLscWhatRootLearned(diverged)).toContain("You know things the numbers don't");

    const aligned = computeLscScoring(answers({ scores: { energy: 3 }, q10: 'energy' }), null);
    expect(buildLscWhatRootLearned(aligned)).not.toContain("You know things the numbers don't");
  });

  it('never claims a specific duration or time of day that was never answered', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 }, q11: 'months' }), null);
    expect(buildLscWhatRootLearned(scoring)).toContain('months');
  });
});

describe('buildLscNarrativeDrafts', () => {
  it('always includes the "How your body is responding" entry, never invents Echo/surprise entries when neither fired', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 2 } }), null);
    expect(scoring.echoFires).toBe(false);
    expect(scoring.surpriseFires).toBe(false);
    const drafts = buildLscNarrativeDrafts('session-1', scoring);
    expect(drafts.some((d) => d.title === 'How your body is responding')).toBe(true);
    expect(drafts.some((d) => d.summary === LSC_ECHO_LINE)).toBe(false);
    expect(drafts.some((d) => d.summary === LSC_SURPRISE_LINE)).toBe(false);
    expect(drafts.every((d) => d.memberVisible)).toBe(true);
  });

  it('adds the Echo entry when Body-Value Echo fires', () => {
    const scoring = computeLscScoring(answers({ scores: { mind: 3 } }), { topValue: 'peace', branch: 'clear_gap' });
    expect(scoring.echoFires).toBe(true);
    const drafts = buildLscNarrativeDrafts('session-1', scoring);
    expect(drafts.some((d) => d.summary === LSC_ECHO_LINE)).toBe(true);
  });

  it('adds the surprise-beat entry when it fires', () => {
    const scoring = computeLscScoring(answers({ q3: 'okay_actually', scores: { energy: 2 } }), null);
    expect(scoring.surpriseFires).toBe(true);
    const drafts = buildLscNarrativeDrafts('session-1', scoring);
    expect(drafts.some((d) => d.summary === LSC_SURPRISE_LINE)).toBe(true);
  });
});
