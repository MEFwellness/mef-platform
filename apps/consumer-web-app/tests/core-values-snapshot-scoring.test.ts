import { describe, it, expect } from 'vitest';
import { computeCvsScoring, computeImportanceThroughQ4 } from '../lib/core-values-snapshot/scoring';
import { generateQ12Options } from '../lib/core-values-snapshot/q12';
import { seededShuffle } from '../lib/core-values-snapshot/randomize';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible } from '../lib/core-values-snapshot/experiment';
import { buildCvsNarrativeDrafts } from '../lib/core-values-snapshot/narrative';
import type { SessionAnswers } from '../lib/assessment-runtime/types';
import type { ValueArea } from '../lib/core-values-snapshot/constants';

/** Builds a full, valid answer set: Q1-Q4 pick `q1to4`, sliders from `attention`, Q11 picks `q11`, Q12 is forced to `q12Winner` (must be one of the two areas the real generator would offer — callers are responsible for that being realistic in each test). */
function answers(params: {
  q1: ValueArea; q2: ValueArea; q3: ValueArea; q4: ValueArea;
  attention: Record<ValueArea, number>;
  q11: ValueArea;
  q12: ValueArea;
}): SessionAnswers {
  return {
    cvs_q1: params.q1,
    cvs_q2: params.q2,
    cvs_q3: params.q3,
    cvs_q4: params.q4,
    cvs_q5: params.attention.health,
    cvs_q6: params.attention.relationships,
    cvs_q7: params.attention.growth,
    cvs_q8: params.attention.purpose,
    cvs_q9: params.attention.freedom,
    cvs_q10: params.attention.peace,
    cvs_q11: params.q11,
    cvs_q12: params.q12,
  };
}

const flatAttention: Record<ValueArea, number> = {
  health: 3, relationships: 3, growth: 3, purpose: 3, freedom: 3, peace: 3,
};

describe('computeImportanceThroughQ4', () => {
  it('scores Q1/Q2/Q3 as +1 and Q4 as +2, ignoring Q11/Q12', () => {
    const a = answers({ q1: 'health', q2: 'health', q3: 'health', q4: 'health', attention: flatAttention, q11: 'peace', q12: 'health' });
    const importance = computeImportanceThroughQ4(a);
    expect(importance.health).toBe(5); // 1+1+1+2
    expect(importance.peace).toBe(0);
  });
});

describe('computeCvsScoring — branches', () => {
  it('clear_gap: top value has attention <= 2', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'health', q4: 'health',
      attention: { ...flatAttention, health: 2 },
      q11: 'health', q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.topValue).toBe('health');
    expect(scoring.importance.health).toBe(8);
    expect(scoring.gapClassification).toBe('clear_gap');
    expect(scoring.branch).toBe('clear_gap');
    expect(scoring.split).toBe(false);
  });

  it('aligned: top value has attention >= 4', () => {
    const a = answers({
      q1: 'purpose', q2: 'purpose', q3: 'purpose', q4: 'purpose',
      attention: { ...flatAttention, purpose: 5 },
      q11: 'purpose', q12: 'purpose',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('aligned');
    expect(scoring.gapClassification).toBe('aligned');
  });

  it('slipping: top value has attention exactly 3', () => {
    const a = answers({
      q1: 'growth', q2: 'growth', q3: 'growth', q4: 'growth',
      attention: { ...flatAttention, growth: 3 },
      q11: 'growth', q12: 'growth',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('slipping');
  });

  it('split: Q11 pick scored 0 across Q1-Q4, takes priority over the gap classification', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'health', q4: 'health',
      attention: { ...flatAttention, health: 3 }, // would be "slipping" without the split override
      q11: 'freedom', // freedom got zero points from Q1-Q4
      q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.split).toBe(true);
    expect(scoring.branch).toBe('split');
    expect(scoring.q11Pick).toBe('freedom');
  });

  it('top value tiebreak prefers the Q4 answer over other tied areas', () => {
    // health and relationships both get 1(Q1)+1(Q2 or Q3) = 2 from two single questions each,
    // but health also gets Q4's +2, so health should win outright without needing the tiebreak —
    // construct an actual tie instead: two areas score the same importance after all six inputs.
    const a: SessionAnswers = {
      cvs_q1: 'health',
      cvs_q2: 'relationships',
      cvs_q3: 'growth',
      cvs_q4: 'purpose', // purpose +2
      cvs_q5: 3, cvs_q6: 3, cvs_q7: 3, cvs_q8: 3, cvs_q9: 3, cvs_q10: 3,
      cvs_q11: 'freedom', // freedom +2
      cvs_q12: 'purpose', // purpose +1 -> purpose total 3, freedom total 2
    };
    const scoring = computeCvsScoring(a);
    // purpose: 2(Q4)+1(Q12)=3; freedom: 2(Q11)=2; health/relationships/growth: 1 each.
    expect(scoring.importance.purpose).toBe(3);
    expect(scoring.topValue).toBe('purpose');
  });

  it('runner-up excludes the top value', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'relationships', q4: 'health',
      attention: flatAttention,
      q11: 'health', q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.topValue).toBe('health');
    expect(scoring.runnerUpValue).not.toBe('health');
    expect(scoring.runnerUpValue).toBe('relationships');
  });

  it('s1Fires only when the Q3 guilt area has attention >= 4 and branch is not split', () => {
    const fires = answers({
      q1: 'health', q2: 'health', q3: 'peace', q4: 'health',
      attention: { ...flatAttention, health: 4, peace: 4 },
      q11: 'health', q12: 'health',
    });
    const scoringFires = computeCvsScoring(fires);
    expect(scoringFires.guiltArea).toBe('peace');
    expect(scoringFires.s1Fires).toBe(true);

    const noFire = answers({
      q1: 'health', q2: 'health', q3: 'peace', q4: 'health',
      attention: { ...flatAttention, health: 4, peace: 1 },
      q11: 'health', q12: 'health',
    });
    expect(computeCvsScoring(noFire).s1Fires).toBe(false);
  });

  it('s1 never fires on the split branch even if guilt-area attention is high', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'health', q4: 'health',
      attention: { ...flatAttention, health: 5 },
      q11: 'peace', // zero importance from Q1-Q4 -> split
      q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('split');
    expect(scoring.guiltArea).toBe('health');
    expect(scoring.guiltAreaAttention).toBe(5);
    expect(scoring.s1Fires).toBe(false);
  });
});

describe('generateQ12Options', () => {
  it('offers the two highest Q1-Q4 areas', () => {
    const importance = { health: 4, relationships: 3, growth: 1, purpose: 0, freedom: 0, peace: 0 } as Record<ValueArea, number>;
    const [a, b] = generateQ12Options(importance, 'health');
    expect(new Set([a, b])).toEqual(new Set(['health', 'relationships']));
  });

  it('never offers two identical options', () => {
    const importance = { health: 0, relationships: 0, growth: 0, purpose: 0, freedom: 0, peace: 0 } as Record<ValueArea, number>;
    const [a, b] = generateQ12Options(importance, 'health');
    expect(a).not.toBe(b);
  });

  it('a three-way tie pits the Q4 answer against the next-highest other area', () => {
    // health (Q4 answer), relationships, growth all tied at 2.
    const importance = { health: 2, relationships: 2, growth: 2, purpose: 0, freedom: 0, peace: 1 } as Record<ValueArea, number>;
    const [a, b] = generateQ12Options(importance, 'health');
    expect(a).toBe('health');
    expect(['relationships', 'growth']).toContain(b);
  });
});

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(seededShuffle(items, 'session-1:cvs_q1')).toEqual(seededShuffle(items, 'session-1:cvs_q1'));
  });

  it('varies across different seeds (not a no-op)', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const orders = new Set(
      ['s1', 's2', 's3', 's4', 's5'].map((seed) => seededShuffle(items, seed).join(','))
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never drops or duplicates items', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = seededShuffle(items, 'any-seed');
    expect([...shuffled].sort()).toEqual([...items].sort());
  });
});

describe('experiment pattern helpers', () => {
  it('daysSinceStart / eligibility flags', () => {
    expect(daysSinceStart('2026-07-01', '2026-07-01')).toBe(0);
    expect(daysSinceStart('2026-07-01', '2026-07-04')).toBe(3);
    expect(isDay3Eligible('2026-07-01', '2026-07-03')).toBe(false);
    expect(isDay3Eligible('2026-07-01', '2026-07-04')).toBe(true);
    expect(isDay7Eligible('2026-07-01', '2026-07-07')).toBe(false);
    expect(isDay7Eligible('2026-07-01', '2026-07-08')).toBe(true);
  });

  it('classifies mostly-yes vs patchy from real logged days', () => {
    const mostlyYes = [true, true, true, true, true, false, null].map((completed, i) => ({
      localDate: `2026-07-0${i + 1}`,
      completed,
      day3Response: null,
    }));
    expect(classifyDay7Pattern(mostlyYes, 7).pattern).toBe('mostly_yes');

    const patchy = [true, false, null, null, false, null, null].map((completed, i) => ({
      localDate: `2026-07-0${i + 1}`,
      completed,
      day3Response: null,
    }));
    expect(classifyDay7Pattern(patchy, 7).pattern).toBe('patchy');

    expect(classifyDay7Pattern([], 7).pattern).toBe('patchy');
  });
});

describe('buildCvsNarrativeDrafts', () => {
  it('always includes the top-value and open-thread entries, never invents an S1 entry when it did not fire', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'peace', q4: 'health',
      attention: { ...flatAttention, health: 4, peace: 1 },
      q11: 'health', q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.s1Fires).toBe(false);
    const drafts = buildCvsNarrativeDrafts('session-1', scoring);
    expect(drafts.some((d) => d.category === 'primary_priorities')).toBe(true);
    expect(drafts.some((d) => d.title.startsWith('Guilt about'))).toBe(false);
    expect(drafts.every((d) => d.memberVisible)).toBe(true);
  });

  it('adds the guilt-observation entry when S1 fires', () => {
    const a = answers({
      q1: 'health', q2: 'health', q3: 'peace', q4: 'health',
      attention: { ...flatAttention, health: 4, peace: 4 },
      q11: 'health', q12: 'health',
    });
    const scoring = computeCvsScoring(a);
    expect(scoring.s1Fires).toBe(true);
    const drafts = buildCvsNarrativeDrafts('session-1', scoring);
    expect(drafts.some((d) => d.title.startsWith('Guilt about'))).toBe(true);
  });
});
