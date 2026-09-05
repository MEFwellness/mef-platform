/**
 * NO BUTTON MAY CLAIM SOMETHING THE ROWS DO NOT SUPPORT.
 *
 * THE BUG, FOUND ON A REAL PHONE (2026-09-05). The Priority Card pop-up
 * read "Morning Mobility is there if you want it today." and offered Done,
 * Help me and Save for later. Nothing had been started. Confirmed on
 * production for a real account: `member_daily_priorities` held rule
 * `movement_session`, that exact title, href `/movement/sessions/
 * morning_mobility`, status `active`. Tapping Done would have written the
 * status, an outcome ledger row answered 'done', and a
 * `coaching_action_acted` event: three rows saying she did a workout she
 * had not opened.
 *
 * WHAT THIS FILE PROVES, in three layers:
 *
 *   THE RULE       lib/priority/actions.ts, over every mode and both
 *                  fallbacks. Pure, so it is asserted directly.
 *   THE ENGINE     every rung of the real hierarchy, driven through the
 *                  real `selectPriority`, so the whole message/button
 *                  table is a property of the shipped engine rather than
 *                  of a fixture. This is the sweep the brief asked for.
 *   THE SURFACES   both presentations and the server action, read off the
 *                  files themselves, so a later edit cannot put a Done
 *                  back onto an offer or slip a write past the refusal.
 *
 * THE ONE SENTENCE ALL THREE ENFORCE: a priority whose thing lives inside
 * this app is an OFFER and is never answered with a self-reported
 * completion claim, because the app records what actually happens at the
 * destination. Only a priority she is the sole witness to is offered Done.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  acceptsDoneClaim,
  priorityActionMode,
  priorityActionSet,
} from '@/lib/priority/actions';
import {
  PRIORITY_ACKNOWLEDGED_TEXT,
  PRIORITY_BUTTON_LABELS,
  PRIORITY_NOT_TODAY_TEXT,
  PRIORITY_OPEN_FALLBACK_LABEL,
  PRIORITY_SAVED_TEXT,
} from '@/lib/priority/copy';
import { selectPriority } from '@/lib/priority/select';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES } from '@/lib/priority/types';
import type { MovementInput, PriorityInputs, PriorityRule } from '@/lib/priority/types';
import { MOVEMENT_SESSION_ORDER } from '@/lib/coaching-direction/movement';
import type { MovementSessionOption } from '@/lib/coaching-direction/movement';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf-8');
const TODAY = '2026-09-05';

/** Every label that asserts a thing was finished. None may reach an offer. */
const COMPLETION_LABELS = [PRIORITY_BUTTON_LABELS.done, PRIORITY_BUTTON_LABELS.save];

// ---------------------------------------------------------------------
// Fixtures. The six real sessions as the database publishes them.
// ---------------------------------------------------------------------

function sessions(): MovementSessionOption[] {
  return MOVEMENT_SESSION_ORDER.map((sessionKey) => ({
    sessionKey,
    name: sessionKey
      .split('_')
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(' '),
    lastCompletedLocalDate: null,
  }));
}

function movement(overrides: Partial<MovementInput> = {}): MovementInput {
  return { sessions: sessions(), coachAssignedToday: false, ...overrides };
}

function base(checkinDoneToday: boolean): PriorityInputs {
  return {
    safetyFlag: null,
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
    qualifiedPattern: null,
    incompleteAction: null,
    behavioralFriction: null,
    todaysFocus: null,
    movement: movement(),
    fallback: { checkinDoneToday, totalCheckins: 22, statedGoalLabel: 'Sleep better' },
    hasRealHistory: true,
  };
}

// =====================================================================
// 1. The rule itself.
// =====================================================================

describe('the rule: a destination inside the app makes it an offer', () => {
  it('an href of any kind means offer, on every rule but safety', () => {
    for (const rule of [...PRIORITY_LADDER, 're_entry'] as PriorityRule[]) {
      expect(priorityActionMode(rule, '/movement/sessions/desk_reset'), rule).toBe('offer');
      expect(priorityActionMode(rule, null), rule).toBe('self_report');
    }
  });

  it('safety is neither, with or without an address', () => {
    expect(priorityActionMode('safety', null)).toBe('acknowledge');
    expect(priorityActionMode('safety', '/checkin')).toBe('acknowledge');
  });

  it('only a self-reported priority accepts a Done claim', () => {
    expect(acceptsDoneClaim('gentle_focus', null)).toBe(true);
    expect(acceptsDoneClaim('reset_plan_commitment', null)).toBe(true);
    expect(acceptsDoneClaim('movement_session', '/movement/sessions/desk_reset')).toBe(false);
    expect(acceptsDoneClaim('daily_reset', '/checkin')).toBe(false);
    expect(acceptsDoneClaim('safety', null)).toBe(false);
  });

  it('an offer opens the thing by its own name, and declines with "Not today"', () => {
    const set = priorityActionSet({
      rule: 'movement_session',
      href: '/movement/sessions/morning_mobility',
      openTarget: 'Morning Mobility',
    });
    expect(set.primary).toEqual({
      kind: 'open',
      label: 'Open Morning Mobility',
      href: '/movement/sessions/morning_mobility',
    });
    expect(set.setAsideLabel).toBe('Not today');
    expect(set.setAsideText).toBe(PRIORITY_NOT_TODAY_TEXT);
  });

  it('an offer with no name to carry falls back to the app\'s own plain words', () => {
    const set = priorityActionSet({ rule: 'incomplete_action', href: '/x', openTarget: null });
    expect(set.primary).toEqual({ kind: 'open', label: PRIORITY_OPEN_FALLBACK_LABEL, href: '/x' });
  });

  it('a self-reported priority keeps Done and Save for later', () => {
    const set = priorityActionSet({ rule: 'gentle_focus', href: null, openTarget: null });
    expect(set.primary).toEqual({ kind: 'done', label: 'Done' });
    expect(set.setAsideLabel).toBe('Save for later');
    expect(set.setAsideText).toBe(PRIORITY_SAVED_TEXT);
  });

  it('the safety override offers nothing to claim and nothing to open', () => {
    const set = priorityActionSet({ rule: 'safety', href: null, openTarget: null });
    expect(set.primary).toBeNull();
    expect(set.setAsideLabel).toBe('Okay');
    expect(set.setAsideText).toBe(PRIORITY_ACKNOWLEDGED_TEXT);
  });

  it('NO completion label can ever appear on an offer or on safety', () => {
    for (const rule of [...PRIORITY_OVERRIDES, ...PRIORITY_LADDER] as PriorityRule[]) {
      for (const href of [null, '/checkin', '/food-lens', '/movement/sessions/desk_reset']) {
        const set = priorityActionSet({ rule, href, openTarget: 'A Thing' });
        if (set.mode === 'self_report') continue;
        expect(set.primary?.kind, `${rule} ${href}`).not.toBe('done');
        for (const label of COMPLETION_LABELS) {
          expect(set.primary?.label, `${rule} ${href}`).not.toBe(label);
          expect(set.setAsideLabel, `${rule} ${href}`).not.toBe(label);
        }
      }
    }
  });
});

// =====================================================================
// 2. The sweep: every rung of the real engine, and what it may say.
// =====================================================================

/**
 * One row per way the card can be reached, driven through the real
 * hierarchy rather than hand-built. `expectMode` is the claim under test;
 * `expectPrimary` is what a member actually reads on the button.
 */
const SWEEP: {
  rule: PriorityRule;
  what: string;
  inputs: PriorityInputs;
  expectMode: 'offer' | 'self_report' | 'acknowledge';
  expectPrimary: string | null;
}[] = [
  {
    rule: 'safety',
    what: 'an unresolved safety flag',
    inputs: { ...base(false), safetyFlag: { safetyClassificationId: 'flag-1' } },
    expectMode: 'acknowledge',
    expectPrimary: null,
  },
  {
    rule: 're_entry',
    what: 'a real absence',
    inputs: { ...base(false), isReEntry: true },
    expectMode: 'offer',
    expectPrimary: 'Open your Daily Reset',
  },
  {
    rule: 'reset_plan_commitment',
    what: 'her own agreed action, done in her life',
    inputs: {
      ...base(true),
      resetPlan: {
        planId: 'p1',
        planVersionId: 'v1',
        actionText: 'Put your phone on the shelf after dinner.',
        difficultDayText: 'Put it face down for ten minutes.',
        daysLogged: 3,
        daysSinceStart: 5,
      },
    },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
  {
    rule: 'implicated_driver',
    what: 'a driver with no session behind it: something to notice',
    inputs: {
      ...base(true),
      implicatedDriver: {
        driverId: 'SLP-1',
        domainKey: 'SLP',
        label: 'Bedtime consistency',
        whatItObserves: 'How much bedtime varies night to night',
        findingSentence: null,
      },
    },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
  {
    rule: 'implicated_driver',
    what: 'a driver WITH a mapped session: the offer that started all this',
    inputs: {
      ...base(true),
      implicatedDriver: {
        driverId: 'MOV-1',
        domainKey: 'MOV',
        label: 'Sitting hours',
        whatItObserves: 'Total sedentary time',
        findingSentence: null,
      },
    },
    expectMode: 'offer',
    expectPrimary: 'Open Desk Reset',
  },
  {
    rule: 'qualified_pattern',
    what: 'a tier 3 finding: something to notice',
    inputs: {
      ...base(true),
      qualifiedPattern: {
        pairKey: 'bedtime~energy',
        label: 'Bedtime consistency and next-day energy',
        memberSentence: 'On steadier nights, your next day tends to hold up better.',
        confidence: 0.8,
        observationCount: 21,
      },
    },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
  {
    rule: 'incomplete_action',
    what: 'something she started and left, which lives at an address',
    inputs: {
      ...base(true),
      incompleteAction: {
        key: 'life-signal-check',
        name: 'Life Signal Check',
        href: '/assessments/life-signal-check',
        resumeHint: 'The next question is the short one.',
        lastTouchedLocalDate: '2026-09-01',
      },
    },
    expectMode: 'offer',
    expectPrimary: 'Open Life Signal Check',
  },
  {
    rule: 'behavioral_friction',
    what: 'the Daily Reset, opened more than finished',
    inputs: {
      ...base(false),
      behavioralFriction: {
        kind: 'daily_reset_incomplete',
        signalType: 'repeated_incomplete_flow',
        starts: 5,
        completions: 1,
        completionRate: 0.2,
        savedCount: null,
        windowDays: 21,
        evidenceSufficiency: 'sufficient',
      },
    },
    expectMode: 'offer',
    expectPrimary: 'Open your Daily Reset',
  },
  {
    rule: 'behavioral_friction',
    what: 'food logging gone quiet',
    inputs: {
      ...base(true),
      behavioralFriction: {
        kind: 'food_logging_lapsed',
        signalType: 'feature_use_declined',
        starts: null,
        completions: null,
        completionRate: null,
        savedCount: null,
        windowDays: 21,
        evidenceSufficiency: 'sufficient',
      },
    },
    expectMode: 'offer',
    expectPrimary: 'Open Food Lens',
  },
  {
    rule: 'behavioral_friction',
    what: 'three slow breaths, which happen in her life and nowhere else',
    inputs: {
      ...base(true),
      behavioralFriction: {
        kind: 'chronic_save_for_later',
        signalType: null,
        starts: null,
        completions: null,
        completionRate: null,
        savedCount: 4,
        windowDays: 7,
        evidenceSufficiency: null,
      },
    },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
  {
    rule: 'todays_focus',
    what: "the Coaching Brain's focus, which is a thing to hold in mind",
    inputs: {
      ...base(true),
      todaysFocus: {
        feedItemId: 'feed-1',
        focusText: 'Let one meal today be slower than the rest.',
        reasonText: null,
        suggestedAction: null,
      },
    },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
  {
    rule: 'movement_session',
    what: 'the exact state found live: a session offered after her check-in',
    inputs: base(true),
    expectMode: 'offer',
    expectPrimary: 'Open Morning Mobility',
  },
  {
    rule: 'daily_reset',
    what: 'the check-in she has not done',
    inputs: { ...base(false), movement: null },
    expectMode: 'offer',
    expectPrimary: 'Open your Daily Reset',
  },
  {
    rule: 'gentle_focus',
    what: 'her own stated goal, quoted back',
    inputs: { ...base(true), movement: null },
    expectMode: 'self_report',
    expectPrimary: 'Done',
  },
];

describe('the sweep: every message the card can render, and the buttons it may show', () => {
  it.each(SWEEP)('$rule: $what', ({ rule, inputs, expectMode, expectPrimary }) => {
    const selected = selectPriority(inputs, TODAY);
    // The row really is the rung under test, so the assertion below is
    // about that rung rather than about whatever won instead.
    expect(selected.rule).toBe(rule);

    const set = priorityActionSet(selected);
    expect(set.mode).toBe(expectMode);
    expect(set.primary?.label ?? null).toBe(expectPrimary);
    expect(set.helpLabel).toBe('Help me');

    if (expectMode === 'offer') {
      expect(set.primary?.kind).toBe('open');
      expect(selected.href).toBeTruthy();
      expect(set.setAsideLabel).toBe('Not today');
      // The thing it opens is the address the engine chose, not a guess.
      expect((set.primary as { href: string }).href).toBe(selected.href);
    }
    if (expectMode === 'self_report') {
      expect(selected.href).toBeNull();
      expect(set.setAsideLabel).toBe('Save for later');
    }
  });

  it('covers every rule the engine can produce, so nothing was left unswept', () => {
    const swept = new Set(SWEEP.map((row) => row.rule));
    for (const rule of [...PRIORITY_OVERRIDES, ...PRIORITY_LADDER]) {
      expect(swept.has(rule), `${rule} is not in the sweep`).toBe(true);
    }
  });

  it('the two adapted framings keep the mode: a smaller ask is still an offer', () => {
    // approach 1 replaces the title with the rule's own smaller step, and
    // approach 2 reframes it. Neither may turn an offer into a claim, so
    // both must carry the address through.
    const offer = selectPriority(base(true), TODAY);
    expect(offer.rule).toBe('movement_session');
    for (const approach of [{ ...offer, title: offer.help, approach: 1 }, { ...offer, reason: null, approach: 2 }]) {
      expect(priorityActionSet(approach).mode).toBe('offer');
      expect(priorityActionSet(approach).primary?.kind).toBe('open');
    }
  });
});

// =====================================================================
// 3. The surfaces.
// =====================================================================

describe('both presentations draw their buttons from the one decision', () => {
  const CARD = read('components/priority/PriorityCard.tsx');
  const POPUP = read('components/priority/PriorityCardPopup.tsx');

  it.each([
    ['the inline card', CARD],
    ['the pop-up', POPUP],
  ])('%s asks lib/priority/actions.ts rather than deciding for itself', (_name, source) => {
    expect(source).toMatch(/from '@\/lib\/priority\/actions'/);
    expect(source).toMatch(/priorityActionSet\(selected\)/);
  });

  it.each([
    ['the inline card', CARD],
    ['the pop-up', POPUP],
  ])('%s reaches onDone only inside the done branch', (_name, source) => {
    // Every `onClick={onDone}` in the file must sit inside a
    // `primary?.kind === 'done'` guard. Counting is the check: one guard
    // per Done handler, and no Done handler without one.
    const doneHandlers = source.match(/onClick=\{onDone\}/g) ?? [];
    const doneGuards = source.match(/actions\.primary\?\.kind === 'done'/g) ?? [];
    expect(doneHandlers.length).toBeGreaterThan(0);
    expect(doneGuards.length).toBe(doneHandlers.length);
  });

  it.each([
    ['the inline card', CARD],
    ['the pop-up', POPUP],
  ])('%s hardcodes no button label at all', (_name, source) => {
    // Comments are stripped first, both kinds. These files explain what
    // the buttons used to be and why that changed, and prose naming an old
    // label is not a rendered label. What is left is what can reach a
    // screen.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const label of ['>Done<', 'Save for later', 'Not today', 'Help me']) {
      expect(code, label).not.toContain(label);
    }
    expect(code).not.toMatch(/PRIORITY_BUTTON_LABELS/);
  });

  it('the inline card no longer carries a second, separate way in', () => {
    // The old "Open it" link under the reason line and the primary button
    // would have been the same address twice. The primary is the one.
    expect(CARD).not.toMatch(/>\s*Open it\s*</);
  });
});

describe('the server refuses a completion claim it cannot support', () => {
  const ACTIONS = read('app/actions/priority.ts');

  it('completePriorityAction asks the same function the card asked', () => {
    expect(ACTIONS).toMatch(/from '@\/lib\/priority\/actions'/);
    expect(ACTIONS).toMatch(/if \(!acceptsDoneClaim\(record\.rule, record\.href\)\) \{\s*\n\s*return \{ ok: false \};/);
  });

  it('refuses BEFORE any write, including the Reset Plan daily log', () => {
    // Measured inside the function itself: every one of these names also
    // appears in the import list at the top of the file.
    const ACTIONS = read('app/actions/priority.ts').slice(
      read('app/actions/priority.ts').indexOf('export async function completePriorityAction')
    );
    const guard = ACTIONS.indexOf('acceptsDoneClaim(record.rule, record.href)');
    const planLog = ACTIONS.indexOf('upsertResetPlanDailyLog');
    const statusWrite = ACTIONS.indexOf("setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'done')");
    const outcome = ACTIONS.indexOf("recordCoachingOutcome(supabase, ctx, 'done')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(planLog);
    expect(guard).toBeLessThan(statusWrite);
    expect(guard).toBeLessThan(outcome);
  });

  it('leaves the movement auto-done path alone, which is the honest one', () => {
    // A completion Root can actually see still marks the card done, and it
    // writes through the same two functions it always did. That path is the
    // reason an offer needs no Done button in the first place.
    const OUTCOME = read('lib/coaching-direction/movementOutcome.ts');
    expect(OUTCOME).toMatch(/setDailyPriorityStatus\(supabase, memberId, localDate, 'done'\)/);
    expect(OUTCOME).toMatch(/decision\.signalEvidence\.sessionKey !== sessionKey/);
  });
});
