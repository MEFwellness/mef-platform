import { describe, it, expect } from 'vitest';
import {
  computeRplScoring,
  allRplQuestionsAnswered,
  willingnessBandFor,
  capacityBandFor,
  deriveReadinessPattern,
} from '../lib/readiness-pulse/scoring';
import { generateQ2Content } from '../lib/readiness-pulse/q2';
import { triedBranchFor } from '../lib/readiness-pulse/constants';
import type { SessionAnswers } from '../lib/assessment-runtime/types';
import type { LscContextForRpl } from '../lib/readiness-pulse/types';

function baseAnswers(overrides: Partial<Record<string, string>> = {}): SessionAnswers {
  return {
    rpl_q1: 'a_few_tries',
    rpl_q2: 'motivation_faded',
    rpl_q3: 'curious',
    rpl_q4: 'room_if_protect',
    rpl_q5: 'direct',
    rpl_q6: 'schedule',
    rpl_q7: 'doable_good_days',
    rpl_q8: 'energy',
    rpl_q9: 'still_deciding',
    ...overrides,
  };
}

describe('willingnessBandFor / capacityBandFor / deriveReadinessPattern', () => {
  it('bands willingness score 2 as low, 3 as medium, 4 as high', () => {
    expect(willingnessBandFor(1)).toBe('low');
    expect(willingnessBandFor(2)).toBe('low');
    expect(willingnessBandFor(3)).toBe('medium');
    expect(willingnessBandFor(4)).toBe('high');
  });

  it('treats Q7 at 0 as thin capacity regardless of the total score', () => {
    expect(capacityBandFor(6, 0)).toBe('thin');
    expect(capacityBandFor(2, 1)).toBe('thin');
    expect(capacityBandFor(3, 1)).toBe('medium');
    expect(capacityBandFor(4, 2)).toBe('medium');
    expect(capacityBandFor(5, 3)).toBe('strong');
  });

  it('produces the full documented 3x3 table', () => {
    expect(deriveReadinessPattern('low', 'thin')).toBe('not_yet');
    expect(deriveReadinessPattern('low', 'medium')).toBe('not_yet');
    expect(deriveReadinessPattern('low', 'strong')).toBe('not_yet');
    expect(deriveReadinessPattern('medium', 'thin')).toBe('ready_if_small');
    expect(deriveReadinessPattern('medium', 'medium')).toBe('still_deciding');
    expect(deriveReadinessPattern('medium', 'strong')).toBe('still_deciding');
    expect(deriveReadinessPattern('high', 'thin')).toBe('ready_if_small');
    expect(deriveReadinessPattern('high', 'medium')).toBe('ready_if_small');
    expect(deriveReadinessPattern('high', 'strong')).toBe('ready_now');
  });
});

describe('computeRplScoring', () => {
  it('derives ready_now from high willingness (overdue) and strong capacity (genuinely open + easily doable)', () => {
    const scoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'ready_now' }),
      null
    );
    expect(scoring.derivedPattern).toBe('ready_now');
    expect(scoring.finalPattern).toBe('ready_now');
    expect(scoring.pickDivergedFromDerived).toBe(false);
  });

  it('derives not_yet from low willingness (a_little_scary) regardless of high capacity', () => {
    const scoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'a_little_scary', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'not_yet' }),
      null
    );
    expect(scoring.derivedPattern).toBe('not_yet');
  });

  it('derives ready_if_small when Q7 is "even that feels heavy" even with high willingness and room in Q4', () => {
    const scoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'even_that_heavy', rpl_q9: 'ready_if_small' }),
      null
    );
    expect(scoring.derivedPattern).toBe('ready_if_small');
  });

  it("her Question 9 pick always wins as finalPattern, even when it diverges from the derived pattern", () => {
    // Derived: high willingness (overdue) + strong capacity -> ready_now, but she picked not_yet.
    const scoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'not_yet' }),
      null
    );
    expect(scoring.derivedPattern).toBe('ready_now');
    expect(scoring.finalPattern).toBe('not_yet');
    expect(scoring.pickDivergedFromDerived).toBe(true);
  });

  it('falls back to the derived pattern (no divergence) when the pick matches it', () => {
    const scoring = computeRplScoring(baseAnswers({ rpl_q9: 'still_deciding' }), null);
    expect(scoring.derivedPattern).toBe(scoring.finalPattern);
    expect(scoring.pickDivergedFromDerived).toBe(false);
  });

  it('Q8 comparison is null with no Life Signal Check context', () => {
    const scoring = computeRplScoring(baseAnswers(), null);
    expect(scoring.q8Comparison).toBeNull();
    expect(scoring.targetSignal).toBe('energy');
  });

  it('Q8 comparison is null when Life Signal Check was quiet_body (nothing genuinely loud)', () => {
    const lsc: LscContextForRpl = { loudestSignal: 'sleep', pattern: 'quiet_body', hardestTimeOfDay: 'mornings' };
    const scoring = computeRplScoring(baseAnswers({ rpl_q8: 'energy' }), lsc);
    expect(scoring.q8Comparison).toBeNull();
    expect(scoring.targetSignal).toBe('energy');
  });

  it('Q8 comparison confirms when her pick matches the loudest Life Signal Check signal, and targets it', () => {
    const lsc: LscContextForRpl = { loudestSignal: 'tension', pattern: 'one_loud', hardestTimeOfDay: 'evenings' };
    const scoring = computeRplScoring(baseAnswers({ rpl_q8: 'tension' }), lsc);
    expect(scoring.q8Comparison).toBe('confirmed');
    expect(scoring.targetSignal).toBe('tension');
  });

  it('Q8 comparison is an honest mismatch when her pick differs, and the experiment still targets the loudest signal', () => {
    const lsc: LscContextForRpl = { loudestSignal: 'tension', pattern: 'chorus', hardestTimeOfDay: 'evenings' };
    const scoring = computeRplScoring(baseAnswers({ rpl_q8: 'mind' }), lsc);
    expect(scoring.q8Comparison).toBe('mismatch');
    expect(scoring.targetSignal).toBe('tension');
  });

  it('surpriseFires on overdue-early/not-yet-at-the-end, and on scared-or-exhausting-early/ready-now-at-the-end, never otherwise', () => {
    expect(computeRplScoring(baseAnswers({ rpl_q3: 'overdue', rpl_q9: 'not_yet' }), null).surpriseFires).toBe(true);
    expect(computeRplScoring(baseAnswers({ rpl_q3: 'a_little_scary', rpl_q9: 'ready_now' }), null).surpriseFires).toBe(true);
    expect(computeRplScoring(baseAnswers({ rpl_q3: 'appealing_but_exhausting', rpl_q9: 'ready_now' }), null).surpriseFires).toBe(true);
    expect(computeRplScoring(baseAnswers({ rpl_q3: 'overdue', rpl_q9: 'ready_now' }), null).surpriseFires).toBe(false);
    expect(computeRplScoring(baseAnswers({ rpl_q3: 'curious', rpl_q9: 'still_deciding' }), null).surpriseFires).toBe(false);
  });

  it('triedBranchFor: only "never started" is the never-started branch', () => {
    expect(triedBranchFor('first_real_try')).toBe('tried');
    expect(triedBranchFor('a_few_tries')).toBe('tried');
    expect(triedBranchFor('more_than_i_can_count')).toBe('tried');
    expect(triedBranchFor('never_started')).toBe('never_started');
  });
});

describe('generateQ2Content', () => {
  it('shows the "what got in the way" options for every tried answer', () => {
    for (const q1 of ['first_real_try', 'a_few_tries', 'more_than_i_can_count'] as const) {
      const content = generateQ2Content(q1);
      expect(content.prompt).toBe('What usually got in the way?');
      expect(content.options.map((o) => o.value)).toEqual(['life_got_busy', 'motivation_faded', 'results_too_slow', 'nobody_noticed']);
    }
  });

  it('shows the "kept it at the thinking stage" options for never_started', () => {
    const content = generateQ2Content('never_started');
    expect(content.prompt).toBe('What has kept it at the thinking stage?');
    expect(content.options.map((o) => o.value)).toEqual(['never_right_time', 'didnt_know_where', 'afraid_wouldnt_stick', 'nothing_forced_me']);
  });
});

describe('allRplQuestionsAnswered', () => {
  it('requires all nine question keys', () => {
    expect(allRplQuestionsAnswered(baseAnswers())).toBe(true);
    const { rpl_q9, ...missing } = baseAnswers();
    void rpl_q9;
    expect(allRplQuestionsAnswered(missing)).toBe(false);
  });
});
