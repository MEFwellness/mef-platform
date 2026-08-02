/**
 * Personal Reset Plan — copy-accuracy suite, same pattern as
 * tests/core-values-snapshot-copy.test.ts: for each interpretive claim
 * Root can make, a test that constructs the real member state and
 * asserts the claim only appears when the data genuinely supports it,
 * including the degraded and zero-data paths. Pure functions only, no
 * Supabase client.
 */
import { describe, it, expect } from 'vitest';
import {
  buildResetPlanDay7Reflection,
  buildResetPlanMissHandlingLine,
  buildResetPlanProposal,
  buildResetPlanSuccessDefinition,
  buildResetPlanWhyItMatters,
  classifyResetPlanDay7Pattern,
  resetPlanProposedTier,
  shouldOfferDifficultDayVersion,
} from '../lib/reset-plan/copy';
import { EMPTY_RESET_PLAN_SNAPSHOT, type ResetPlanDailyLog, type ResetPlanSnapshot } from '../lib/reset-plan/types';
import type { CvsScoring } from '../lib/core-values-snapshot/types';
import type { LscScoring } from '../lib/life-signal-check/types';
import type { RplScoring } from '../lib/readiness-pulse/types';

function cvsFixture(overrides: Partial<CvsScoring> = {}): CvsScoring {
  return {
    importance: { health: 4, relationships: 4, growth: 2, purpose: 2, freedom: 1, peace: 1 },
    attention: { health: 2, relationships: 2, growth: 3, purpose: 3, freedom: 3, peace: 3 },
    topValue: 'health',
    runnerUpValue: 'relationships',
    gapClassification: 'clear_gap',
    split: false,
    branch: 'clear_gap',
    guiltArea: 'health',
    guiltAreaAttention: 2,
    s1Fires: false,
    q11Pick: 'health',
    q4Answer: 'health',
    q12Winner: 'health',
    ...overrides,
  };
}

function lscFixture(overrides: Partial<LscScoring> = {}): LscScoring {
  return {
    scores: { energy: 3, sleep: 0, tension: 0, digestion: 0, body: 0, mind: 0 },
    loudSignals: ['energy'],
    loudestSignal: 'energy',
    chosenSignal: 'energy',
    pickDivergedFromLoudest: false,
    pattern: 'one_loud',
    duration: 'just_this_week',
    bestTimeOfDay: 'mornings',
    hardestTimeOfDay: 'evenings',
    bodyText: null,
    surpriseFires: false,
    echoFires: false,
    echoContext: null,
    q1ContrastFires: true,
    predictedSignalFromQ3: null,
    q3Comparison: null,
    ...overrides,
  };
}

function rplFixture(overrides: Partial<RplScoring> = {}): RplScoring {
  return {
    q1: 'first_real_try',
    triedBranch: 'tried',
    q2: 'motivation_faded',
    q3: 'curious',
    q4: 'room_if_protect',
    q5: 'direct',
    q6: 'schedule',
    q7: 'doable_good_days',
    q8Signal: 'energy',
    q9: 'still_deciding',
    capacityScore: 4,
    willingnessScore: 3,
    willingnessBand: 'medium',
    capacityBand: 'medium',
    derivedPattern: 'still_deciding',
    finalPattern: 'still_deciding',
    pickDivergedFromDerived: false,
    lscContext: { loudestSignal: 'energy', pattern: 'one_loud', hardestTimeOfDay: 'evenings' },
    q8Comparison: 'confirmed',
    targetSignal: 'energy',
    surpriseFires: false,
    ...overrides,
  };
}

function dailyLog(overrides: Partial<ResetPlanDailyLog>): ResetPlanDailyLog {
  return {
    id: 'log-1',
    planId: 'plan-1',
    planVersionId: 'version-1',
    localDate: '2026-01-01',
    state: 'completed_normal',
    day3Response: null,
    loggedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildResetPlanProposal — never names a signal the snapshot does not support', () => {
  it('proposes Readiness Pulse\'s own targetSignal when a Readiness Pulse session exists', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, rpl: rplFixture(), targetSignal: 'energy', loudestSignal: 'energy', lsc: lscFixture() };
    const proposal = buildResetPlanProposal(snapshot);
    expect(proposal.signal).toBe('energy');
    expect(proposal.body).toContain('Energy');
  });

  it('proposes Life Signal Check\'s own loudestSignal when there is no Readiness Pulse session', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, lsc: lscFixture({ pattern: 'one_loud', loudestSignal: 'tension' }), loudestSignal: 'tension' };
    const proposal = buildResetPlanProposal(snapshot);
    expect(proposal.signal).toBe('tension');
    expect(proposal.body).toContain('Tension');
  });

  it('makes no proposal at all when neither experience has a genuinely loud/completed result — never a guess', () => {
    const quiet: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, lsc: lscFixture({ pattern: 'quiet_body' }), loudestSignal: null };
    expect(buildResetPlanProposal(quiet).signal).toBeNull();

    const nothing: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT };
    expect(buildResetPlanProposal(nothing).signal).toBeNull();
    expect(buildResetPlanProposal(nothing).heading.toLowerCase()).toContain('your call');
  });
});

describe('buildResetPlanWhyItMatters — the value link only fires under the exact Body-Value Echo rule', () => {
  it('links the focus to her top value when adjacent and the branch is not aligned', () => {
    // 'relationships' is adjacent only to 'tension' per lib/life-signal-check/adjacency.ts
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, cvs: cvsFixture({ topValue: 'relationships', branch: 'clear_gap' }) };
    const result = buildResetPlanWhyItMatters(snapshot, 'tension');
    expect(result.linked).toBe(true);
    expect(result.text).toContain('Close Relationships');
  });

  it('never links when the branch is aligned, even if the signal is adjacent', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, cvs: cvsFixture({ topValue: 'relationships', branch: 'aligned' }) };
    const result = buildResetPlanWhyItMatters(snapshot, 'tension');
    expect(result.linked).toBe(false);
    expect(result.text).not.toContain('Close Relationships');
  });

  it('never links when the signal is not adjacent to her top value', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, cvs: cvsFixture({ topValue: 'relationships', branch: 'clear_gap' }) };
    const result = buildResetPlanWhyItMatters(snapshot, 'sleep');
    expect(result.linked).toBe(false);
  });

  it('degrades honestly to a standalone framing with no invented bridge when there is no completed Core Values Snapshot', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, cvs: null };
    const result = buildResetPlanWhyItMatters(snapshot, 'mind');
    expect(result.linked).toBe(false);
    expect(result.text).toContain('Mind');
  });
});

describe('resetPlanProposedTier — degrades to the noticing tier, never presumes Ready Now, when there is no Readiness Pulse session', () => {
  it('uses the real finalReadinessPattern when present', () => {
    const snapshot: ResetPlanSnapshot = { ...EMPTY_RESET_PLAN_SNAPSHOT, finalReadinessPattern: 'ready_now' };
    expect(resetPlanProposedTier(snapshot)).toBe('ready_now');
  });

  it('falls back to still_deciding when there is no Readiness Pulse session', () => {
    expect(resetPlanProposedTier(EMPTY_RESET_PLAN_SNAPSHOT)).toBe('still_deciding');
  });
});

describe('buildResetPlanMissHandlingLine — the four named response groups, plus the gentle-middle default', () => {
  it('direct names the pattern plainly', () => {
    expect(buildResetPlanMissHandlingLine('direct', 'energy')).toContain('not today several times');
  });
  it('autonomous leaves the choice entirely with her', () => {
    expect(buildResetPlanMissHandlingLine('autonomous', 'energy')).toBe('This plan is still here whenever you are ready.');
  });
  it('encouragement, meaning_anchored, and education_first all acknowledge the real pattern but reconnect differently', () => {
    const encouragement = buildResetPlanMissHandlingLine('encouragement', 'sleep');
    const meaning = buildResetPlanMissHandlingLine('meaning_anchored', 'sleep');
    const education = buildResetPlanMissHandlingLine('education_first', 'sleep');
    expect(encouragement).not.toBe(meaning);
    expect(meaning).not.toBe(education);
    for (const line of [encouragement, meaning, education]) {
      expect(line).toContain('Sleep');
    }
  });
  it('adaptive and unclear both default to the same gentle middle', () => {
    expect(buildResetPlanMissHandlingLine('adaptive', 'body')).toBe(buildResetPlanMissHandlingLine('unclear', 'body'));
  });
});

describe('buildResetPlanSuccessDefinition — never a streak, noticing tiers succeed by noticing', () => {
  it('doing-tiers (ready_now/ready_if_small) explicitly disclaim a streak requirement, never demand one', () => {
    for (const tier of ['ready_now', 'ready_if_small'] as const) {
      expect(buildResetPlanSuccessDefinition(tier).toLowerCase()).toContain('not a streak');
    }
  });
  it('noticing-tiers (still_deciding/not_yet) frame success as noticing, not doing', () => {
    for (const tier of ['still_deciding', 'not_yet'] as const) {
      expect(buildResetPlanSuccessDefinition(tier)).toContain('noticing');
    }
  });
});

describe('classifyResetPlanDay7Pattern / buildResetPlanDay7Reflection — honest on every real logged pattern, including zero days', () => {
  it('a missing row is "no response logged," never "you missed"', () => {
    const result = classifyResetPlanDay7Pattern([]);
    expect(result.pattern).toBe('no_response');
    const text = buildResetPlanDay7Reflection([], 'energy');
    expect(text).toContain('No response logged');
    expect(text.toLowerCase()).not.toContain('missed');
  });

  it('mostly-normal days reads as the plan working', () => {
    const logs = [dailyLog({ state: 'completed_normal' }), dailyLog({ state: 'completed_normal', localDate: '2026-01-02' }), dailyLog({ state: 'not_today', localDate: '2026-01-03' })];
    expect(classifyResetPlanDay7Pattern(logs).pattern).toBe('mostly_normal');
    expect(buildResetPlanDay7Reflection(logs, 'energy')).toContain('exactly what this plan is for');
  });

  it('a genuine mix of normal and difficult-day is framed as the plan working, not failing', () => {
    const logs = [dailyLog({ state: 'completed_normal' }), dailyLog({ state: 'completed_difficult', localDate: '2026-01-02' })];
    expect(classifyResetPlanDay7Pattern(logs).pattern).toBe('mixed_effort');
    expect(buildResetPlanDay7Reflection(logs, 'energy')).toContain('not the plan failing');
  });

  it('mostly not-today is honest information, explicitly not framed as a failure', () => {
    const logs = [dailyLog({ state: 'not_today' }), dailyLog({ state: 'not_today', localDate: '2026-01-02' }), dailyLog({ state: 'not_today', localDate: '2026-01-03' })];
    expect(classifyResetPlanDay7Pattern(logs).pattern).toBe('mostly_not_today');
    const text = buildResetPlanDay7Reflection(logs, 'energy');
    expect(text).toContain('honest information');
    expect(text.toLowerCase()).toContain('not a failure');
  });
});

describe('shouldOfferDifficultDayVersion — fires at exactly two or more explicit not-today records', () => {
  it('does not fire on zero or one', () => {
    expect(shouldOfferDifficultDayVersion([])).toBe(false);
    expect(shouldOfferDifficultDayVersion([dailyLog({ state: 'not_today' })])).toBe(false);
  });
  it('fires at exactly two, and stays true beyond two', () => {
    expect(shouldOfferDifficultDayVersion([dailyLog({ state: 'not_today' }), dailyLog({ state: 'not_today', localDate: '2026-01-02' })])).toBe(true);
    expect(
      shouldOfferDifficultDayVersion([
        dailyLog({ state: 'not_today' }),
        dailyLog({ state: 'not_today', localDate: '2026-01-02' }),
        dailyLog({ state: 'not_today', localDate: '2026-01-03' }),
      ])
    ).toBe(true);
  });
  it('completed days never count toward the offer', () => {
    expect(shouldOfferDifficultDayVersion([dailyLog({ state: 'completed_normal' }), dailyLog({ state: 'completed_difficult', localDate: '2026-01-02' })])).toBe(false);
  });
});
