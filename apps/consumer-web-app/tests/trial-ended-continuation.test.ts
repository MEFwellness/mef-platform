/**
 * DAY 8 AND AFTER: the soft continuation state at /trial-ended.
 *
 * WHAT THIS FILE HOLDS, and every one of them is a rule a later change
 * could break while every other test still passes.
 *
 *   1. Only a PROSPECT is ever routed here. A coaching client and an app
 *      member are refused under every fixture, in the routing rule and on
 *      the page itself.
 *   2. All four states render from stored rows, with no recomputation, and
 *      the renderer's whole runtime import graph reaches no entitlement, no
 *      membership module, no assessment registry and no database client.
 *   3. Nothing any state can render carries pressure vocabulary, an em
 *      dash, or a claim a first week has not earned.
 *   4. The no-arc state is correct for the shape every real account locked
 *      before the arc existed is actually in.
 *   5. Day 8 and after fires no trial arc message of any kind.
 *   6. Both doors come from the shared link config, and the membership door
 *      is absent when it is unset.
 *   7. No render on either route writes a row, and no link on either route
 *      points into locked content.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assembleTrialArcClosePlan, type TrialArcCloseFacts } from '@/lib/trial-arc/closeCompose';
import { decideTrialArcMessage, type TrialArcFacts } from '@/lib/trial-arc/engine';
import { TRIAL_ARC_LAST_DAY } from '@/lib/trial-arc/constants';
import { deriveRelationship, RELATIONSHIP_TYPES } from '@/lib/membership/relationship';
import type { RelationshipFacts, RelationshipType } from '@/lib/membership/relationship';
import { MEMBER_ONLY_PREFIXES, isMemberOnlyPath } from '@/lib/auth/staffRouting';
import { memberAccessRedirectFor, TRIAL_ENDED_PATH } from '@/lib/membership/routing';
import { TRIAL_ENDED_WEEK_PATH } from '@/lib/trial-ended/paths';
import {
  renderTrialEndedContinuation,
  trialEndedContinuationWords,
  trialEndedCountLine,
  TRIAL_ENDED_HEADING,
} from '@/lib/trial-ended/continuationCopy';
import { decideTrialEndedState } from '@/lib/trial-ended/continuationData';
import { TRIAL_ENDED_STATES } from '@/lib/trial-ended/continuationTypes';
import type { TrialEndedContinuationState } from '@/lib/trial-ended/continuationTypes';
import type { ConversionLinks } from '@/lib/config/conversionLinks';
import { FORBIDDEN_BELOW_SUPPORTED } from '@/lib/member-interpretation/language';
import { ALL_PRESSURE_VOCABULARY } from './helpers/pressureVocabulary';
import { runtimeImportClosure as walk, runtimeImportStatements } from './helpers/importGraph';

const EM_DASH = String.fromCharCode(0x2014);

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

const PAGE = 'app/trial-ended/page.tsx';
const WEEK_PAGE = 'app/trial-ended/week/page.tsx';
const VIEW = 'components/trial-ended/TrialEndedContinuationView.tsx';
const COPY = 'lib/trial-ended/continuationCopy.ts';
const TYPES = 'lib/trial-ended/continuationTypes.ts';
const DATA = 'lib/trial-ended/continuationData.ts';
const PATHS = 'lib/trial-ended/paths.ts';
const ROUTING = 'lib/membership/routing.ts';

const LINKS: ConversionLinks = {
  discoveryCallUrl: 'https://calendly.example/discovery',
  membershipPricingUrl: 'https://pages.example/membership',
};
/** The world in which no membership page has been configured yet, which is the world today. */
const LINKS_NO_PRICING: ConversionLinks = {
  discoveryCallUrl: LINKS.discoveryCallUrl,
  membershipPricingUrl: null,
};

// ---------------------------------------------------------------------
// Fixtures: one of every state, and the close plans behind two of them.
// ---------------------------------------------------------------------

function closeFacts(overrides: Partial<TrialArcCloseFacts> = {}): TrialArcCloseFacts {
  return {
    dayNumber: 7,
    checkinDays: 3,
    cvsDone: true,
    lscSignal: 'energy',
    readinessPattern: 'ready_now',
    arrivalPatternKey: null,
    membershipDoorAvailable: true,
    ...overrides,
  };
}

function closePlan(overrides: Partial<TrialArcCloseFacts> = {}) {
  const built = assembleTrialArcClosePlan(closeFacts(overrides));
  expect(built).not.toBeNull();
  return built!;
}

/** One fixture per state, plus the interesting variants inside two of them. */
const EVERY_STATE: Array<[string, TrialEndedContinuationState]> = [
  ['full, ready now, both conversations', { kind: 'full', close: closePlan(), hasRecap: true }],
  [
    'full, thin focus, nothing finished',
    {
      kind: 'full',
      close: closePlan({ cvsDone: false, lscSignal: null, readinessPattern: null, checkinDays: 0 }),
      hasRecap: true,
    },
  ],
  [
    'full, still deciding, with a quiz arrival',
    {
      kind: 'full',
      close: closePlan({ readinessPattern: 'still_deciding', arrivalPatternKey: 'depletion_pattern' }),
      hasRecap: true,
    },
  ],
  ['full with no recap stored', { kind: 'full', close: closePlan(), hasRecap: false }],
  ['close composed and never opened', { kind: 'close_unopened', close: closePlan(), hasRecap: true }],
  ['recap only, no close at all', { kind: 'recap_only' }],
  [
    'no arc, nothing logged',
    { kind: 'no_arc', counts: { checkinDays: 0, conversations: 0, trialLengthDays: 30 } },
  ],
  [
    'no arc, some check-ins',
    { kind: 'no_arc', counts: { checkinDays: 3, conversations: 0, trialLengthDays: 30 } },
  ],
  [
    'no arc, one check-in and two conversations',
    { kind: 'no_arc', counts: { checkinDays: 1, conversations: 2, trialLengthDays: 7 } },
  ],
  [
    'no arc, window unreadable',
    { kind: 'no_arc', counts: { checkinDays: 4, conversations: 0, trialLengthDays: null } },
  ],
];

const words = (state: TrialEndedContinuationState, links: ConversionLinks = LINKS): string =>
  trialEndedContinuationWords(renderTrialEndedContinuation(state, links)).join('\n');

// ---------------------------------------------------------------------
// TASK C1: only a prospect is ever routed here.
// ---------------------------------------------------------------------

function relationshipFacts(overrides: Partial<RelationshipFacts> = {}): RelationshipFacts {
  return {
    memberId: '00000000-0000-0000-0000-000000000001',
    activeCoachAssignment: false,
    everCoachAssigned: false,
    coachAssignmentStatuses: [],
    hasSubscription: true,
    tier: 'trial',
    source: 'system',
    status: 'active',
    fullAccess: false,
    isTest: false,
    accountCreatedAt: '2026-08-01T00:00:00.000Z',
    trialArcSuppressedAt: null,
    readFailed: false,
    ...overrides,
  };
}

/**
 * Every account shape that is NOT a prospect, including the two real
 * manual/program accounts and the coached test member, described by their
 * actual rows rather than by their names.
 */
const NON_PROSPECT_FIXTURES: Array<[string, RelationshipFacts]> = [
  [
    'a coaching client on a program plan (the two manual accounts)',
    relationshipFacts({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
      tier: 'program',
      source: 'manual',
      fullAccess: true,
    }),
  ],
  [
    'a coaching client whose automatic trial window ran out',
    relationshipFacts({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
      tier: 'trial',
      source: 'system',
      fullAccess: false,
    }),
  ],
  [
    'the coached test member',
    relationshipFacts({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
      isTest: true,
    }),
  ],
  ['an app member on monthly', relationshipFacts({ tier: 'monthly', source: 'billing' })],
  ['an app member on annual', relationshipFacts({ tier: 'annual', source: 'billing' })],
  [
    'an app member on a full access grant with no tier of its own',
    relationshipFacts({ tier: 'trial', fullAccess: true }),
  ],
  [
    'an app member whose paid subscription lapsed',
    relationshipFacts({ tier: 'monthly', source: 'billing', status: 'expired' }),
  ],
];

describe('only a prospect is ever routed to the continuation screen', () => {
  it.each(NON_PROSPECT_FIXTURES)(
    '%s is not a prospect, and is never sent here from any member surface',
    (_name, facts) => {
      const relationship = deriveRelationship(facts);
      expect(relationship).not.toBe('PROSPECT');
      for (const prefix of MEMBER_ONLY_PREFIXES) {
        expect(
          memberAccessRedirectFor({
            hasUser: true,
            isStaff: false,
            // Locked by the entitlement decision, which is the ONLY way this
            // rule is ever reached. Even so, they are not sent here.
            allowed: false,
            relationship,
            path: prefix,
          }),
          `${prefix} sent a ${relationship} to the continuation screen`
        ).toBeNull();
      }
    }
  );

  it('a prospect who is locked IS sent here, so the rule still does its job', () => {
    for (const prefix of MEMBER_ONLY_PREFIXES) {
      expect(
        memberAccessRedirectFor({
          hasUser: true,
          isStaff: false,
          allowed: false,
          relationship: 'PROSPECT',
          path: prefix,
        })
      ).toBe(TRIAL_ENDED_PATH);
    }
  });

  it('every relationship type is covered by a fixture, so a new one cannot be untested', () => {
    const covered = new Set<RelationshipType>(
      NON_PROSPECT_FIXTURES.map(([, facts]) => deriveRelationship(facts))
    );
    covered.add('PROSPECT');
    expect([...covered].sort()).toEqual([...RELATIONSHIP_TYPES].sort());
  });

  it('the middleware reads her relationship in the same round trip as her entitlement', () => {
    const source = read('middleware.ts');
    expect(source).toContain('fetchRelationshipFacts(supabase!, user.id)');
    expect(source).toContain('relationship: deriveRelationship(relationshipFacts)');
    // In the SAME Promise.all, so a member's request still waits for one
    // trip to the database on a member-only path.
    const block = source.slice(source.indexOf('if (user && !degraded && isMemberOnlyPath(path))'));
    const promiseAll = block.slice(block.indexOf('await Promise.all(['), block.indexOf(']);'));
    expect(promiseAll).toContain('fetchRelationshipFacts');
    expect(promiseAll).toContain('fetchMemberAccessFacts');
  });

  it('and the page refuses a non-prospect itself, for the request the middleware never saw', () => {
    const source = read(PAGE);
    expect(source).toContain("deriveRelationship(relationshipFacts) !== 'PROSPECT'");
    expect(source).toContain("redirect('/dashboard')");
  });

  it('an allowed account still never sees this screen either', () => {
    expect(read(PAGE)).toContain('if (decision.allowed) redirect');
  });
});

// ---------------------------------------------------------------------
// TASK C2: four states, from stored rows, with no gate anywhere near them.
// ---------------------------------------------------------------------

const FORBIDDEN_ON_THE_READ_PATH = [
  '@supabase/supabase-js',
  'lib/membership/',
  '../membership/',
  'lib/assessment-registry/',
  '../assessment-registry/',
  '../assessment-foundation/',
  '../assessment-runtime',
  'lib/supabase/',
  '../supabase/',
];

describe('the four states render from stored rows and nothing else', () => {
  it('there are exactly four, and every one has a fixture', () => {
    const covered = new Set(EVERY_STATE.map(([, state]) => state.kind));
    expect([...covered].sort()).toEqual([...TRIAL_ENDED_STATES].sort());
  });

  it('the state is decided by which rows exist, never by anything recomputed', () => {
    const plan = closePlan();
    const counts = { checkinDays: 0, conversations: 0, trialLengthDays: 7 };
    expect(
      decideTrialEndedState({ close: { plan, openedAt: '2026-09-04T10:00:00Z' }, hasRecap: true, counts }).kind
    ).toBe('full');
    expect(decideTrialEndedState({ close: { plan, openedAt: null }, hasRecap: true, counts }).kind).toBe(
      'close_unopened'
    );
    expect(decideTrialEndedState({ close: null, hasRecap: true, counts }).kind).toBe('recap_only');
    expect(decideTrialEndedState({ close: null, hasRecap: false, counts }).kind).toBe('no_arc');
  });

  it('a close she never opened still shows her the outcome, because she never loses what she generated', () => {
    const opened = renderTrialEndedContinuation({ kind: 'full', close: closePlan(), hasRecap: true }, LINKS);
    const unopened = renderTrialEndedContinuation(
      { kind: 'close_unopened', close: closePlan(), hasRecap: true },
      LINKS
    );
    expect(unopened.outcome).toEqual(opened.outcome);
    // And says so, rather than pretending she has read it.
    expect(unopened.intro.join(' ')).toContain('you have not seen it yet');
  });

  it('the renderer reaches no gate and no database client, anywhere in its import graph', () => {
    const closure = walk(ROOT, COPY);
    expect(closure.length).toBeGreaterThan(3);
    for (const file of closure) {
      const statements = runtimeImportStatements(read(file));
      for (const forbidden of FORBIDDEN_ON_THE_READ_PATH) {
        const offending = statements.filter((statement) => statement.includes(forbidden));
        expect(offending, `${file} imports ${forbidden}`).toEqual([]);
      }
    }
  });

  it('and reads no environment variable of its own, so the addresses are always handed in', () => {
    for (const file of walk(ROOT, COPY)) {
      expect(read(file).includes('process.env'), `${file} reads process.env`).toBe(false);
    }
  });

  it('the renderer has no clock and no randomness, so a state always reads the same way', () => {
    const source = read(COPY);
    expect(source).not.toContain('new Date(');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('Math.random(');
  });

  it('the outcome card is day 7 own renderer, not a second implementation of it', () => {
    const source = read(COPY);
    expect(source).toContain('renderTrialArcClose(');
    expect(source).toContain('renderCloseDoors(');
    // Not a second set of door labels or focus sentences living here.
    expect(source).not.toContain('Talk with Osei');
    expect(source).not.toContain('Continue with Rooted Reset');
  });

  it('the read path touches the two stored tables and her own subscription window, and no gate', () => {
    const source = read(DATA);
    expect(source).toContain('getTrialArcClose(');
    expect(source).toContain('getTrialArcRecap(');
    for (const call of ['decideMemberAccess(', 'resolveTrialArcEligibility(', 'getMemberAssessmentFacts(']) {
      expect(source.includes(call), call).toBe(false);
    }
  });

  it('the page renders through the read and the renderer, and recomputes no week', () => {
    const source = read(PAGE);
    expect(source).toContain('resolveTrialEndedState(');
    expect(source).toContain('renderTrialEndedContinuation(');
    for (const forbidden of ['composeTrialArcClosePlan', 'composeTrialArcRecapPlan', 'ensureTrialArcClose', 'ensureTrialArcRecap']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('neither route writes a row of any kind', () => {
    for (const file of [PAGE, WEEK_PAGE, VIEW, COPY, TYPES, DATA, PATHS]) {
      for (const write of ['.insert(', '.upsert(', '.update(', '.delete(']) {
        expect(read(file).includes(write), `${write} appears in ${file}`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------
// TASK C3: the pressure guard, on every state.
// ---------------------------------------------------------------------

describe('nothing on this screen pressures anybody', () => {
  it.each(EVERY_STATE)('%s: carries no pressure or loss vocabulary', (_name, state) => {
    for (const links of [LINKS, LINKS_NO_PRICING]) {
      const text = words(state, links).toLowerCase();
      for (const term of ALL_PRESSURE_VOCABULARY) {
        expect(text.includes(term), `"${term}" appears`).toBe(false);
      }
    }
  });

  it.each(EVERY_STATE)('%s: names no number of days as a remaining count', (_name, state) => {
    const text = words(state).toLowerCase();
    expect(text).not.toMatch(/\d+\s+days?\s+(left|to go|remain)/);
    expect(text).not.toMatch(/only\s+\d+\s+day/);
  });

  it.each(EVERY_STATE)('%s: says nothing a first week has not earned', (_name, state) => {
    const text = words(state).toLowerCase();
    for (const term of FORBIDDEN_BELOW_SUPPORTED) {
      expect(new RegExp(`\\b${term}\\b`, 'i').test(text), `"${term}" appears`).toBe(false);
    }
    expect(/\bproblems?\b/.test(text), '"problem" appears').toBe(false);
  });

  it.each(EVERY_STATE)('%s: holds no em dash', (_name, state) => {
    expect(words(state)).not.toContain(EM_DASH);
  });

  it.each(EVERY_STATE)('%s: is headed by the same plain statement', (_name, state) => {
    expect(renderTrialEndedContinuation(state, LINKS).heading).toBe(TRIAL_ENDED_HEADING);
  });

  it('says the free week is complete, which is allowed, and never that anything is ending', () => {
    expect(TRIAL_ENDED_HEADING.toLowerCase()).toContain('complete');
    for (const term of ALL_PRESSURE_VOCABULARY) {
      expect(TRIAL_ENDED_HEADING.toLowerCase().includes(term), term).toBe(false);
    }
  });

  it('every source file in this build holds no em dash, including its own comments', () => {
    for (const file of [PAGE, WEEK_PAGE, VIEW, COPY, TYPES, DATA, PATHS, ROUTING]) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });

  it('and names no URL by hand, anywhere on the screen', () => {
    for (const file of [PAGE, WEEK_PAGE, VIEW, COPY, TYPES]) {
      expect(read(file).includes('https://'), `${file} names a URL`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// TASK C4: the no-arc state, for the accounts that are actually in it.
// ---------------------------------------------------------------------

/**
 * The shapes the real accounts locked before the arc existed are in, taken
 * from their production rows on 2026-09-05: every one of them is a
 * PROSPECT, on the automatic trial, with a 30 day window, no stored recap
 * and no stored close, and between zero and eight check-in days.
 */
const REAL_LOCKED_SHAPES: Array<[string, number, number]> = [
  ['no check-ins at all', 0, 0],
  ['one check-in day', 1, 0],
  ['three check-in days', 3, 0],
  ['eight check-in days', 8, 0],
];

describe('the no-arc state, which is what every account locked before the arc gets', () => {
  it.each(REAL_LOCKED_SHAPES)(
    '%s: renders warm, plain, both doors, and no invented week',
    (_name, checkinDays, conversations) => {
      const rendered = renderTrialEndedContinuation(
        { kind: 'no_arc', counts: { checkinDays, conversations, trialLengthDays: 30 } },
        LINKS
      );
      expect(rendered.kind).toBe('no_arc');
      // No fake week summary: no outcome card, no recap link.
      expect(rendered.outcome).toBeNull();
      expect(rendered.weekLink).toBeNull();
      expect(rendered.arrivalLine).toBeNull();
      // Both doors, and the conversation leads.
      expect(rendered.doors.map((door) => door.door)).toEqual(['conversation', 'membership']);
      expect(rendered.doors[0]!.primary).toBe(true);
      // And the honest reassurance.
      expect(rendered.keepLine.toLowerCase()).toContain('still here');
    }
  );

  it('names a true count only when there is one, and names the window it counted', () => {
    expect(trialEndedCountLine({ checkinDays: 0, conversations: 0, trialLengthDays: 30 })).toBeNull();
    const three = trialEndedCountLine({ checkinDays: 3, conversations: 0, trialLengthDays: 30 })!;
    expect(three).toContain('3 of your 30 free days');
    const both = trialEndedCountLine({ checkinDays: 1, conversations: 2, trialLengthDays: 7 })!;
    expect(both).toContain('1 of your 7 free day');
    expect(both).toContain('2 of the three free conversations');
  });

  it('never renders a zero as if it were an observation', () => {
    for (const trialLengthDays of [7, 30, null]) {
      const line = trialEndedCountLine({ checkinDays: 0, conversations: 0, trialLengthDays });
      expect(line).toBeNull();
    }
    const conversationsOnly = trialEndedCountLine({
      checkinDays: 0,
      conversations: 1,
      trialLengthDays: 30,
    })!;
    expect(conversationsOnly).not.toContain('0 ');
  });

  it('names no number at all when her own window could not be read', () => {
    const line = trialEndedCountLine({ checkinDays: 4, conversations: 0, trialLengthDays: null })!;
    expect(line).toContain('4 days');
    expect(line).not.toMatch(/of your \d+/);
  });

  it('the recap-only state is honest about having no closing note', () => {
    const rendered = renderTrialEndedContinuation({ kind: 'recap_only' }, LINKS);
    expect(rendered.outcome).toBeNull();
    expect(rendered.weekLink?.href).toBe(TRIAL_ENDED_WEEK_PATH);
    expect(rendered.intro.join(' ')).toContain('no closing note');
  });
});

// ---------------------------------------------------------------------
// TASK C5: day 8 and after fires no arc message.
// ---------------------------------------------------------------------

function arcFacts(dayNumber: number): TrialArcFacts {
  return {
    dayNumber,
    todayLocalDate: '2026-09-12',
    startLocalDate: '2026-09-04',
    timeZone: 'America/New_York',
    cvsCompletedLocalDate: null,
    lscCompletedLocalDate: null,
    experimentStartedLocalDate: null,
    experimentActive: false,
    experimentHref: null,
    experimentDeclined: false,
    hasPublicEntryOrigin: false,
    publicEntryPatternTitle: null,
    activeLocalDates: [],
    paceState: 'BEHIND',
    pacingClosed: false,
    stalledMessageSent: false,
    presenceDelivering: false,
    connection: null,
  };
}

describe('the arc is silent from day 8 onward', () => {
  it.each([8, 9, 10, 14, 30, 365])('day %i speaks no message at all', (dayNumber) => {
    const result = decideTrialArcMessage(arcFacts(dayNumber));
    expect(result.speaks).toBe(false);
    if (!result.speaks) expect(result.reason).toBe('outside_pacing_days');
  });

  it('and every pace state on day 8 is still silent, including the ones that outrank pacing', () => {
    // STALLED and the two milestones all sit ABOVE the day switch on
    // purpose, so a member who has been away is never skipped inside her
    // week. Outside the week there is nothing to be skipped from, and the
    // range check at the top of the decision is what says so.
    for (const paceState of ['AHEAD', 'BEHIND', 'ON_PACE', 'STALLED'] as const) {
      const result = decideTrialArcMessage({ ...arcFacts(8), paceState });
      expect(result.speaks, paceState).toBe(false);
      if (!result.speaks) expect(result.reason).toBe('outside_pacing_days');
    }
  });

  it('nor does a member who has been away get a re-entry line after her week', () => {
    for (const dayNumber of [8, 12, 40]) {
      const away = decideTrialArcMessage({
        ...arcFacts(dayNumber),
        paceState: 'STALLED',
        stalledMessageSent: false,
      });
      expect(away.speaks, `day ${dayNumber}`).toBe(false);
    }
  });

  it('the async resolver refuses a day past the week before it reads a single fact', () => {
    const source = read('lib/trial-arc/engine.ts');
    const block = source.slice(source.indexOf('export async function resolveTrialArcDecision'));
    const refusal = block.indexOf('day.dayNumber > TRIAL_ARC_LAST_DAY');
    const gather = block.indexOf('await gatherTrialArcFacts(');
    expect(refusal).toBeGreaterThan(-1);
    expect(gather).toBeGreaterThan(refusal);
  });

  it('the last day of the week is still 7, so day 8 is the first day after it', () => {
    expect(TRIAL_ARC_LAST_DAY).toBe(7);
  });
});

// ---------------------------------------------------------------------
// TASK C6: the doors come from the shared config, and only from it.
// ---------------------------------------------------------------------

describe('the doors', () => {
  it.each(EVERY_STATE)('%s: draws both doors when both addresses exist', (_name, state) => {
    const rendered = renderTrialEndedContinuation(state, LINKS);
    expect(rendered.doors.map((door) => door.href)).toEqual(
      rendered.doors.map((door) =>
        door.door === 'conversation' ? LINKS.discoveryCallUrl : LINKS.membershipPricingUrl
      )
    );
    expect(rendered.doors.filter((door) => door.primary)).toHaveLength(1);
  });

  it.each(EVERY_STATE)(
    '%s: draws no membership door at all when no membership page is configured',
    (_name, state) => {
      const rendered = renderTrialEndedContinuation(state, LINKS_NO_PRICING);
      expect(rendered.doors.map((door) => door.door)).not.toContain('membership');
      // The conversation door always resolves, so there is never a screen
      // with no way forward on it.
      expect(rendered.doors.map((door) => door.door)).toContain('conversation');
      expect(rendered.doors[0]!.primary).toBe(true);
    }
  );

  it('the page resolves both addresses on the server and hands them down', () => {
    const source = read(PAGE);
    expect(source).toContain("from '@/lib/config/conversionLinks'");
    expect(source).toContain('conversionLinks()');
    // And the client component never resolves one itself.
    expect(read(VIEW).includes('conversionLinks')).toBe(false);
  });

  it('a door tap is recorded only where there is a stored close to record it on', () => {
    const view = read(VIEW);
    expect(view).toContain("sendBeacon({ event: 'trial_arc_close_door'");
    expect(view).toContain('if (!recordDoors) return;');
    expect(read(PAGE)).toContain('recordDoors={hasStoredClose}');
    // A beacon, not a Server Action: pressing a door navigates off this app.
    expect(view).not.toContain('Action(');
  });
});

// ---------------------------------------------------------------------
// The routes, and the loops they must not create.
// ---------------------------------------------------------------------

describe('the two routes stay coherent', () => {
  it('the week route lives inside the subtree the lock already lets through', () => {
    expect(TRIAL_ENDED_WEEK_PATH.startsWith(`${TRIAL_ENDED_PATH}/`)).toBe(true);
    expect(
      memberAccessRedirectFor({
        hasUser: true,
        isStaff: false,
        allowed: false,
        relationship: 'PROSPECT',
        path: TRIAL_ENDED_WEEK_PATH,
      })
    ).toBeNull();
  });

  it('and is not a member-only path, so no rule fights another over it', () => {
    expect(isMemberOnlyPath(TRIAL_ENDED_WEEK_PATH)).toBe(false);
    expect(isMemberOnlyPath(TRIAL_ENDED_PATH)).toBe(false);
    // The arc's own screens are still member surfaces and still locked.
    expect(isMemberOnlyPath('/trial/week')).toBe(true);
    expect(isMemberOnlyPath('/trial/close')).toBe(true);
  });

  it('no link on either screen points into locked content', () => {
    // Every internal href the two routes and the view can render.
    const hrefs = [
      ...[PAGE, WEEK_PAGE, VIEW].flatMap((file) =>
        [...read(file).matchAll(/href=\{?'(\/[^']*)'/g)].map((match) => match[1]!)
      ),
    ];
    for (const href of hrefs) {
      expect(isMemberOnlyPath(href), `${href} is behind the lock`).toBe(false);
    }
  });

  it('the week route renders the stored recap through the after-the-week surface', () => {
    const source = read(WEEK_PAGE);
    expect(source).toContain('getTrialArcRecap(');
    expect(source).toContain("renderTrialArcRecap(record.plan, { surface: 'after_the_week' })");
    // Its way back goes to the continuation screen, never to a Home she
    // cannot open.
    expect(source).toContain('TRIAL_ENDED_PATH');
  });

  it('the after-the-week surface promises no tomorrow and draws no locked button', () => {
    // Asserted through the real renderer in tests/trial-arc-recap.test.ts;
    // here only that this route asks for it.
    expect(read(WEEK_PAGE)).toContain("surface: 'after_the_week'");
  });

  it('staff are sent to their own dashboard from both routes', () => {
    for (const file of [PAGE, WEEK_PAGE]) {
      expect(read(file), file).toContain('staffHomePath({ isCoach, isAdmin })');
      expect(read(file), file).toContain('if (staffHome) redirect(staffHome)');
    }
  });
});
