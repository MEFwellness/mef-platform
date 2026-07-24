import { describe, it, expect } from 'vitest';
import {
  ANCHOR_KEYS,
  CONCERN_CONFIG,
  READINESS_KEYS,
  advanceAdaptivePlan,
  answersToAnsweredMap,
  concernConfigFor,
  estimatedTotalQuestions,
  initAdaptiveEngineState,
  isPlanComplete,
  type AdaptiveEngineState,
} from '../lib/onboarding/adaptivePlan';
import { PAIN_BANK } from '../lib/onboarding/concernBanks/pain';
import { WEIGHT_BANK } from '../lib/onboarding/concernBanks/weight';
import { DIGESTION_BANK } from '../lib/onboarding/concernBanks/digestion';
import { SLEEP_BANK } from '../lib/onboarding/concernBanks/sleep';
import { STRESS_BANK } from '../lib/onboarding/concernBanks/stress';
import { ENERGY_BANK } from '../lib/onboarding/concernBanks/energy';
import { PERFORMANCE_BANK } from '../lib/onboarding/concernBanks/performance';
import { HEALTHY_AGING_BANK } from '../lib/onboarding/concernBanks/healthyAging';
import { GENERAL_OPTIMIZATION_BANK } from '../lib/onboarding/concernBanks/generalOptimization';
import { SHARED_POOL_BANK } from '../lib/onboarding/concernBanks/sharedPool';
import type { ConcernQuestionSeed } from '../lib/onboarding/concernBanks/types';
import type { OnboardingQuestion } from '@mef/shared-types-contracts';

const LEGACY_KEYS = [
  'primary_concern',
  'baseline_sleep_quality',
  'baseline_sleep_hours',
  'baseline_stress_level',
  'baseline_energy_level',
  'baseline_digestion',
  'baseline_pain_areas',
  'baseline_movement_frequency',
  'baseline_goals',
  'readiness_importance',
  'readiness_confidence',
  'readiness_actively_working',
];

const REAL_BANKS: Record<string, ConcernQuestionSeed[]> = {
  pain: PAIN_BANK,
  weight: WEIGHT_BANK,
  digestion: DIGESTION_BANK,
  sleep: SLEEP_BANK,
  stress: STRESS_BANK,
  energy: ENERGY_BANK,
  performance: PERFORMANCE_BANK,
  healthy_aging: HEALTHY_AGING_BANK,
  general_optimization: GENERAL_OPTIMIZATION_BANK,
};

describe('concern bank content (real seed data)', () => {
  it('every bank has between 15 and 30 questions', () => {
    for (const [concern, bank] of Object.entries(REAL_BANKS)) {
      expect(bank.length, concern).toBeGreaterThanOrEqual(15);
      expect(bank.length, concern).toBeLessThanOrEqual(30);
    }
  });

  it('every question_key is prefixed with its own concern and never collides with a legacy key', () => {
    for (const [concern, bank] of Object.entries(REAL_BANKS)) {
      for (const q of bank) {
        expect(q.question_key.startsWith(`${concern}_`), `${concern}: ${q.question_key}`).toBe(true);
        expect(LEGACY_KEYS.includes(q.question_key), q.question_key).toBe(false);
      }
    }
    for (const q of SHARED_POOL_BANK) {
      expect(q.question_key.startsWith('shared_'), q.question_key).toBe(true);
      expect(LEGACY_KEYS.includes(q.question_key), q.question_key).toBe(false);
    }
  });

  it('every question_key across every bank + shared pool is globally unique', () => {
    const allKeys = [
      ...Object.values(REAL_BANKS).flatMap((bank) => bank.map((q) => q.question_key)),
      ...SHARED_POOL_BANK.map((q) => q.question_key),
    ];
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it('every enum/multi_select question has non-empty allowed_values', () => {
    const allQuestions = [...Object.values(REAL_BANKS).flat(), ...SHARED_POOL_BANK];
    for (const q of allQuestions) {
      if (q.answer_type === 'enum' || q.answer_type === 'multi_select') {
        expect(q.allowed_values?.length ?? 0, q.question_key).toBeGreaterThan(0);
      }
    }
  });

  it('requires/boosts in a concern bank only reference primary_concern or a key from the SAME bank (the ordering-safety rule)', () => {
    for (const [concern, bank] of Object.entries(REAL_BANKS)) {
      const ownKeys = new Set(bank.map((q) => q.question_key));
      for (const q of bank) {
        for (const rule of [...(q.requires ?? []), ...(q.boosts ?? [])]) {
          const valid = rule.question_key === 'primary_concern' || ownKeys.has(rule.question_key);
          expect(valid, `${concern}: ${q.question_key} rule references "${rule.question_key}"`).toBe(true);
        }
      }
    }
  });

  it('shared pool rules only reference primary_concern (Phase 1+2 are the only guaranteed-answered signal by Phase 3b)', () => {
    for (const q of SHARED_POOL_BANK) {
      for (const rule of [...(q.requires ?? []), ...(q.boosts ?? [])]) {
        expect(rule.question_key, q.question_key).toBe('primary_concern');
      }
    }
  });
});

describe('CONCERN_CONFIG', () => {
  it('has an entry for every value the live primary_concern enum allows', () => {
    const enumValues = [
      'pain',
      'energy',
      'sleep',
      'stress',
      'weight',
      'digestion',
      'movement',
      'performance',
      'healthy_aging',
      'habits',
      'general_optimization',
      'other',
    ];
    for (const value of enumValues) {
      expect(CONCERN_CONFIG[value], value).toBeDefined();
    }
  });

  it('movement/habits/other fall back to the general_optimization bank', () => {
    for (const value of ['movement', 'habits', 'other']) {
      expect(concernConfigFor(value).bankKey).toBe('general_optimization');
    }
  });

  it('every home anchor is one of the 6 real ANCHOR_KEYS', () => {
    for (const config of Object.values(CONCERN_CONFIG)) {
      if (config.homeAnchor) expect(ANCHOR_KEYS).toContain(config.homeAnchor);
    }
  });
});

describe('estimatedTotalQuestions', () => {
  it('is 1 + phase2Count + remaining anchors + 1 + 3 readiness for every concern', () => {
    for (const [concern, config] of Object.entries(CONCERN_CONFIG)) {
      const expected = 1 + config.phase2Count + (ANCHOR_KEYS.length - (config.homeAnchor ? 1 : 0)) + 1 + READINESS_KEYS.length;
      expect(estimatedTotalQuestions(concern), concern).toBe(expected);
    }
  });

  it('falls back to the general config for null/unknown concerns', () => {
    expect(estimatedTotalQuestions(null)).toBe(estimatedTotalQuestions('general_optimization'));
    expect(estimatedTotalQuestions('not_a_real_concern')).toBe(estimatedTotalQuestions('general_optimization'));
  });
});

// ---- advanceAdaptivePlan, driven end-to-end over a small synthetic bank ----

function legacyQuestion(key: string, overrides: Partial<OnboardingQuestion> = {}): OnboardingQuestion {
  return {
    id: key,
    question_key: key,
    assessment_version_id: 'v1',
    question_version: 1,
    display_order: 1,
    prompt_text: key,
    helper_text: null,
    answer_type: 'numeric',
    allowed_values: null,
    domain: 'all',
    allows_not_sure: true,
    allows_not_applicable: true,
    allows_prefer_not_to_answer: true,
    question_pool: 'legacy',
    concern: null,
    weight: 1,
    requires: null,
    boosts: null,
    ...overrides,
  };
}

function concernBankQuestion(key: string, concern: string, overrides: Partial<OnboardingQuestion> = {}): OnboardingQuestion {
  return { ...legacyQuestion(key, { question_pool: 'concern_bank', concern }), ...overrides };
}

function sharedPoolQuestion(key: string, overrides: Partial<OnboardingQuestion> = {}): OnboardingQuestion {
  return { ...legacyQuestion(key, { question_pool: 'shared_pool', concern: null }), ...overrides };
}

const FIXED_BANK: OnboardingQuestion[] = [
  legacyQuestion('primary_concern', { answer_type: 'enum' }),
  ...ANCHOR_KEYS.map((key) => legacyQuestion(key)),
  legacyQuestion('baseline_sleep_hours'),
  legacyQuestion('baseline_goals', { answer_type: 'free_text' }),
  ...READINESS_KEYS.map((key) => legacyQuestion(key)),
  // A tiny synthetic 'pain' bank: 5 candidates, one gated behind another.
  concernBankQuestion('pain_a', 'pain', { weight: 2 }),
  concernBankQuestion('pain_b', 'pain', { weight: 2 }),
  concernBankQuestion('pain_c', 'pain', { weight: 1 }),
  concernBankQuestion('pain_followup', 'pain', {
    weight: 5,
    requires: [{ question_key: 'pain_a', op: 'eq', value: 'x' }],
  }),
  // A tiny synthetic shared pool: 3 candidates.
  sharedPoolQuestion('shared_x', { weight: 1 }),
  sharedPoolQuestion('shared_y', { weight: 1 }),
  sharedPoolQuestion('shared_z', { weight: 1 }),
];

const zeroRandom = () => 0;

function driveFullPlan(concern: string, bank: OnboardingQuestion[]) {
  let state: AdaptiveEngineState = initAdaptiveEngineState(concern);
  const answered: Record<string, { status: string; value?: string }> = {
    primary_concern: { status: 'answered', value: concern },
  };
  const asked: OnboardingQuestion[] = [];
  const transitions: boolean[] = [];

  for (let i = 0; i < 30; i++) {
    const { question, nextState, enteredPhase3 } = advanceAdaptivePlan(state, bank, answersToAnsweredMap(answered), zeroRandom);
    transitions.push(enteredPhase3);
    state = nextState;
    if (!question) break;
    asked.push(question);
    answered[question.question_key] = { status: 'answered', value: 'x' };
  }

  return { asked, finalState: state, transitions };
}

describe('advanceAdaptivePlan', () => {
  it('asks the home anchor first for a concern that has one', () => {
    const { asked } = driveFullPlan('pain', FIXED_BANK);
    expect(asked[0]?.question_key).toBe('baseline_pain_areas');
  });

  it('never re-asks the home anchor in Phase 3a', () => {
    const { asked } = driveFullPlan('pain', FIXED_BANK);
    const painAnchorCount = asked.filter((q) => q.question_key === 'baseline_pain_areas').length;
    expect(painAnchorCount).toBe(1);
  });

  it('asks every remaining anchor exactly once, in ANCHOR_KEYS order minus the home anchor', () => {
    const { asked } = driveFullPlan('pain', FIXED_BANK);
    const remaining = ANCHOR_KEYS.filter((k) => k !== 'baseline_pain_areas');
    const askedAnchors = asked.map((q) => q.question_key).filter((k) => (remaining as readonly string[]).includes(k));
    expect(askedAnchors).toEqual(remaining);
  });

  it('never picks the same concern-bank question twice', () => {
    const { asked } = driveFullPlan('pain', FIXED_BANK);
    const bankPicks = asked.filter((q) => q.question_pool === 'concern_bank').map((q) => q.question_key);
    expect(new Set(bankPicks).size).toBe(bankPicks.length);
  });

  it('a requires-gated question only becomes eligible once its dependency is answered', () => {
    // pain_followup requires pain_a === 'x'; drive with a synthetic bank that
    // ONLY offers pain_a and pain_followup, forcing pain_a to be picked
    // first, then followup should become the very next pick.
    const smallBank = FIXED_BANK.filter(
      (q) => q.question_pool !== 'concern_bank' || ['pain_a', 'pain_followup'].includes(q.question_key)
    );
    const { asked } = driveFullPlan('pain', smallBank);
    const bankPicks = asked.filter((q) => q.question_pool === 'concern_bank').map((q) => q.question_key);
    // pain config asks 3 total bank slots (1 anchor consumed elsewhere + 2 bank picks) —
    // with only 2 eligible candidates in this trimmed bank, both get picked, and
    // pain_a (answered 'x' by driveFullPlan) must unlock pain_followup.
    expect(bankPicks).toContain('pain_a');
    expect(bankPicks).toContain('pain_followup');
    expect(bankPicks.indexOf('pain_a')).toBeLessThan(bankPicks.indexOf('pain_followup'));
  });

  it('fires enteredPhase3 exactly once, right after the last Phase 2 pick', () => {
    const { transitions } = driveFullPlan('pain', FIXED_BANK);
    expect(transitions.filter(Boolean)).toHaveLength(1);
  });

  it('places the transition strictly AFTER the last Phase 2 question, never before it (regression: previously fired one pick early)', () => {
    // pain's phase2Count is 3: [anchor, bank pick 1, bank pick 2] before Phase 3 begins.
    const { asked, transitions } = driveFullPlan('pain', FIXED_BANK);
    const transitionIndex = transitions.findIndex(Boolean);
    expect(transitionIndex).toBe(3); // 0=anchor, 1=bank1, 2=bank2(last phase2), 3=first phase3a (transition fires here)
    expect(transitions.slice(0, 3)).toEqual([false, false, false]);
    expect(asked[2]?.question_pool).toBe('concern_bank'); // the last question BEFORE the transition is still phase 2
    expect(asked[3]?.question_pool).toBe('legacy'); // the question fired WITH the transition is the first phase 3a anchor
  });

  it('asks the readiness triplet last, in order', () => {
    const { asked } = driveFullPlan('pain', FIXED_BANK);
    const last3 = asked.slice(-3).map((q) => q.question_key);
    expect(last3).toEqual([...READINESS_KEYS]);
  });

  it('reaches a complete state with no home anchor for a concern with none (general_optimization)', () => {
    const { asked, finalState } = driveFullPlan('general_optimization', FIXED_BANK);
    expect(isPlanComplete(finalState)).toBe(true);
    // No pain_* or home-anchor-consuming behavior; all 6 anchors appear.
    const askedAnchors = asked.map((q) => q.question_key).filter((k) => (ANCHOR_KEYS as readonly string[]).includes(k));
    expect(askedAnchors).toEqual([...ANCHOR_KEYS]);
  });

  it('is self-healing when a queued legacy key is missing from the bank (skips it, keeps going)', () => {
    const bankMissingOneAnchor = FIXED_BANK.filter((q) => q.question_key !== 'baseline_stress_level');
    const { asked, finalState } = driveFullPlan('pain', bankMissingOneAnchor);
    expect(isPlanComplete(finalState)).toBe(true);
    expect(asked.some((q) => q.question_key === 'baseline_stress_level')).toBe(false);
  });

  it('terminates (question: null) once every phase is exhausted, and stays terminal on further calls', () => {
    const { finalState } = driveFullPlan('pain', FIXED_BANK);
    expect(isPlanComplete(finalState)).toBe(true);
    const again = advanceAdaptivePlan(finalState, FIXED_BANK, {}, zeroRandom);
    expect(again.question).toBeNull();
    expect(isPlanComplete(again.nextState)).toBe(true);
  });
});

describe('answersToAnsweredMap', () => {
  it('only includes answered entries with a defined value', () => {
    const map = answersToAnsweredMap({
      a: { status: 'answered', value: 'x' },
      b: { status: 'not_sure' },
      c: { status: 'answered' },
    });
    expect(map).toEqual({ a: 'x' });
  });
});
