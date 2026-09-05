/**
 * DAY 6, the rules this build has to keep, asserted against its own source.
 *
 * The companion file tests/trial-arc-recap.test.ts is about what the recap
 * SAYS. This one is about the shape of the thing: where the write happens,
 * what the read path is allowed to touch, that the offer survives the
 * closer, and that the stored vocabulary cannot grow a field a sentence
 * could arrive in. Every one of these is a rule a later change could break
 * while every content test still passes.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decideTrialArcMessage, type TrialArcFacts } from '@/lib/trial-arc/engine';
import { isPacingDay, TRIAL_ARC_FIRST_RECAP_DAY, trialArcDayKind } from '@/lib/trial-arc/constants';
import { TRIAL_ARC_DAY_6 } from '@/lib/trial-arc/copy';
import { TRIAL_ARC_RECAP_CARD_KINDS } from '@/lib/trial-arc/recapTypes';
import { isMemberOnlyPath, isStaffOnlyPath } from '@/lib/auth/staffRouting';
import { runtimeImportClosure as walk, runtimeImportStatements } from './helpers/importGraph';

/**
 * The character this house style forbids, written as a code point rather
 * than as itself, so this file can assert the rule without breaking it.
 */
const EM_DASH = String.fromCharCode(0x2014);

const ROOT = path.join(__dirname, '..');
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

const COPY = 'lib/trial-arc/recapCopy.ts';
const TYPES = 'lib/trial-arc/recapTypes.ts';
const PLAN = 'lib/trial-arc/recapPlan.ts';
const COMPOSE = 'lib/trial-arc/recapCompose.ts';
const DATA = 'lib/trial-arc/recapData.ts';
const PAGE = 'app/trial/week/page.tsx';
const VIEW = 'components/trial-arc/TrialArcRecapView.tsx';
const OPENER = 'components/trial-arc/OpenTrialArcRecap.tsx';
const ACTIONS = 'app/actions/trialArcDelivery.ts';
const MIGRATION = '../../supabase/migrations/00000000000205_trial_arc_recap.sql';

// ---------------------------------------------------------------------
// TASK C6, the stored plan renders without passing through a gate.
// ---------------------------------------------------------------------

/**
 * Everything the module graph below is not allowed to reach.
 *
 * The first three are the gates the next prompt's continuation screen would
 * fail: her entitlement, her plan, and the assessment registry's own
 * "may she open this" facts. The fourth is any database client at all,
 * because a read path that can query is a read path that can be slow, can
 * fail, and can be gated by RLS on a screen whose whole point is that it
 * renders from one already-stored row.
 */
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

describe('the read path depends only on the stored plan', () => {
  it('the renderer reaches no gate and no database client, anywhere in its import graph', () => {
    const closure = walk(ROOT, COPY);
    // A sanity check on the walker itself: if it resolved nothing, the
    // assertions below would pass vacuously.
    expect(closure.length).toBeGreaterThan(5);

    for (const file of closure) {
      const statements = runtimeImportStatements(read(file));
      for (const forbidden of FORBIDDEN_ON_THE_READ_PATH) {
        const offending = statements.filter((statement) => statement.includes(forbidden));
        expect(offending, `${file} imports ${forbidden}`).toEqual([]);
      }
    }
  });

  it('the renderer takes a plan and which screen is asking, and returns words', () => {
    const source = read(COPY);
    expect(source).toContain('export function renderTrialArcRecap(');
    expect(source).toContain('plan: TrialArcRecapPlan');
    // The second argument names a SURFACE from a closed set and carries no
    // data of its own (2026-09-05, Prompt 6). It is not a way to pass words
    // in: every string this file can render is still declared in it.
    expect(source).toContain("options: { surface?: TrialArcRecapSurface } = {}");
    expect(source).toContain("export type TrialArcRecapSurface = 'day_six' | 'after_the_week';");
    // No clock, no randomness: the same plan reads the same way on day 6 and
    // on the continuation screen two days later.
    expect(source).not.toContain('new Date(');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('Math.random(');
  });

  it('the after-the-week surface promises no tomorrow and draws no locked button', () => {
    // Day 6 promises day 7 and offers tier A a way into an unfinished
    // conversation. On day 8 the first is not true and the second is behind
    // the lock, so both are answered by the renderer rather than by a
    // component remembering to hide them.
    const source = read(COPY);
    expect(source).toContain('tomorrow: afterTheWeek ? TRIAL_ARC_RECAP_KEPT : TRIAL_ARC_RECAP_TOMORROW');
    expect(source).toContain('cta: afterTheWeek || !plan.nextStep ? null : NEXT_STEP[plan.nextStep]');
  });

  it('the storage module reads one row and asks nothing else about her', () => {
    const source = read(DATA);
    expect(source).toContain("from('member_trial_arc_recaps')");

    // Imports, not prose: the header comment legitimately talks about the
    // gates this path does not go through, and a substring match on the
    // whole file would fail on its own explanation.
    const imports = source.split('\n').filter((line) => /^import\s/.test(line.trim()));
    for (const forbidden of ['membership', 'assessment-registry', 'assessment-foundation', 'assessment-runtime']) {
      expect(imports.filter((line) => line.includes(forbidden)), forbidden).toEqual([]);
    }
    // And it calls none of the gate functions either.
    for (const call of ['decideMemberAccess(', 'fetchMemberAccessFacts(', 'getMemberAssessmentFacts(', 'resolveTrialArcEligibility(']) {
      expect(source.includes(call), call).toBe(false);
    }

    // One table, and only one.
    const tables = [...source.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['member_trial_arc_recaps']);
  });

  it('the page renders through exactly those two calls and gates nothing', () => {
    const source = read(PAGE);
    expect(source).toContain('getTrialArcRecap(');
    expect(source).toContain('renderTrialArcRecap(');
    for (const forbidden of ['resolveTrialArcEligibility', 'fetchMemberAccessFacts', 'decideMemberAccess', 'getMemberAssessmentFacts']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------
// TASK C5, the plan is written exactly once, and never on a render.
// ---------------------------------------------------------------------

describe('no render composes a recap', () => {
  const WRITERS = ['ensureTrialArcRecap', 'markTrialArcRecapOpened', 'composeTrialArcRecapPlan'];

  it('the writers are named only in the storage module, the composer and the beacon actions', () => {
    const allowed = new Set([DATA, COMPOSE, ACTIONS]);
    for (const file of [PAGE, VIEW, OPENER, COPY, TYPES, PLAN, 'lib/trial-arc/engine.ts', 'app/actions/rootPopupMessages.ts']) {
      const source = read(file);
      for (const writer of WRITERS) {
        if (allowed.has(file)) continue;
        expect(source.includes(`${writer}(`), `${writer} appears in ${file}`).toBe(false);
      }
    }
  });

  it('the page, the view and the composer itself write no row of their own', () => {
    for (const file of [PAGE, VIEW, OPENER, COPY, TYPES, PLAN, COMPOSE]) {
      const source = read(file);
      for (const write of ['.insert(', '.upsert(', '.update(', '.delete(']) {
        expect(source.includes(write), `${write} appears in ${file}`).toBe(false);
      }
    }
  });

  it('ensure READS before it composes, so an existing recap never recomputes', () => {
    const source = read(DATA);
    const body = source.slice(source.indexOf('export async function ensureTrialArcRecap'));
    const readFirst = body.indexOf('const existing = await getTrialArcRecap(');
    const composeCall = body.indexOf('await input.compose()');
    expect(readFirst).toBeGreaterThan(-1);
    expect(composeCall).toBeGreaterThan(readFirst);
    expect(body.indexOf('if (existing) return')).toBeLessThan(composeCall);
  });

  it('it is insert if absent, never an upsert, and the database enforces one row per member', () => {
    expect(read(DATA)).toContain('.insert(');
    expect(read(DATA)).not.toContain('.upsert(');
    expect(read(MIGRATION)).toContain('unique (member_id)');
  });

  it('only the open stamp may ever change on a written recap', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('revoke update on member_trial_arc_recaps from authenticated');
    expect(sql).toContain('grant update (opened_at) on member_trial_arc_recaps to authenticated');
  });

  it('it is written only by the member herself, from her own session', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('for insert with check (member_id = auth.uid())');
    expect(sql).not.toContain('service_role');
  });

  it('the open stamp is fired from a mounted effect through the beacon, not from a render', () => {
    const source = read(OPENER);
    expect(source).toContain('useEffect');
    expect(source).toContain('sendBeacon');
    expect(source).not.toContain('Action(');
    // And the page mounts it rather than doing the work itself.
    expect(read(PAGE)).toContain('<OpenTrialArcRecap');
  });

  it('the opener can refresh at most once, so a member the server refuses is never in a loop', () => {
    const source = read(OPENER);
    expect(source).toContain('router.refresh()');
    expect(source).toContain('alreadyAttempted()');
    expect(source).toContain('rememberAttempt()');
  });
});

// ---------------------------------------------------------------------
// TASK C7, day 6 is offered exactly once, and the closer cannot stop it.
// ---------------------------------------------------------------------

function facts(overrides: Partial<TrialArcFacts> = {}): TrialArcFacts {
  return {
    dayNumber: 6,
    todayLocalDate: '2026-09-09',
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
    ...overrides,
  };
}

describe('the day 6 offer', () => {
  it('is a milestone, not a pacing day', () => {
    expect(isPacingDay(TRIAL_ARC_FIRST_RECAP_DAY)).toBe(false);
    expect(trialArcDayKind(TRIAL_ARC_FIRST_RECAP_DAY)).toBe('milestone');
  });

  it('speaks, and opens the recap screen', () => {
    const result = decideTrialArcMessage(facts());
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_DAY_6);
    expect(result.message.copy.href).toBe('/trial/week');
    expect(result.message.messageKey).toBe('trial_arc_day:6');
  });

  it('still speaks after the closer has tripped, which is the whole point of the split', () => {
    // Three ignored pacing messages stop days 1 to 5 for good.
    expect(decideTrialArcMessage(facts({ dayNumber: 4, pacingClosed: true })).speaks).toBe(false);
    // And leave day 6 standing.
    const day6 = decideTrialArcMessage(facts({ pacingClosed: true }));
    expect(day6.speaks).toBe(true);
    if (day6.speaks) expect(day6.message.copy).toEqual(TRIAL_ARC_DAY_6);
  });

  it('still speaks to a member who has been away, instead of the re-entry line', () => {
    const result = decideTrialArcMessage(
      facts({ paceState: 'STALLED', stalledMessageSent: false })
    );
    expect(result.speaks).toBe(true);
    if (result.speaks) expect(result.message.copy).toEqual(TRIAL_ARC_DAY_6);
  });

  it('and to a member who ran ahead of the whole week, who has the most to read back', () => {
    const result = decideTrialArcMessage(facts({ paceState: 'AHEAD' }));
    expect(result.speaks).toBe(true);
    if (result.speaks) expect(result.message.copy).toEqual(TRIAL_ARC_DAY_6);
  });

  it('and to a member who declined an experiment, since the recap asks for nothing', () => {
    const result = decideTrialArcMessage(facts({ experimentDeclined: true }));
    expect(result.speaks).toBe(true);
  });

  it('yields to Root Presence, which is the one thing that outranks it', () => {
    expect(decideTrialArcMessage(facts({ presenceDelivering: true })).speaks).toBe(false);
  });

  it('rides the same once-per-day key machinery every other arc day uses', () => {
    // The pop-up chain's outer check treats a trial arc key as one-time-ever
    // on a day-scoped key, which IS the once-per-day rule. Day 6's key is a
    // trial arc key, so it inherits it with no new branch.
    const chain = read('app/actions/rootPopupMessages.ts');
    const outer = chain.slice(chain.indexOf('export async function getMyRootPopupMessageAction'));
    expect(outer).toContain("message.kind === 'trial_arc_day'");
    expect(outer).toContain('isOfferPopupDue(dismissal)');
  });

  it('asks for nothing to be completed, so the closer could never count it against her', () => {
    expect(TRIAL_ARC_DAY_6.step).toBe('none');
  });

  it('day 7 is its own milestone now, and did not replace this one', () => {
    // Prompt 5 built the close. Day 6 still speaks, on its own key, into its
    // own screen, and the engine still refuses by day number rather than by
    // falling off the end of a map.
    const engine = read('lib/trial-arc/engine.ts');
    expect(engine).toContain('TRIAL_ARC_LAST_BUILT_DAY');
    expect(engine).toContain('dayNumber === 7');
    const day7 = decideTrialArcMessage(facts({ dayNumber: 7 }));
    expect(day7.speaks).toBe(true);
    if (day7.speaks) expect(day7.message.copy.href).toBe('/trial/close');
  });
});

// ---------------------------------------------------------------------
// The route.
// ---------------------------------------------------------------------

describe('the recap route', () => {
  it('is a member surface, so staff are sent to their own dashboard', () => {
    expect(isMemberOnlyPath('/trial/week')).toBe(true);
    expect(isStaffOnlyPath('/trial/week')).toBe(false);
  });

  it('does not swallow the post-trial lock screen, which is a different screen', () => {
    expect(isMemberOnlyPath('/trial-ended')).toBe(false);
  });

  it('the pop-up button and the route map name the same path', () => {
    expect(TRIAL_ARC_DAY_6.href).toBe('/trial/week');
    expect(read('lib/trial-arc/constants.ts')).toContain("weekRecap: '/trial/week'");
  });
});

// ---------------------------------------------------------------------
// TASK C1, the vocabulary, and the words this screen may not use.
// ---------------------------------------------------------------------

describe('the copy and the vocabulary', () => {
  it('every file in this build holds no em dash, including its own comments', () => {
    for (const file of [COPY, TYPES, PLAN, COMPOSE, DATA, PAGE, VIEW, OPENER, MIGRATION]) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });

  it('the renderer names no route by hand', () => {
    const source = read(COPY);
    expect(source).toContain('TRIAL_ARC_ROUTES');
    expect(source).not.toMatch(/href: '\//);
  });

  it('there is no free-string field anywhere in the stored vocabulary', () => {
    // Every card variant's non-slug fields are numbers under allowlisted
    // keys. A field typed as a bare `string` on a stored card would be the
    // shape a sentence could arrive in, so the type declarations are read
    // rather than trusted.
    const types = read(TYPES);
    const cardBlock = types.slice(
      types.indexOf('export type TrialArcRecapCard ='),
      types.indexOf('export type TrialArcRecapCounts')
    );
    // signalKey is the one bare string, and ./recapPlan.ts holds it to an
    // identifier shape (no whitespace, 64 characters) precisely because of
    // that.
    const bareStrings = [...cardBlock.matchAll(/^\s*(\w+): string;/gm)].map((m) => m[1]);
    expect(bareStrings).toEqual(['signalKey']);
    expect(read(PLAN)).toContain('/\\s/.test(raw.signalKey)');
  });

  it('every declared card kind is covered by the content tests', () => {
    // The content suite renders every shape this build can produce and
    // checks each one for forbidden vocabulary. A new card kind with no
    // fixture would be uncovered while every test still passed.
    const contentTests = read('tests/trial-arc-recap.test.ts');
    for (const kind of TRIAL_ARC_RECAP_CARD_KINDS) {
      expect(contentTests.includes(`'${kind}'`), `${kind} has no fixture`).toBe(true);
    }
  });

  it('the day 6 pop-up promises the screen and does not announce a finding', () => {
    const body = TRIAL_ARC_DAY_6.body.toLowerCase();
    for (const word of ['pattern', 'strength', 'we found', 'we learned', 'days left']) {
      expect(body.includes(word), `"${word}" appears`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// The storage decision, asserted where it was made.
// ---------------------------------------------------------------------

describe('the recap is stored apart from the Weekly Root Review', () => {
  it('has its own table, and does not write to the review one', () => {
    for (const file of [DATA, COMPOSE, ACTIONS]) {
      expect(read(file), file).not.toContain('member_weekly_reviews');
    }
  });

  it('the day the recap belongs to is a constraint, not a convention', () => {
    expect(read(MIGRATION)).toContain('day_number between 6 and 7');
  });

  it('the tier column can only hold a tier this build knows', () => {
    expect(read(MIGRATION)).toContain("tier in ('A', 'B', 'C')");
  });
});
