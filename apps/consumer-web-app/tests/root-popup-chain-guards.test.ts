/**
 * Bug sweep finding B1 (2026-08-27): the two priority_card branches in
 * app/actions/rootPopupMessages.ts returned their candidate
 * unconditionally, so one already-dismissed priority card silenced every
 * message below it for the rest of the day, including a Weekly Root Review
 * the member had never seen.
 *
 * The helper-level tests in tests/root-popup-messages.test.ts prove the
 * shared guard machinery works. They could not have caught this, because
 * the broken branches never called it. So these tests drive the REAL
 * chain, getMyRootPopupMessageAction, against a fake dismissal store, and
 * walk the whole matrix the fix has to satisfy:
 *
 *   every message kind
 *     x never shown / shown-and-dismissed / snoozed / ignored
 *     x a second load the same day
 *     x the next day (a new local date, and a new login)
 *
 * The two questions each cell answers are the two halves of this bug
 * class: nothing repeats when it should not, and nothing below a dismissed
 * row is starved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RootPopupDismissal, RootPopupDismissalStatus } from '../lib/root-popup-messages/data';

// ---------------------------------------------------------------------
// The fake world. Every dependency the chain reads is a knob here, so a
// test can put the member in one exact state and ask what pops.
// ---------------------------------------------------------------------

type World = {
  localDate: string;
  lastSignInAt: string;
  assignments: Array<{ assignmentId: string; title: string; primaryHref: string }>;
  hydrationFocus: string | null;
  cvsPending: 'day3' | 'day7' | null;
  cvsOfferSessionId: string | null;
  weeklyReviewWeekStart: string | null;
  weeklyReflectionWeekStart: string | null;
  priority: { rule: string; isReEntry: boolean; status: string } | null;
  freeArcKey: string | null;
  dismissals: Map<string, RootPopupDismissal>;
};

const world: World = {
  localDate: '2026-08-27',
  lastSignInAt: '2026-08-27T08:00:00.000Z',
  assignments: [],
  hydrationFocus: 'tracked',
  cvsPending: null,
  cvsOfferSessionId: null,
  weeklyReviewWeekStart: null,
  weeklyReflectionWeekStart: null,
  priority: null,
  freeArcKey: null,
  dismissals: new Map(),
};

function resetWorld(): void {
  world.localDate = '2026-08-27';
  world.lastSignInAt = '2026-08-27T08:00:00.000Z';
  world.assignments = [];
  world.hydrationFocus = 'tracked';
  world.cvsPending = null;
  world.cvsOfferSessionId = null;
  world.weeklyReviewWeekStart = null;
  world.weeklyReflectionWeekStart = null;
  world.priority = null;
  world.freeArcKey = null;
  world.dismissals = new Map();
}

/** What the pop-up client writes the instant a one-time message is shown. */
function markShown(messageKey: string): void {
  world.dismissals.set(messageKey, { status: 'ignored', snoozedAt: null });
}
function markSnoozed(messageKey: string, at: string): void {
  world.dismissals.set(messageKey, { status: 'snoozed', snoozedAt: at });
}
function markIgnored(messageKey: string): void {
  world.dismissals.set(messageKey, { status: 'ignored', snoozedAt: null });
}

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => ({ id: 'member-1', last_sign_in_at: world.lastSignInAt }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { timezone: 'America/New_York' } }) }),
      }),
    }),
  }),
}));

vi.mock('@/app/actions/checkin', () => ({
  resolveLocalDate: async () => world.localDate,
}));

vi.mock('@/lib/root-popup-messages/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/root-popup-messages/data')>();
  return {
    ...actual,
    getRootPopupDismissal: async (_c: unknown, _m: string, messageKey: string) =>
      world.dismissals.get(messageKey) ?? null,
  };
});

vi.mock('@/app/actions/questionnaireCatalog', () => ({
  getMyQuestionnaireCatalog: async () => ({
    assigned: world.assignments.map((a) => ({
      assignmentId: a.assignmentId,
      title: a.title,
      primaryHref: a.primaryHref,
      key: a.assignmentId,
      description: '',
    })),
    available: world.freeArcKey
      ? [
          {
            key: world.freeArcKey,
            title: 'Core Values Snapshot',
            description: 'A short conversation.',
            primaryHref: '/core-values-snapshot',
          },
        ]
      : [],
    completed: [],
  }),
  getMyBodyAssessmentAssignmentCard: async () => null,
}));

vi.mock('@/lib/root-popup-messages/freeArc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/root-popup-messages/freeArc')>();
  return {
    ...actual,
    pickNextFreeArcCard: (catalog: { available: Array<Record<string, unknown>> }) =>
      catalog.available[0] ?? null,
  };
});

vi.mock('@/lib/hydration/data', () => ({
  fetchHydrationFocus: async () => ({ focus: world.hydrationFocus }),
}));

vi.mock('@/app/actions/coreValuesSnapshot', () => ({
  getMyCvsExperimentStatusAction: async () =>
    world.cvsPending
      ? {
          experiment: {
            id: 'cvs-exp-1',
            title: 'A small experiment',
            status: 'active',
            durationDays: 7,
            day7AcknowledgedAt: null,
          },
          // A day-7 message is only pending once day 3 has been answered
          // (resolveCvsCheckinPending's own oldest-unhandled-first rule),
          // so the day-7 case must carry an answered day-3 log.
          logs: world.cvsPending === 'day7' ? [{ day3Response: 'yes' }] : [],
          isDay3Eligible: true,
          isDay7Eligible: world.cvsPending === 'day7',
        }
      : null,
  getMyCvsOfferAction: async () =>
    world.cvsOfferSessionId
      ? { sessionId: world.cvsOfferSessionId, scoring: { placeholder: true } }
      : null,
}));

vi.mock('@/app/actions/lifeSignalCheck', () => ({
  getMyLscExperimentStatusAction: async () => null,
  getMyLscOfferAction: async () => null,
}));
vi.mock('@/app/actions/readinessPulse', () => ({
  getMyRplExperimentStatusAction: async () => null,
  getMyRplOfferAction: async () => null,
}));
vi.mock('@/app/actions/resetPlan', () => ({
  getMyResetPlanDashboardStateAction: async () => ({ kind: 'none' }),
}));

vi.mock('@/lib/priority/view', () => ({
  getMyPriorityView: async () =>
    world.priority
      ? {
          status: world.priority.status,
          isReEntry: world.priority.isReEntry,
          selected: { rule: world.priority.rule },
        }
      : null,
}));

vi.mock('@/lib/weekly-review/view', () => ({
  getMyWeeklyReview: async () =>
    world.weeklyReviewWeekStart
      ? { weekStart: world.weeklyReviewWeekStart, review: { sections: [] } }
      : null,
}));

// The Weekly Reflection is program tier only and Friday to Sunday only,
// and both of those live inside this one accessor (see
// lib/weekly-reflection/service.ts). Setting the week start here is
// therefore exactly "she is a program member, inside her window, and has
// not finished it yet"; leaving it null is every other member on every
// other day, which is why the rest of this file's matrix is unaffected.
vi.mock('@/lib/weekly-reflection/view', () => ({
  getMyWeeklyReflection: async () =>
    world.weeklyReflectionWeekStart
      ? { status: 'pending', weekStart: world.weeklyReflectionWeekStart }
      : null,
}));

vi.mock('@/lib/memory-callback/data', () => ({ fetchGoalCallbackContext: async () => null }));
vi.mock('@/lib/memory-callback/copy', () => ({ buildGoalCallback: () => null }));

const { getMyRootPopupMessageAction } = await import('../app/actions/rootPopupMessages');

beforeEach(() => {
  resetWorld();
});

const PRIORITY_KEY = 'priority_card:2026-08-27';
const PRIORITY_KEY_TOMORROW = 'priority_card:2026-08-28';
const REVIEW_KEY = 'weekly_review:2026-08-24';
const REFLECTION_KEY = 'weekly_reflection:2026-08-28';
const HYDRATION_KEY = 'hydration_focus:v1';

// ---------------------------------------------------------------------
// B1 itself: the exact production state the sweep measured.
// ---------------------------------------------------------------------

describe('B1: a dismissed priority card must not starve the chain below it', () => {
  it('reproduces the sweep: re-entry card already dismissed today, a genuinely due Weekly Root Review below it', async () => {
    world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    world.weeklyReviewWeekStart = '2026-08-24';

    // First open of the day: the takeover wins, as designed.
    const first = await getMyRootPopupMessageAction();
    expect(first?.kind).toBe('priority_card');
    expect(first?.messageKey).toBe(PRIORITY_KEY);

    // The pop-up client auto-dismisses it on mount.
    markShown(PRIORITY_KEY);

    // Second open, same day. Before the fix this was null: the branch
    // returned the card, and the outer check killed the whole call.
    const second = await getMyRootPopupMessageAction();
    expect(second?.kind).toBe('weekly_review');
    expect(second?.messageKey).toBe(REVIEW_KEY);
  });

  it('the ordinary daily card starves the free-arc invitation the same way', async () => {
    world.priority = { rule: 'todays_focus', isReEntry: false, status: 'active' };
    world.freeArcKey = 'core-values-snapshot';

    const first = await getMyRootPopupMessageAction();
    expect(first?.kind).toBe('priority_card');

    markShown(PRIORITY_KEY);

    const second = await getMyRootPopupMessageAction();
    expect(second?.kind).toBe('free_arc_available');
  });

  it('the re-entry card does not starve the hydration question either', async () => {
    world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    world.hydrationFocus = null;

    expect((await getMyRootPopupMessageAction())?.kind).toBe('priority_card');
    markShown(PRIORITY_KEY);
    expect((await getMyRootPopupMessageAction())?.kind).toBe('hydration_focus');
  });

  it('the re-entry card does not starve a day-3 follow-up either', async () => {
    world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    world.cvsPending = 'day3';

    expect((await getMyRootPopupMessageAction())?.kind).toBe('priority_card');
    markShown(PRIORITY_KEY);
    expect((await getMyRootPopupMessageAction())?.kind).toBe('cvs_day3');
  });

  it('with nothing below it, a dismissed priority card is silence, not a repeat', async () => {
    world.priority = { rule: 'todays_focus', isReEntry: false, status: 'active' };

    expect((await getMyRootPopupMessageAction())?.kind).toBe('priority_card');
    markShown(PRIORITY_KEY);
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });
});

// ---------------------------------------------------------------------
// The matrix: every kind x every dismissal state x same day / next day.
// ---------------------------------------------------------------------

/**
 * One row per message kind: how to put the member in the state where that
 * kind is the winner, its message key, and which dismissal lifetime it
 * uses. `oneTime` kinds are scoped by date or by session and never return
 * on a later login for the same key; `recurring` kinds come back after a
 * snooze once a real login has happened.
 */
const KINDS: Array<{
  kind: string;
  messageKey: string;
  lifetime: 'oneTime' | 'recurring';
  arrange: () => void;
}> = [
  {
    kind: 'questionnaire_assigned',
    messageKey: 'questionnaire_assigned:assignment-1',
    lifetime: 'recurring',
    arrange: () => {
      world.assignments = [
        { assignmentId: 'assignment-1', title: 'Health Check-In', primaryHref: '/a' },
      ];
    },
  },
  {
    kind: 'priority_card',
    messageKey: PRIORITY_KEY,
    lifetime: 'oneTime',
    arrange: () => {
      world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    },
  },
  {
    kind: 'hydration_focus',
    messageKey: HYDRATION_KEY,
    lifetime: 'recurring',
    arrange: () => {
      world.hydrationFocus = null;
    },
  },
  {
    kind: 'cvs_day3',
    messageKey: 'cvs_day3:cvs-exp-1',
    lifetime: 'recurring',
    arrange: () => {
      world.cvsPending = 'day3';
    },
  },
  {
    kind: 'cvs_day7',
    messageKey: 'cvs_day7:cvs-exp-1',
    lifetime: 'recurring',
    arrange: () => {
      world.cvsPending = 'day7';
    },
  },
  {
    kind: 'cvs_offer',
    messageKey: 'cvs_offer:session-1',
    lifetime: 'oneTime',
    arrange: () => {
      world.cvsOfferSessionId = 'session-1';
    },
  },
  {
    // Recurring, NOT one-time: this message asks something of her, so
    // "Maybe later" genuinely means ask again next login inside the
    // window. That is the whole difference from the Weekly Root Review
    // directly below it, which is Root reporting once.
    kind: 'weekly_reflection',
    messageKey: REFLECTION_KEY,
    lifetime: 'recurring',
    arrange: () => {
      world.weeklyReflectionWeekStart = '2026-08-28';
    },
  },
  {
    kind: 'weekly_review',
    messageKey: REVIEW_KEY,
    lifetime: 'oneTime',
    arrange: () => {
      world.weeklyReviewWeekStart = '2026-08-24';
    },
  },
  {
    kind: 'free_arc_available',
    messageKey: 'free_arc_available:core-values-snapshot',
    lifetime: 'recurring',
    arrange: () => {
      world.freeArcKey = 'core-values-snapshot';
    },
  },
];

describe('the matrix: every kind, every dismissal state, this login and the next', () => {
  for (const spec of KINDS) {
    describe(spec.kind, () => {
      it('never shown: it is the message', async () => {
        spec.arrange();
        const message = await getMyRootPopupMessageAction();
        expect(message?.kind).toBe(spec.kind);
        expect(message?.messageKey).toBe(spec.messageKey);
      });

      it('shown and auto-dismissed: it does not repeat on a second load the same day', async () => {
        spec.arrange();
        markShown(spec.messageKey);
        const message = await getMyRootPopupMessageAction();
        expect(message?.kind).not.toBe(spec.kind);
      });

      it('ignored: it never comes back, not even after a fresh login', async () => {
        spec.arrange();
        markIgnored(spec.messageKey);
        world.lastSignInAt = '2026-08-28T08:00:00.000Z';
        const message = await getMyRootPopupMessageAction();
        expect(message?.kind).not.toBe(spec.kind);
      });

      it('snoozed then reloaded the same login: it stays away', async () => {
        spec.arrange();
        markSnoozed(spec.messageKey, '2026-08-27T09:00:00.000Z');
        const message = await getMyRootPopupMessageAction();
        expect(message?.kind).not.toBe(spec.kind);
      });

      it(
        spec.lifetime === 'recurring'
          ? 'snoozed then a real login the next day: it comes back'
          : 'snoozed then a real login the next day: a one-time key stays retired',
        async () => {
          spec.arrange();
          markSnoozed(spec.messageKey, '2026-08-27T09:00:00.000Z');
          world.lastSignInAt = '2026-08-28T08:00:00.000Z';
          const message = await getMyRootPopupMessageAction();
          if (spec.lifetime === 'recurring') {
            expect(message?.kind).toBe(spec.kind);
          } else {
            expect(message?.kind).not.toBe(spec.kind);
          }
        }
      );
    });
  }

  it('the priority card is due again tomorrow, because its key carries her own local date', async () => {
    world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    markShown(PRIORITY_KEY);
    expect(await getMyRootPopupMessageAction()).toBeNull();

    // Next day: new local date, therefore a genuinely new message key.
    world.localDate = '2026-08-28';
    world.lastSignInAt = '2026-08-28T08:00:00.000Z';
    const tomorrow = await getMyRootPopupMessageAction();
    expect(tomorrow?.kind).toBe('priority_card');
    expect(tomorrow?.messageKey).toBe(PRIORITY_KEY_TOMORROW);
  });

  it('a done or saved priority card does not pop at all, and does not block what is below it', async () => {
    world.priority = { rule: 'todays_focus', isReEntry: false, status: 'done' };
    world.weeklyReviewWeekStart = '2026-08-24';
    expect((await getMyRootPopupMessageAction())?.kind).toBe('weekly_review');
  });
});

// ---------------------------------------------------------------------
// Everything dismissed at once: the whole chain drains in order rather
// than stopping at the first dismissed row.
// ---------------------------------------------------------------------

describe('a member with several things pending sees them one at a time, in order, over successive loads', () => {
  it('drains the chain: assignment, then re-entry card, then hydration, then day 3, then review, then free arc', async () => {
    world.assignments = [
      { assignmentId: 'assignment-1', title: 'Health Check-In', primaryHref: '/a' },
    ];
    world.priority = { rule: 're_entry', isReEntry: true, status: 'active' };
    world.hydrationFocus = null;
    world.cvsPending = 'day3';
    world.weeklyReflectionWeekStart = '2026-08-28';
    world.weeklyReviewWeekStart = '2026-08-24';
    world.freeArcKey = 'core-values-snapshot';

    const seen: string[] = [];
    for (let load = 0; load < 8; load += 1) {
      const message = await getMyRootPopupMessageAction();
      if (!message) break;
      seen.push(message.kind);
      markShown(message.messageKey);
    }

    expect(seen).toEqual([
      'questionnaire_assigned',
      'priority_card',
      'hydration_focus',
      'cvs_day3',
      'weekly_reflection',
      'weekly_review',
      'free_arc_available',
    ]);
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });
});

// ---------------------------------------------------------------------
// The rule itself, asserted structurally, so a future branch cannot skip
// the guard the way these two did for fifteen days.
// ---------------------------------------------------------------------

describe('the guard rule holds for every branch in the file, by construction', () => {
  it('every kind returned by findMyPendingRootPopupMessage sits inside a due-check', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.join(__dirname, '..', 'app/actions/rootPopupMessages.ts'),
      'utf8'
    );

    const body = source.slice(
      source.indexOf('async function findMyPendingRootPopupMessage'),
      source.indexOf('/** The dismissal state (if any) for a specific message key')
    );
    expect(body.length).toBeGreaterThan(1000);

    // The rule, stated mechanically: walk the function's returns in order,
    // and for each one require a due-check call somewhere in the stretch of
    // code between the PREVIOUS return and this one. A branch that returns a
    // candidate on the strength of a check made two branches earlier fails
    // this, and that is exactly the B1 shape.
    const GUARDS = [
      'isRecurringMessageDue',
      'isOfferStillDue',
      'isPriorityCardDue',
      'pickFirstDueOneTimeMessage',
    ];

    const returnAts = [...body.matchAll(/return \{/g)].map((m) => m.index ?? 0);
    expect(returnAts.length).toBeGreaterThanOrEqual(14);

    for (let i = 0; i < returnAts.length; i += 1) {
      const at = returnAts[i] ?? 0;
      const from = i === 0 ? 0 : (returnAts[i - 1] ?? 0);
      const segment = body.slice(from, at);
      const kindMatch = /kind: '([a-z0-9_]+)'/.exec(body.slice(at, at + 400));
      const kind = kindMatch?.[1] ?? `return #${i}`;
      const guarded = GUARDS.some((g) => segment.includes(`await ${g}(`));
      expect(
        guarded,
        `${kind} is returned with no due-check between it and the previous return`
      ).toBe(true);
    }
  });

  it('the header table names every kind the function can return', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.join(__dirname, '..', 'app/actions/rootPopupMessages.ts'),
      'utf8'
    );
    const header = source.slice(0, source.indexOf("'use server'"));
    for (const kind of [
      'questionnaire_assigned',
      'priority_card',
      'hydration_focus',
      'cvs_day3',
      'cvs_offer',
      'weekly_reflection',
      'weekly_review',
      'free_arc_available',
      'reset_plan_day3',
    ]) {
      expect(header, `${kind} is missing from the guard table in the file header`).toContain(kind);
    }
  });
});

export type { RootPopupDismissalStatus };
