/**
 * Adaptive Coaching Direction Part 3 — the coach escalation surface and the
 * post-resolution cooldown.
 *
 * No database. The view builder is pure, and the cooldown is one comparison
 * inside the pure adaptation guardrail, so both are testable without one.
 * The RLS, the SECURITY DEFINER resolve function and the real column
 * behavior are covered against real Postgres in
 * tests/coaching-grades-integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  ESCALATION_ACTION_TYPE_LABEL,
  ESCALATION_RESPONSE_LABEL,
  ESCALATION_RULE_LABEL,
  ESCALATION_SIGNAL_KEYS,
  buildEscalationView,
  collectSignalKeys,
  describeThreadItem,
} from '@/lib/coaching-direction/escalation';
import type {
  EscalatedThreadDecision,
  EscalatedThreadRow,
} from '@/lib/coaching-direction/escalation';
import { ESCALATION_COOLDOWN_DAYS } from '@/lib/coaching-direction/escalationData';
import { adaptThread } from '@/lib/coaching-direction/adaptation';
import { ALLOWED_EVIDENCE_KEYS } from '@/lib/coaching-direction/evidence';
import {
  COACHING_ACTION_TYPES,
  MEMBER_RESPONSES,
  type CoachingThreadState,
} from '@/lib/coaching-direction/types';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES } from '@/lib/priority/types';
import { NO_ADAPTATION, selectCoachingAction } from '@/lib/priority/select';
import type { PriorityInputs } from '@/lib/priority/types';

const TODAY = '2026-08-12';

function thread(overrides: Partial<EscalatedThreadRow> = {}): EscalatedThreadRow {
  return {
    threadKey: 'behavioral_friction::daily_reset_incomplete',
    rule: 'behavioral_friction',
    actionType: 'reset',
    approachChanges: 2,
    coachEscalatedAt: '2026-08-10T14:03:00.000Z',
    escalationCount: 1,
    firstSelectedLocalDate: '2026-07-28',
    lastSelectedLocalDate: '2026-08-10',
    ...overrides,
  };
}

function ledgerRow(
  overrides: Partial<EscalatedThreadDecision> = {}
): EscalatedThreadDecision {
  return {
    threadKey: 'behavioral_friction::daily_reset_incomplete',
    memberResponse: 'ignored',
    signalEvidence: {
      rule: 'behavioral_friction',
      frictionKind: 'daily_reset_incomplete',
      signalType: 'repeated_incomplete_flow',
      starts: 5,
      completions: 1,
    },
    ...overrides,
  };
}

// =====================================================================
// The view.
// =====================================================================

describe('the escalation view says what Root tried and what she did about it', () => {
  const view = buildEscalationView(thread(), [
    ledgerRow({ memberResponse: 'ignored' }),
    ledgerRow({ memberResponse: 'ignored' }),
    ledgerRow({ memberResponse: 'ignored' }),
    ledgerRow({ memberResponse: 'not_seen' }),
  ]);

  it('names the rule and the kind of action in plain language, not as slugs', () => {
    expect(view.ruleLabel).toBe(ESCALATION_RULE_LABEL.behavioral_friction);
    expect(view.ruleLabel).not.toContain('_');
    expect(view.actionTypeLabel).toBe(ESCALATION_ACTION_TYPE_LABEL.reset);
    expect(view.actionTypeLabel).not.toContain('_');
  });

  it('reports approaches TRIED, which is one more than the number of changes', () => {
    expect(view.approachesTried).toBe(3);
  });

  it('tallies her responses, keeping ignored and never-seen apart', () => {
    const byResponse = Object.fromEntries(view.responses.map((r) => [r.response, r.count]));
    expect(byResponse.ignored).toBe(3);
    expect(byResponse.not_seen).toBe(1);
    expect(byResponse.done).toBeUndefined();
  });

  it('omits responses that never happened rather than showing a row of zeroes', () => {
    expect(view.responses.every((r) => r.count > 0)).toBe(true);
  });

  it('reports when it was escalated, and how many days it was shown', () => {
    expect(view.escalatedAt).toBe('2026-08-10T14:03:00.000Z');
    expect(view.deliveredCount).toBe(4);
  });

  it('only counts ledger rows belonging to this thread', () => {
    const mixed = buildEscalationView(thread(), [
      ledgerRow(),
      ledgerRow({ threadKey: 'implicated_driver::SLP-3', memberResponse: 'done' }),
    ]);
    expect(mixed.deliveredCount).toBe(1);
    expect(mixed.responses.some((r) => r.response === 'done')).toBe(false);
  });

  it('never reports an escalation count below one for a visibly flagged thread', () => {
    expect(buildEscalationView(thread({ escalationCount: 0 }), []).escalationCount).toBe(1);
  });
});

describe('the thread item is translated where the slug allows, and labelled where it does not', () => {
  it('turns a friction kind into a phrase', () => {
    expect(describeThreadItem('behavioral_friction', 'behavioral_friction::daily_reset_incomplete'))
      .toBe('the Daily Reset being started and not finished');
  });

  it('labels a library identifier rather than inventing a friendlier name for it', () => {
    expect(describeThreadItem('implicated_driver', 'implicated_driver::SLP-3')).toBe(
      'Driver: SLP-3'
    );
  });

  it('returns nothing for a rule with no specific item', () => {
    expect(describeThreadItem('daily_reset', 'daily_reset::-')).toBeNull();
  });

  it('survives an unknown rule without throwing or guessing', () => {
    expect(describeThreadItem('something_new', 'something_new::x')).toBe('x');
    expect(buildEscalationView(thread({ rule: 'something_new' }), []).ruleLabel).toBe(
      'A coaching thread'
    );
  });
});

describe('the signal keys shown are identifiers, deduped, in the declared order', () => {
  it('surfaces only keys on the declared list', () => {
    const keys = collectSignalKeys([ledgerRow()]).map((s) => s.key);
    expect(keys).toContain('frictionKind');
    expect(keys).toContain('signalType');
    // Measurements are deliberately not identifiers and are not shown here.
    expect(keys).not.toContain('starts');
    expect(keys).not.toContain('completions');
  });

  it('is a narrowing of the ledger allowlist rather than a second, wider one', () => {
    for (const key of ESCALATION_SIGNAL_KEYS) {
      expect(ALLOWED_EVIDENCE_KEYS as readonly string[]).toContain(key);
    }
  });

  it('shows one entry per key however many rows carry it', () => {
    const keys = collectSignalKeys([ledgerRow(), ledgerRow(), ledgerRow()]);
    expect(new Set(keys.map((s) => s.key)).size).toBe(keys.length);
  });

  it('skips a key that is null or missing rather than showing an empty value', () => {
    const keys = collectSignalKeys([
      { threadKey: 'x', memberResponse: null, signalEvidence: { driverId: null } },
    ]);
    expect(keys).toEqual([]);
  });
});

describe('every slug in the closed sets has plain language, so nothing renders as a raw slug', () => {
  it('covers every action type', () => {
    for (const actionType of COACHING_ACTION_TYPES) {
      expect(ESCALATION_ACTION_TYPE_LABEL[actionType]).toBeTruthy();
    }
  });

  it('covers every member response', () => {
    for (const response of MEMBER_RESPONSES) {
      expect(ESCALATION_RESPONSE_LABEL[response]).toBeTruthy();
    }
  });

  it('covers every rule on the ladder and both overrides', () => {
    for (const rule of [...PRIORITY_LADDER, ...PRIORITY_OVERRIDES]) {
      expect(ESCALATION_RULE_LABEL[rule]).toBeTruthy();
    }
  });

  it('contains no em dash, per the app-wide ban', () => {
    const all = [
      ...Object.values(ESCALATION_RULE_LABEL),
      ...Object.values(ESCALATION_ACTION_TYPE_LABEL),
      ...Object.values(ESCALATION_RESPONSE_LABEL),
    ];
    for (const label of all) expect(label).not.toContain('—');
  });
});

// =====================================================================
// The cooldown.
// =====================================================================

function threadState(overrides: Partial<CoachingThreadState> = {}): CoachingThreadState {
  return {
    threadKey: 'behavioral_friction::daily_reset_incomplete',
    rule: 'behavioral_friction',
    actionType: 'reset',
    approach: 0,
    approachChanges: 0,
    consecutiveIgnored: 0,
    responsesSinceLastChange: 0,
    firstSelectedLocalDate: '2026-07-28',
    lastSelectedLocalDate: '2026-08-10',
    coachEscalatedAt: null,
    coachEscalationReason: null,
    escalationCooldownUntil: null,
    ...overrides,
  };
}

describe('resolving clears the flag and hands back a cooldown, not an immediate retry', () => {
  it('blocks the thread while the cooldown has not elapsed', () => {
    const outcome = adaptThread(threadState({ escalationCooldownUntil: '2026-08-20' }), TODAY);
    expect(outcome.blocked).toBe(true);
  });

  it('stops blocking on the cooldown date itself', () => {
    const outcome = adaptThread(threadState({ escalationCooldownUntil: TODAY }), TODAY);
    expect(outcome.blocked).toBe(false);
  });

  it('blocks WITHOUT escalating or counting anything, unlike a real escalation', () => {
    const outcome = adaptThread(threadState({ escalationCooldownUntil: '2026-08-20' }), TODAY);
    expect(outcome.escalate).toBe(false);
    expect(outcome.changed).toBe(false);
  });

  it('a still-escalated thread is blocked regardless of any cooldown', () => {
    const outcome = adaptThread(
      threadState({
        coachEscalatedAt: '2026-08-10T00:00:00.000Z',
        escalationCooldownUntil: '2020-01-01',
      }),
      TODAY
    );
    expect(outcome.blocked).toBe(true);
  });

  it('a thread with no cooldown at all behaves exactly as it did in Part 1', () => {
    expect(adaptThread(threadState(), TODAY)).toEqual(adaptThread(threadState(), '2030-01-01'));
    expect(adaptThread(threadState(), TODAY).blocked).toBe(false);
  });

  it('the cooldown is shorter than the dead-grade decay, because a coach actively looked at it', () => {
    expect(ESCALATION_COOLDOWN_DAYS).toBeLessThan(21);
    expect(ESCALATION_COOLDOWN_DAYS).toBeGreaterThan(0);
  });
});

describe('through the whole engine, a cooling-down thread simply loses to the next rung', () => {
  function twoRungs(): PriorityInputs {
    return {
      safetyFlag: null,
      isReEntry: false,
      resetPlan: null,
      implicatedDriver: {
        driverId: 'SLP-3',
        domainKey: 'SLP',
        label: 'Bedtime consistency',
        whatItObserves: 'How much bedtime varies night to night',
        findingSentence: 'On steadier nights your next-day energy tends to be higher.',
      },
      qualifiedPattern: null,
      incompleteAction: null,
      behavioralFriction: null,
      todaysFocus: null,
      fallback: { checkinDoneToday: false, totalCheckins: 12, statedGoalLabel: null },
      hasRealHistory: true,
    };
  }

  it('the driver rung wins normally', () => {
    expect(selectCoachingAction(twoRungs(), TODAY, NO_ADAPTATION).selected.rule).toBe(
      'implicated_driver'
    );
  });

  it('and falls through to the fallback while its thread is cooling down', () => {
    const cooling = threadState({
      threadKey: 'implicated_driver::SLP-3',
      rule: 'implicated_driver',
      actionType: 'reflection',
      escalationCooldownUntil: '2026-08-20',
    });
    const result = selectCoachingAction(twoRungs(), TODAY, {
      ...NO_ADAPTATION,
      threads: new Map([[cooling.threadKey, cooling]]),
    });
    expect(result.selected.rule).toBe('daily_reset');
    // Nothing was escalated and nothing was counted: a cooldown is a pause.
    expect(result.threadChanges).toEqual([]);
  });

  it('and comes back on its own once the cooldown has passed, with no job having run', () => {
    const cooled = threadState({
      threadKey: 'implicated_driver::SLP-3',
      rule: 'implicated_driver',
      actionType: 'reflection',
      escalationCooldownUntil: '2026-08-12',
    });
    const result = selectCoachingAction(twoRungs(), TODAY, {
      ...NO_ADAPTATION,
      threads: new Map([[cooled.threadKey, cooled]]),
    });
    expect(result.selected.rule).toBe('implicated_driver');
  });
});
