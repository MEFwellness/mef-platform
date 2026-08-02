import { describe, it, expect } from 'vitest';
import { buildRplNarrativeDrafts } from '../lib/readiness-pulse/narrative';
import { computeRplScoring } from '../lib/readiness-pulse/scoring';
import type { SessionAnswers } from '../lib/assessment-runtime/types';

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

describe('buildRplNarrativeDrafts', () => {
  it('writes both drafts as member_visible: false, per the build brief\'s "invisible to the member" rule', () => {
    const scoring = computeRplScoring(baseAnswers(), null);
    const drafts = buildRplNarrativeDrafts('session-1', scoring);
    expect(drafts.length).toBe(2);
    for (const draft of drafts) {
      expect(draft.memberVisible).toBe(false);
    }
  });

  it('stores readiness under motivation_patterns and the obstacle under barriers_to_adherence', () => {
    const scoring = computeRplScoring(baseAnswers(), null);
    const drafts = buildRplNarrativeDrafts('session-1', scoring);
    expect(drafts.find((d) => d.category === 'motivation_patterns')).toBeTruthy();
    expect(drafts.find((d) => d.category === 'barriers_to_adherence')).toBeTruthy();
  });

  it('notes the divergence in the readiness summary only when the pick actually diverged', () => {
    const converged = computeRplScoring(baseAnswers({ rpl_q9: 'still_deciding' }), null);
    const divergedScoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'not_yet' }),
      null
    );
    const convergedDraft = buildRplNarrativeDrafts('s1', converged).find((d) => d.category === 'motivation_patterns')!;
    const divergedDraft = buildRplNarrativeDrafts('s2', divergedScoring).find((d) => d.category === 'motivation_patterns')!;
    expect(convergedDraft.summary).not.toMatch(/outranked/);
    expect(divergedDraft.summary).toMatch(/outranked/);
  });

  it('every draft carries the real session id in its source refs', () => {
    const scoring = computeRplScoring(baseAnswers(), null);
    const drafts = buildRplNarrativeDrafts('session-xyz', scoring);
    for (const draft of drafts) {
      expect(draft.sourceRefs).toEqual([{ type: 'unified_assessment_session', id: 'session-xyz', note: 'readiness-pulse' }]);
    }
  });
});
