/**
 * ONE KNOCK PER SITTING.
 *
 * The behaviour: on 2026-09-05, finishing Core Values Snapshot and walking
 * back to Home popped the Life Signal Check offer in the same sitting. The
 * closing screen had just invited her on to the Readiness path, and then
 * Root knocked again on the way past. Two invitations to begin something,
 * about a minute apart.
 *
 * This drives the REAL chain, getMyRootPopupMessageAction, with the real
 * hush (lib/root-popup-messages/oneKnock.ts) reading real completion rows
 * through a fake database. Only the local day and the timezone are knobs,
 * so "she finished it today" is decided here by the same instant-to-local-
 * date conversion the app uses, not by a boolean somebody set.
 *
 * The three things it has to get right:
 *   the offer cannot fire on a day she finished an experience,
 *   it CAN fire the next local day, with nothing dismissed in between,
 *   and no protected kind is delayed by it, ever.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RootPopupDismissal } from '../lib/root-popup-messages/data';
import {
  EXPERIENCE_OFFER_POPUP_KINDS,
  PROTECTED_POPUP_KINDS,
  isExperienceOfferPopupKind,
} from '../lib/root-popup-messages/oneKnock';

type World = {
  localDate: string;
  timezone: string;
  lastSignInAt: string;
  /** Instants at which she completed a free arc experience, newest first. */
  completions: string[];
  assignments: Array<{ assignmentId: string; title: string; primaryHref: string }>;
  hydrationFocus: string | null;
  cvsPending: 'day3' | 'day7' | null;
  cvsOfferSessionId: string | null;
  lscOfferSessionId: string | null;
  rplOfferSessionId: string | null;
  weeklyReviewWeekStart: string | null;
  weeklyReflectionWeekStart: string | null;
  stressLoadAssignmentId: string | null;
  priority: { rule: string; isReEntry: boolean; status: string } | null;
  freeArcKey: string | null;
  publicEntryWelcomeSessionId: string | null;
  trialArcDay: number | null;
  dismissals: Map<string, RootPopupDismissal>;
};

const world: World = {} as World;

function resetWorld(): void {
  world.localDate = '2026-09-05';
  world.timezone = 'America/New_York';
  world.lastSignInAt = '2026-09-05T12:00:00.000Z';
  world.completions = [];
  world.assignments = [];
  world.hydrationFocus = 'tracked';
  world.cvsPending = null;
  world.cvsOfferSessionId = null;
  world.lscOfferSessionId = null;
  world.rplOfferSessionId = null;
  world.weeklyReviewWeekStart = null;
  world.weeklyReflectionWeekStart = null;
  world.stressLoadAssignmentId = null;
  world.priority = null;
  world.freeArcKey = null;
  world.publicEntryWelcomeSessionId = null;
  world.trialArcDay = null;
  world.dismissals = new Map();
}
resetWorld();

/** What the pop-up client writes the instant a one-time message is shown. */
function markShown(messageKey: string): void {
  world.dismissals.set(messageKey, { status: 'ignored', snoozedAt: null });
}

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => ({ id: 'member-1', last_sign_in_at: world.lastSignInAt }),
}));

/**
 * The one table the hush actually reads. Every other read the chain makes
 * is mocked at the module above it, so this client only has to answer
 * "which free arc experiences has she finished recently" and the profile
 * row the chain's own local-date helper asks for.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'unified_assessment_sessions') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          gte: () => builder,
          order: () => builder,
          limit: async () => ({
            data: world.completions.map((completed_at) => ({ completed_at })),
            error: null,
          }),
        };
        return builder;
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { timezone: world.timezone } }) }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/assessment-foundation/repository', () => ({
  getUnifiedAssessmentDefinitionByKey: async (_c: unknown, key: string) => ({ id: `def-${key}` }),
}));

/**
 * Her own day, and her own zone. Deliberately the only two knobs: the
 * conversion from a completion instant to the local date it happened on is
 * the REAL lib/time/localDate.ts, which is the part worth testing.
 */
vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => world.timezone,
  memberTodayLocalDate: async () => world.localDate,
  FALLBACK_TIMEZONE: 'America/New_York',
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
            title: 'Life Signal Check',
            description: 'A short conversation.',
            primaryHref: '/assessments/life-signal-check',
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

vi.mock('@/lib/public-entry/welcome', () => ({
  getPublicEntryWelcome: async () =>
    world.publicEntryWelcomeSessionId
      ? {
          sessionId: world.publicEntryWelcomeSessionId,
          patternTitle: 'The day never closes',
          hasBaseline: false,
          arc: null,
        }
      : null,
}));

vi.mock('@/lib/trial-arc/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/trial-arc/engine')>();
  return {
    ...actual,
    resolveTrialArcDecision: async () => {
      if (world.trialArcDay === null) {
        return { eligible: false, dayNumber: null, message: null, reason: 'not_eligible', facts: null };
      }
      return {
        eligible: true,
        dayNumber: world.trialArcDay,
        message: {
          messageKey: `trial_arc_day:${world.trialArcDay}`,
          dayNumber: world.trialArcDay,
          paceState: 'ON_PACE',
          surface: 'popup',
          copy: {
            eyebrow: 'From Root',
            title: 'The other half',
            body: 'Life Signal Check is the other half of the picture.',
            ctaLabel: 'Start Life Signal Check',
            href: '/assessments/life-signal-check',
            step: 'life_signal_check',
          },
        },
        reason: null,
        facts: null,
      };
    },
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
  getMyLscOfferAction: async () =>
    world.lscOfferSessionId
      ? { sessionId: world.lscOfferSessionId, scoring: { placeholder: true } }
      : null,
}));
vi.mock('@/app/actions/readinessPulse', () => ({
  getMyRplExperimentStatusAction: async () => null,
  getMyRplOfferAction: async () =>
    world.rplOfferSessionId
      ? { sessionId: world.rplOfferSessionId, scoring: { placeholder: true } }
      : null,
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

vi.mock('@/lib/weekly-reflection/view', () => ({
  getMyWeeklyReflection: async () =>
    world.weeklyReflectionWeekStart
      ? { status: 'pending', weekStart: world.weeklyReflectionWeekStart }
      : null,
}));

vi.mock('@/lib/stress-load/view', () => ({
  getMyStressLoadDeepDive: async () =>
    world.stressLoadAssignmentId
      ? {
          status: 'pending',
          assignmentId: world.stressLoadAssignmentId,
          assignedAt: '2026-09-05T10:00:00.000Z',
          questionsVersion: 1,
        }
      : null,
}));

vi.mock('@/lib/memory-callback/data', () => ({ fetchGoalCallbackContext: async () => null }));
vi.mock('@/lib/memory-callback/copy', () => ({ buildGoalCallback: () => null }));

const { getMyRootPopupMessageAction } = await import('../app/actions/rootPopupMessages');

beforeEach(() => {
  resetWorld();
});

/** She finished Core Values Snapshot at half past seven this evening, her time. */
const FINISHED_THIS_EVENING = '2026-09-05T23:30:00.000Z';

// ---------------------------------------------------------------------
// The behaviour that was reported
// ---------------------------------------------------------------------

describe('completing an experience and walking back to Home', () => {
  it('does not pop the next experience offer in the same sitting', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.lscOfferSessionId = 'lsc-session-1';

    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('does not pop the free arc invitation in the same sitting either', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.freeArcKey = 'life-signal-check';

    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('hushes the offer for the experience she just finished, not only the next one', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.cvsOfferSessionId = 'cvs-session-1';

    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('hushes the Readiness Pulse offer on the same rule', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.rplOfferSessionId = 'rpl-session-1';

    expect(await getMyRootPopupMessageAction()).toBeNull();
  });
});

describe('and tomorrow it knocks', () => {
  it('pops the offer on her next local day, having dismissed nothing', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.lscOfferSessionId = 'lsc-session-1';
    expect(await getMyRootPopupMessageAction()).toBeNull();
    // Nothing was written while it was hushed, which is what makes
    // tomorrow a genuine first showing rather than a repeat.
    expect(world.dismissals.size).toBe(0);

    world.localDate = '2026-09-06';
    world.lastSignInAt = '2026-09-06T12:00:00.000Z';
    const tomorrow = await getMyRootPopupMessageAction();
    expect(tomorrow?.kind).toBe('lsc_offer');
    expect(tomorrow?.messageKey).toBe('lsc_offer:lsc-session-1');
  });

  it('pops the free arc invitation on her next local day too', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.freeArcKey = 'life-signal-check';
    expect(await getMyRootPopupMessageAction()).toBeNull();

    world.localDate = '2026-09-06';
    world.lastSignInAt = '2026-09-06T12:00:00.000Z';
    expect((await getMyRootPopupMessageAction())?.kind).toBe('free_arc_available');
  });

  it('is still hushed on a later visit the SAME day, not just the first one', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.lscOfferSessionId = 'lsc-session-1';
    expect(await getMyRootPopupMessageAction()).toBeNull();
    world.lastSignInAt = '2026-09-05T21:00:00.000Z';
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('and once it has been shown, the ordinary once-ever rule takes over again', async () => {
    world.localDate = '2026-09-06';
    world.lscOfferSessionId = 'lsc-session-1';
    expect((await getMyRootPopupMessageAction())?.kind).toBe('lsc_offer');
    markShown('lsc_offer:lsc-session-1');
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });
});

describe('it is her local day that decides, not the server’s', () => {
  it('an evening completion in New York is still today at 23:30 UTC', async () => {
    // 23:30 UTC is 19:30 in New York on the same date.
    world.timezone = 'America/New_York';
    world.localDate = '2026-09-05';
    world.completions = ['2026-09-05T23:30:00.000Z'];
    world.lscOfferSessionId = 'lsc-session-1';
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('the same instant is yesterday once her day has rolled over', async () => {
    world.timezone = 'America/New_York';
    world.localDate = '2026-09-06';
    world.completions = ['2026-09-05T23:30:00.000Z'];
    world.lscOfferSessionId = 'lsc-session-1';
    expect((await getMyRootPopupMessageAction())?.kind).toBe('lsc_offer');
  });

  it('an early morning completion in Sydney is her today even though UTC calls it yesterday', async () => {
    // 22:00 UTC on the 5th is 08:00 on the 6th in Sydney.
    world.timezone = 'Australia/Sydney';
    world.localDate = '2026-09-06';
    world.completions = ['2026-09-05T22:00:00.000Z'];
    world.lscOfferSessionId = 'lsc-session-1';
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('a member who finished nothing recently is never hushed', async () => {
    world.completions = [];
    world.lscOfferSessionId = 'lsc-session-1';
    expect((await getMyRootPopupMessageAction())?.kind).toBe('lsc_offer');
  });
});

// ---------------------------------------------------------------------
// What is never delayed
// ---------------------------------------------------------------------

describe('no protected message is ever delayed by this rule', () => {
  /** Each protected kind, in the exact state that makes it the winner. */
  const CASES: Array<{ kind: string; arrange: () => void }> = [
    { kind: 'public_entry_welcome', arrange: () => { world.publicEntryWelcomeSessionId = 'pe-1'; } },
    { kind: 'trial_arc_day', arrange: () => { world.trialArcDay = 2; } },
    {
      kind: 'questionnaire_assigned',
      arrange: () => {
        world.assignments = [{ assignmentId: 'a-1', title: 'Short-HAQ', primaryHref: '/q/a-1' }];
      },
    },
    { kind: 'stress_load_assigned', arrange: () => { world.stressLoadAssignmentId = 'sl-1'; } },
    {
      kind: 'priority_card',
      arrange: () => {
        world.priority = { rule: 'safety', isReEntry: true, status: 'active' };
      },
    },
    { kind: 'hydration_focus', arrange: () => { world.hydrationFocus = null; } },
    { kind: 'cvs_day3', arrange: () => { world.cvsPending = 'day3'; } },
    { kind: 'cvs_day7', arrange: () => { world.cvsPending = 'day7'; } },
    { kind: 'weekly_reflection', arrange: () => { world.weeklyReflectionWeekStart = '2026-09-04'; } },
    { kind: 'weekly_review', arrange: () => { world.weeklyReviewWeekStart = '2026-08-31'; } },
  ];

  for (const { kind, arrange } of CASES) {
    it(`${kind} still fires on a day she finished an experience`, async () => {
      world.completions = [FINISHED_THIS_EVENING];
      arrange();
      expect((await getMyRootPopupMessageAction())?.kind).toBe(kind);
    });
  }

  it('the trial arc is not starved even when an offer sits below it on the same day', async () => {
    // Day 2 of the arc points at Life Signal Check, and she finished Core
    // Values Snapshot an hour ago. The arc still speaks; the offer waits.
    world.completions = [FINISHED_THIS_EVENING];
    world.trialArcDay = 2;
    world.lscOfferSessionId = 'lsc-session-1';

    const first = await getMyRootPopupMessageAction();
    expect(first?.kind).toBe('trial_arc_day');
    markShown('trial_arc_day:2');

    // And the day is not double booked: the offer below it is still hushed.
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('a coach assignment still wins, and the offer below it is still hushed', async () => {
    world.completions = [FINISHED_THIS_EVENING];
    world.assignments = [{ assignmentId: 'a-1', title: 'Short-HAQ', primaryHref: '/q/a-1' }];
    world.lscOfferSessionId = 'lsc-session-1';

    expect((await getMyRootPopupMessageAction())?.kind).toBe('questionnaire_assigned');
    markShown('questionnaire_assigned:a-1');
    expect(await getMyRootPopupMessageAction()).toBeNull();
  });

  it('a hushed offer does not starve a protected message below it', async () => {
    // The offer sits above the free arc invitation and above nothing else
    // that could be reached here, so the honest version of this is: the
    // hush falls THROUGH, it does not return null early.
    world.completions = [FINISHED_THIS_EVENING];
    world.cvsOfferSessionId = 'cvs-session-1';
    world.priority = { rule: 'todays_focus', isReEntry: false, status: 'active' };

    expect((await getMyRootPopupMessageAction())?.kind).toBe('priority_card');
  });
});

// ---------------------------------------------------------------------
// The two lists, as data
// ---------------------------------------------------------------------

describe('the scope of the rule, stated once', () => {
  it('delays exactly the four experience offers', () => {
    expect([...EXPERIENCE_OFFER_POPUP_KINDS].sort()).toEqual([
      'cvs_offer',
      'free_arc_available',
      'lsc_offer',
      'rpl_offer',
    ]);
    for (const kind of EXPERIENCE_OFFER_POPUP_KINDS) {
      expect(isExperienceOfferPopupKind(kind)).toBe(true);
    }
  });

  it('and the two lists never overlap', () => {
    for (const kind of PROTECTED_POPUP_KINDS) {
      expect(isExperienceOfferPopupKind(kind), `${kind} is in both lists`).toBe(false);
    }
  });

  it('names every kind the chain can return, between them', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.join(__dirname, '..', 'app/actions/rootPopupMessages.ts'),
      'utf8'
    );
    const body = source.slice(source.indexOf('async function findMyPendingRootPopupMessage'));
    const kinds = new Set([...body.matchAll(/kind: '([a-z0-9_]+)'/g)].map((m) => m[1]!));
    expect(kinds.size).toBeGreaterThanOrEqual(14);
    const known = new Set([...EXPERIENCE_OFFER_POPUP_KINDS, ...PROTECTED_POPUP_KINDS]);
    const unclassified = [...kinds].filter((k) => !known.has(k));
    expect(
      unclassified,
      'a new pop-up kind must be listed in lib/root-popup-messages/oneKnock.ts as either an experience offer or protected'
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The door that stays open: the closing screen's own invitation
// ---------------------------------------------------------------------

describe("the closing screen's own invitation is untouched and immediate", () => {
  const SCREENS: Array<{ file: string; handler: string }> = [
    { file: 'components/core-values-snapshot/CvsCloseScreen.tsx', handler: 'onStartLifeSignalCheck' },
    { file: 'components/life-signal-check/LscCloseScreen.tsx', handler: 'onStartReadinessPulse' },
  ];

  for (const { file, handler } of SCREENS) {
    it(`${file} still offers the next experience on the spot`, async () => {
      const { readFileSync } = await import('node:fs');
      const path = await import('node:path');
      const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
      // A real, enabled button wired straight to the handler. This is the
      // path a motivated member takes by choice, and the hush must never
      // reach it: it knows nothing about pop-ups, dismissals or her day.
      expect(source).toContain(`onClick={${handler}}`);
      // Real and enabled: no disabled attribute on the button that carries
      // the handler. ("honestly-disabled" appears in both files' header
      // comments, describing what these buttons are NOT, so this looks at
      // the tag rather than at the file.)
      const handlerAt = source.indexOf(`onClick={${handler}}`);
      const tag = source.slice(source.lastIndexOf('<button', handlerAt), source.indexOf('>', handlerAt));
      expect(tag).not.toContain('disabled');
      expect(source).not.toContain('rootPopupMessages');
      expect(source).not.toContain('oneKnock');
      expect(source).not.toContain('completedAnExperienceToday');
    });
  }

  it('the hush lives in the pop-up chain and nowhere else', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..');
    const callers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && readFileSync(full, 'utf8').includes('completedAnExperienceToday')) {
          callers.push(full.slice(root.length + 1));
        }
      }
    };
    walk(join(root, 'app'));
    walk(join(root, 'components'));
    expect(callers).toEqual(['app/actions/rootPopupMessages.ts']);
  });
});
