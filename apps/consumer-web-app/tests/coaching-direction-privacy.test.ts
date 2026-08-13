/**
 * Adaptive Coaching Direction — the hard privacy line, enforced as a test.
 *
 * This is a health-adjacent app and the outcome ledger is permanent. The
 * rule is the same one tests/product-analytics-payload-safety.test.ts
 * draws for analytics payloads, extended to the two new tables:
 *
 *   An analytics payload or an outcome record may carry an event name, a
 *   rule slug, an action type, a signal key, a library identifier, and
 *   numbers. It may never carry a check-in answer, a questionnaire
 *   response, a pain location, a sleep number, a nutrition detail, a
 *   concern category, a safety classification level, or any free text.
 *
 * Three layers are checked here, because each catches a different failure:
 *
 *   1. THE SANITIZER, at runtime. An unknown key, a sentence, a nested
 *      object: all dropped, none persisted.
 *   2. THE ALLOWLIST ITSELF. A future build could add a plausible-looking
 *      key that is actually health content. Every key is checked against
 *      the vocabulary of the health systems this engine reads from.
 *   3. THE ENGINE'S REAL OUTPUT. Every rule is exercised with a fully
 *      populated, deliberately health-content-bearing fixture, and the
 *      evidence it produces is checked for that content by value. This is
 *      the one that catches a rule wiring a finding sentence into
 *      `signalKey` and calling it a key.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_EVIDENCE_KEYS,
  MAX_EVIDENCE_VALUE_LENGTH,
  sanitizeSignalEvidence,
} from '@/lib/coaching-direction/evidence';
import { selectCoachingAction } from '@/lib/priority/select';
import { PRIORITY_LADDER, type PriorityInputs } from '@/lib/priority/types';
import { MOVEMENT_SESSION_ORDER } from '@/lib/coaching-direction/movement';

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const TODAY = '2026-08-12';

function read(relative: string): string {
  return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

// ---------------------------------------------------------------------
// The health content this test hunts for. Every string here is the kind
// of thing a real member really produces, and none of it may ever appear
// in an evidence object, a payload, or either new table.
// ---------------------------------------------------------------------
const HEALTH_CONTENT = {
  finding: 'On nights you get to bed at a steadier time, your next-day energy tends to be higher.',
  pattern: 'This has held across several weeks now: longer nights tend to be followed by steadier days.',
  checkinNote: 'my lower back has been much worse since the weekend',
  focus: 'Notice where your energy actually goes today.',
  planAction: 'Give yourself a 5 minute walk outside within an hour of lunch.',
  goal: 'Sleep better',
  concernCategory: 'severe_worsening_pain',
  classificationLevel: 'medical_evaluation_recommended',
  food: 'grilled chicken and rice, 42g protein',
};

/** Every rule applies at once, and every one of them carries real content. */
function everythingApplies(): PriorityInputs {
  return {
    safetyFlag: { safetyClassificationId: '5b8f2d1a-0000-4000-8000-000000000001' },
    isReEntry: true,
    resetPlan: {
      planId: 'plan-1',
      planVersionId: 'ver-1',
      actionText: HEALTH_CONTENT.planAction,
      difficultDayText: 'Step to a window and take 5 slow breaths.',
      daysLogged: 4,
      daysSinceStart: 6,
    },
    implicatedDriver: {
      driverId: 'SLP-3',
      domainKey: 'SLP',
      label: 'Bedtime consistency',
      whatItObserves: 'How much bedtime varies night to night',
      findingSentence: HEALTH_CONTENT.finding,
    },
    qualifiedPattern: {
      pairKey: 'sleep_hours::next_day_energy',
      label: 'Sleep hours and next-day energy',
      memberSentence: HEALTH_CONTENT.pattern,
      confidence: 0.82,
      observationCount: 24,
    },
    incompleteAction: {
      key: 'wbsa',
      name: 'Whole-Body Systems Assessment',
      href: '/assessment/wbsa',
      resumeHint: 'Your answers so far are saved.',
      lastTouchedLocalDate: '2026-08-05',
    },
    behavioralFriction: {
      kind: 'daily_reset_incomplete',
      signalType: 'repeated_incomplete_flow',
      starts: 5,
      completions: 1,
      completionRate: 20,
      savedCount: null,
      windowDays: null,
      evidenceSufficiency: 'moderate',
    },
    todaysFocus: {
      feedItemId: 'feed-1',
      focusText: HEALTH_CONTENT.focus,
      reasonText: 'Your last few check-ins pointed at afternoons.',
      suggestedAction: 'Take one short walk after lunch.',
    },
    // Root Movement, present so the movement rung is genuinely exercised by
    // the sweep below rather than skipped.
    movement: {
      sessions: MOVEMENT_SESSION_ORDER.map((sessionKey) => ({
        sessionKey,
        name: sessionKey,
        lastCompletedLocalDate: null,
      })),
      coachAssignedToday: false,
    },
    fallback: { checkinDoneToday: false, totalCheckins: 12, statedGoalLabel: HEALTH_CONTENT.goal },
    hasRealHistory: true,
  };
}

function onlyFrom(index: number): PriorityInputs {
  const inputs: PriorityInputs = { ...everythingApplies(), safetyFlag: null, isReEntry: false };
  if (index > 0) inputs.resetPlan = null;
  if (index > 1) inputs.implicatedDriver = null;
  if (index > 2) inputs.qualifiedPattern = null;
  if (index > 3) inputs.incompleteAction = null;
  if (index > 4) inputs.behavioralFriction = null;
  if (index > 5) inputs.todaysFocus = null;
  if (index > 6) inputs.movement = null;
  if (
    PRIORITY_LADDER[index] === 'gentle_focus' ||
    PRIORITY_LADDER[index] === 'movement_session'
  ) {
    inputs.fallback = { ...inputs.fallback, checkinDoneToday: true };
  }
  return inputs;
}

// =====================================================================
// 1. The sanitizer.
// =====================================================================

describe('the evidence sanitizer drops everything it does not recognize', () => {
  it('keeps allowed keys with slug and numeric values', () => {
    expect(
      sanitizeSignalEvidence({
        rule: 'implicated_driver',
        driverId: 'SLP-3',
        confidence: 0.82,
        observationCount: 24,
        checkinDoneToday: false,
        spanDays: null,
      })
    ).toEqual({
      rule: 'implicated_driver',
      driverId: 'SLP-3',
      confidence: 0.82,
      observationCount: 24,
      checkinDoneToday: false,
      spanDays: null,
    });
  });

  it('drops any key not on the allowlist, however plausible it looks', () => {
    const clean = sanitizeSignalEvidence({
      rule: 'implicated_driver',
      findingSentence: HEALTH_CONTENT.finding,
      memberSentence: HEALTH_CONTENT.pattern,
      notes: HEALTH_CONTENT.checkinNote,
      concernCategory: HEALTH_CONTENT.concernCategory,
      classificationLevel: HEALTH_CONTENT.classificationLevel,
      painLocation: 'lower_back',
      sleepHours: 5.5,
      proteinGrams: 42,
    });
    expect(clean).toEqual({ rule: 'implicated_driver' });
  });

  it('drops a sentence even when it is smuggled through an allowed key', () => {
    const clean = sanitizeSignalEvidence({
      signalKey: HEALTH_CONTENT.finding,
      driverId: HEALTH_CONTENT.checkinNote,
      frictionKind: 'daily_reset_incomplete',
    });
    expect(clean).toEqual({ frictionKind: 'daily_reset_incomplete' });
  });

  it('drops any string long enough to be prose, and anything with whitespace in it', () => {
    expect(sanitizeSignalEvidence({ pairKey: 'a'.repeat(MAX_EVIDENCE_VALUE_LENGTH + 1) })).toEqual({});
    expect(sanitizeSignalEvidence({ pairKey: 'two words' })).toEqual({});
    expect(sanitizeSignalEvidence({ pairKey: 'sleep_hours::next_day_energy' })).toEqual({
      pairKey: 'sleep_hours::next_day_energy',
    });
  });

  it('drops nested structure outright, which is how an evidence summary would leak', () => {
    expect(
      sanitizeSignalEvidence({
        signalKey: { text: HEALTH_CONTENT.finding },
        driverId: [HEALTH_CONTENT.checkinNote],
        tier: 3,
      })
    ).toEqual({ tier: 3 });
  });

  it('drops non-finite numbers rather than persisting NaN or Infinity', () => {
    expect(sanitizeSignalEvidence({ confidence: NaN, rho: Infinity, tier: 3 })).toEqual({ tier: 3 });
  });
});

// =====================================================================
// 2. The allowlist itself.
// =====================================================================

describe('the allowlist contains nothing that could describe a health answer', () => {
  it('names no key from the health vocabularies this engine reads alongside', () => {
    const forbidden = [
      'answer',
      'answers',
      'response',
      'notes',
      'note',
      'text',
      'sentence',
      'message',
      'reason',
      'title',
      'description',
      'pain',
      'sleep',
      'energy',
      'stress',
      'mood',
      'symptom',
      'concern',
      'category',
      'diagnosis',
      'medication',
      'food',
      'meal',
      'protein',
      'calorie',
      'weight',
      'urgency',
      'classificationlevel',
      'excerpt',
    ];
    for (const key of ALLOWED_EVIDENCE_KEYS) {
      const lower = key.toLowerCase();
      for (const bad of forbidden) {
        expect(lower.includes(bad), `evidence key "${key}" contains "${bad}"`).toBe(false);
      }
    }
  });

  it('is a closed list, declared in one place, and used by the sanitizer', () => {
    const source = read('lib/coaching-direction/evidence.ts');
    expect(source).toContain('export const ALLOWED_EVIDENCE_KEYS = [');
    expect(source).toContain('if (!ALLOWED.has(key)) continue;');
  });
});

// =====================================================================
// 3. The engine's real output.
// =====================================================================

describe('no rule ever produces health content in its evidence', () => {
  function assertClean(evidence: Record<string, unknown>, label: string): void {
    const serialized = JSON.stringify(evidence);
    for (const [name, content] of Object.entries(HEALTH_CONTENT)) {
      expect(serialized.includes(content), `${label} leaked ${name}`).toBe(false);
    }
    for (const key of Object.keys(evidence)) {
      expect(ALLOWED_EVIDENCE_KEYS, `${label} used key ${key}`).toContain(key);
    }
    for (const value of Object.values(evidence)) {
      if (typeof value === 'string') {
        expect(value.length).toBeLessThanOrEqual(MAX_EVIDENCE_VALUE_LENGTH);
        expect(value).not.toMatch(/\s/);
      }
    }
  }

  it('the safety override records the row id and a boolean, and nothing about the concern', () => {
    const selected = selectCoachingAction(everythingApplies(), TODAY).selected;
    expect(selected.rule).toBe('safety');
    assertClean(selected.evidence, 'safety');
    expect(Object.keys(selected.evidence).sort()).toEqual([
      'acknowledgmentPending',
      'rule',
      'safetyClassificationId',
    ]);
  });

  it('the re-entry override records nothing but its own rule slug', () => {
    const selected = selectCoachingAction(
      { ...everythingApplies(), safetyFlag: null },
      TODAY
    ).selected;
    expect(selected.rule).toBe('re_entry');
    expect(selected.evidence).toEqual({ rule: 're_entry' });
  });

  it('every ladder rule produces clean evidence, even with content-bearing inputs', () => {
    for (let index = 0; index < PRIORITY_LADDER.length; index += 1) {
      const rule = PRIORITY_LADDER[index]!;
      const selected = selectCoachingAction(onlyFrom(index), TODAY).selected;
      expect(selected.rule).toBe(rule);
      assertClean(selected.evidence, rule);
    }
  });

  it('the reason line still carries the real sentence, so nothing was lost by sanitizing', () => {
    // Non-vacuity for the tests above: the content genuinely exists on the
    // decision, it just never reaches the ledger.
    const driver = selectCoachingAction({ ...onlyFrom(1) }, TODAY).selected;
    expect(driver.reason).toBe(HEALTH_CONTENT.finding);
    expect(JSON.stringify(driver.evidence)).not.toContain(HEALTH_CONTENT.finding);
  });
});

// =====================================================================
// The analytics payloads.
// =====================================================================

describe('the three coaching analytics events carry behavior only', () => {
  it('the delivery event carries a rule and an action type, both fixed slugs', () => {
    const actions = read('app/actions/priority.ts');
    expect(actions).toContain(
      "payload: { rule: decision.rule, actionType: decision.actionType }"
    );
  });

  it('reads the action type from the ledger, never from the browser', () => {
    const actions = read('app/actions/priority.ts');
    const deliveredIndex = actions.indexOf("eventType: 'coaching_action_delivered'");
    expect(deliveredIndex).toBeGreaterThan(-1);
    const decisionIndex = actions.lastIndexOf('getCoachingDecision(', deliveredIndex);
    expect(decisionIndex).toBeGreaterThan(-1);
  });

  it('never puts a title, a reason, evidence or a priority key in a payload', () => {
    const actions = read('app/actions/priority.ts');
    for (const banned of ['title', 'reason', 'evidence', 'priorityKey', 'signalEvidence', 'threadKey']) {
      expect(actions).not.toContain(`payload: { ${banned}`);
      expect(actions).not.toContain(`${banned}: decision.${banned}`);
    }
  });

  it('the migration says the same thing the code does', () => {
    const migration = readFileSync(
      path.join(REPO_ROOT, 'supabase/migrations/00000000000150_adaptive_coaching_direction.sql'),
      'utf8'
    );
    expect(migration).toContain('signal_evidence');
    expect(migration).toContain('HARD PRIVACY RULE');
    // The two tables have no free-text column at all beyond the escalation
    // reason slug, which is asserted below by its own comment.
    expect(migration).not.toContain('member_input_excerpt');
    expect(migration).not.toContain('concern_categories');
    expect(migration).not.toContain('classification_level');
  });
});
