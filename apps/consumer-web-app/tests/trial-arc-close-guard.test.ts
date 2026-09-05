/**
 * DAY 7, the rules this build has to keep, asserted against its own source.
 *
 * The companion file tests/trial-arc-close.test.ts is about what the close
 * SAYS. This one is about the shape of the thing: where the write happens,
 * what the read path is allowed to touch, that the offer survives the
 * closer and is offered exactly once, that no component reads a conversion
 * URL from anywhere but the shared config, and that the stored vocabulary
 * cannot grow a field a sentence or a URL could arrive in. Every one of
 * these is a rule a later change could break while every content test still
 * passes.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { decideTrialArcMessage, type TrialArcFacts } from '@/lib/trial-arc/engine';
import {
  isPacingDay,
  TRIAL_ARC_CLOSE_DAY,
  TRIAL_ARC_LAST_BUILT_DAY,
  TRIAL_ARC_LAST_DAY,
  trialArcDayKind,
} from '@/lib/trial-arc/constants';
import { TRIAL_ARC_DAY_7 } from '@/lib/trial-arc/copy';
import { TRIAL_ARC_CLOSE_DOORS, TRIAL_ARC_CLOSE_FOCUS_KINDS } from '@/lib/trial-arc/closeTypes';
import { isMemberOnlyPath, isStaffOnlyPath } from '@/lib/auth/staffRouting';

/**
 * The character this house style forbids, written as a code point rather
 * than as itself, so this file can assert the rule without breaking it.
 */
const EM_DASH = String.fromCharCode(0x2014);

const ROOT = path.join(__dirname, '..');
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

const COPY = 'lib/trial-arc/closeCopy.ts';
const TYPES = 'lib/trial-arc/closeTypes.ts';
const PLAN = 'lib/trial-arc/closePlan.ts';
const COMPOSE = 'lib/trial-arc/closeCompose.ts';
const DATA = 'lib/trial-arc/closeData.ts';
const PAGE = 'app/trial/close/page.tsx';
const VIEW = 'components/trial-arc/TrialArcCloseView.tsx';
const OPENER = 'components/trial-arc/OpenTrialArcClose.tsx';
const ACTIONS = 'app/actions/trialArcDelivery.ts';
const LINKS = 'lib/config/conversionLinks.ts';
const MIGRATION = '../../supabase/migrations/00000000000206_trial_arc_close.sql';

// ---------------------------------------------------------------------
// TASK C5, the stored close renders without passing through a gate.
// ---------------------------------------------------------------------

/**
 * Everything the module graph below is not allowed to reach.
 *
 * The first three are the gates Prompt 6's continuation screen would fail:
 * her entitlement, her plan, and the assessment registry's own "may she
 * open this" facts. The fourth is any database client at all, because a
 * read path that can query is a read path that can be slow, can fail, and
 * can be gated by RLS on a screen whose whole point is that it renders from
 * one already-stored row.
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

/**
 * Every module the renderer pulls in at runtime, transitively.
 *
 * VALUE IMPORTS ONLY. A `import type { ... }` line is erased by the
 * compiler and reaches nothing at runtime, so following one would fail this
 * guard on a type name rather than on a dependency.
 */
function runtimeImportClosure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = read(file);
    for (const line of source.split('\n')) {
      const match = /^import\s+(?!type\s)([^;]*?)\s*from\s*'([^']+)'/.exec(line.trim());
      if (!match) continue;
      const specifier = match[2]!;
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.join(path.posix.dirname(file), specifier);
      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`]) {
        if (existsSync(path.join(ROOT, candidate))) {
          queue.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen];
}

describe('the read path depends only on the stored plan', () => {
  it('the renderer reaches no gate and no database client, anywhere in its import graph', () => {
    const closure = runtimeImportClosure(COPY);
    // A sanity check on the walker itself: if it resolved nothing, the
    // assertions below would pass vacuously.
    expect(closure.length).toBeGreaterThan(3);

    for (const file of closure) {
      const source = read(file);
      for (const forbidden of FORBIDDEN_ON_THE_READ_PATH) {
        const offending = source
          .split('\n')
          .filter((line) => /^import\s+(?!type\s)/.test(line.trim()) && line.includes(forbidden));
        expect(offending, `${file} imports ${forbidden}`).toEqual([]);
      }
    }
  });

  it('and reads no environment variable of its own, so the addresses are always handed in', () => {
    for (const file of runtimeImportClosure(COPY)) {
      expect(read(file).includes('process.env'), `${file} reads process.env`).toBe(false);
    }
  });

  it('the renderer takes a plan and two addresses, and returns words', () => {
    const source = read(COPY);
    expect(source).toContain('export function renderTrialArcClose(');
    expect(source).toContain('plan: TrialArcClosePlan');
    // No clock, no randomness: the same plan reads the same way on day 7 and
    // on the continuation screen a week later.
    expect(source).not.toContain('new Date(');
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('Math.random(');
  });

  it('the storage module reads one row and asks nothing else about her', () => {
    const source = read(DATA);
    expect(source).toContain("from('member_trial_arc_closes')");

    // Imports, not prose: the header comment legitimately talks about the
    // gates this path does not go through.
    const imports = source.split('\n').filter((line) => /^import\s/.test(line.trim()));
    for (const forbidden of ['membership', 'assessment-registry', 'assessment-foundation', 'assessment-runtime']) {
      expect(imports.filter((line) => line.includes(forbidden)), forbidden).toEqual([]);
    }
    for (const call of ['decideMemberAccess(', 'fetchMemberAccessFacts(', 'getMemberAssessmentFacts(', 'resolveTrialArcEligibility(']) {
      expect(source.includes(call), call).toBe(false);
    }

    // One table, and only one.
    const tables = [...source.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['member_trial_arc_closes']);
  });

  it('the page renders through exactly those two calls and gates nothing', () => {
    const source = read(PAGE);
    expect(source).toContain('getTrialArcClose(');
    expect(source).toContain('renderTrialArcClose(');
    for (const forbidden of ['resolveTrialArcEligibility', 'fetchMemberAccessFacts', 'decideMemberAccess', 'getMemberAssessmentFacts']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------
// No render composes a close, and none of it is recomputed.
// ---------------------------------------------------------------------

describe('no render composes a close', () => {
  const WRITERS = [
    'ensureTrialArcClose',
    'markTrialArcCloseOpened',
    'markTrialArcCloseDoor',
    'composeTrialArcClosePlan',
  ];

  it('the writers are named only in the storage module, the composer and the beacon actions', () => {
    const allowed = new Set([DATA, COMPOSE, ACTIONS]);
    for (const file of [PAGE, VIEW, OPENER, COPY, TYPES, PLAN, 'lib/trial-arc/engine.ts', 'app/actions/rootPopupMessages.ts']) {
      if (allowed.has(file)) continue;
      const source = read(file);
      for (const writer of WRITERS) {
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

  it('ensure READS before it composes, so an existing close never recomputes', () => {
    const source = read(DATA);
    const body = source.slice(source.indexOf('export async function ensureTrialArcClose'));
    const readFirst = body.indexOf('const existing = await getTrialArcClose(');
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

  it('only the open stamp and the door stamp may ever change on a written close', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('revoke update on member_trial_arc_closes from authenticated');
    expect(sql).toContain(
      'grant update (opened_at, door_tapped, door_tapped_at) on member_trial_arc_closes to authenticated'
    );
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
    expect(read(PAGE)).toContain('<OpenTrialArcClose');
  });

  it('the opener can refresh at most once, so a member the server refuses is never in a loop', () => {
    const source = read(OPENER);
    expect(source).toContain('router.refresh()');
    expect(source).toContain('alreadyAttempted()');
    expect(source).toContain('rememberAttempt()');
  });

  it('the door tap is a beacon too, so pressing one never costs her a re-render on the way out', () => {
    const source = read(VIEW);
    expect(source).toContain("sendBeacon({ event: 'trial_arc_close_door'");
    expect(source).not.toContain('Action(');
  });

  it('the quiet exit is recorded with the same mechanism as a door', () => {
    expect(read(VIEW)).toContain("recordDoor('home')");
  });
});

// ---------------------------------------------------------------------
// TASK C1, the close is offered exactly once, and the closer cannot stop it.
// ---------------------------------------------------------------------

function facts(overrides: Partial<TrialArcFacts> = {}): TrialArcFacts {
  return {
    dayNumber: 7,
    todayLocalDate: '2026-09-10',
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

describe('the day 7 offer', () => {
  it('is a milestone, not a pacing day', () => {
    expect(isPacingDay(TRIAL_ARC_CLOSE_DAY)).toBe(false);
    expect(trialArcDayKind(TRIAL_ARC_CLOSE_DAY)).toBe('milestone');
  });

  it('is the last day of the week, and the week is now fully built', () => {
    expect(TRIAL_ARC_CLOSE_DAY).toBe(TRIAL_ARC_LAST_DAY);
    expect(TRIAL_ARC_LAST_BUILT_DAY).toBe(TRIAL_ARC_LAST_DAY);
  });

  it('speaks, and opens the close screen', () => {
    const result = decideTrialArcMessage(facts());
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_DAY_7);
    expect(result.message.copy.href).toBe('/trial/close');
    expect(result.message.messageKey).toBe('trial_arc_day:7');
  });

  it('still speaks after the closer has tripped, which is the whole point of the split', () => {
    // Three ignored pacing messages stop days 1 to 5 for good.
    expect(decideTrialArcMessage(facts({ dayNumber: 4, pacingClosed: true })).speaks).toBe(false);
    // And leave day 7 standing.
    const day7 = decideTrialArcMessage(facts({ pacingClosed: true }));
    expect(day7.speaks).toBe(true);
    if (day7.speaks) expect(day7.message.copy).toEqual(TRIAL_ARC_DAY_7);
  });

  it('still speaks to a member who has been away, instead of the re-entry line', () => {
    const result = decideTrialArcMessage(facts({ paceState: 'STALLED', stalledMessageSent: false }));
    expect(result.speaks).toBe(true);
    if (result.speaks) expect(result.message.copy).toEqual(TRIAL_ARC_DAY_7);
  });

  it('and to a member who ran ahead of the whole week', () => {
    const result = decideTrialArcMessage(facts({ paceState: 'AHEAD' }));
    expect(result.speaks).toBe(true);
    if (result.speaks) expect(result.message.copy).toEqual(TRIAL_ARC_DAY_7);
  });

  it('and to a member who declined an experiment, since the close asks for nothing', () => {
    expect(decideTrialArcMessage(facts({ experimentDeclined: true })).speaks).toBe(true);
  });

  it('yields to Root Presence, which is the one thing that outranks it', () => {
    expect(decideTrialArcMessage(facts({ presenceDelivering: true })).speaks).toBe(false);
  });

  it('does not replace day 6, which is still its own milestone', () => {
    const day6 = decideTrialArcMessage(facts({ dayNumber: 6 }));
    expect(day6.speaks).toBe(true);
    if (day6.speaks) expect(day6.message.copy.href).toBe('/trial/week');
  });

  it('rides the same once-per-day key machinery every other arc day uses', () => {
    // The pop-up chain's outer check treats a trial arc key as one-time-ever
    // on a day-scoped key, which IS the once-per-day rule. Day 7's key is a
    // trial arc key, so it inherits it with no new branch.
    const chain = read('app/actions/rootPopupMessages.ts');
    const outer = chain.slice(chain.indexOf('export async function getMyRootPopupMessageAction'));
    expect(outer).toContain("message.kind === 'trial_arc_day'");
    expect(outer).toContain('isOfferPopupDue(dismissal)');
  });

  it('asks for nothing to be completed, so the closer could never count it against her', () => {
    expect(TRIAL_ARC_DAY_7.step).toBe('none');
  });

  it('a day past the end of the week is still nobody s', () => {
    expect(decideTrialArcMessage(facts({ dayNumber: 8 })).speaks).toBe(false);
  });
});

// ---------------------------------------------------------------------
// TASK C2, the vocabulary, enforced against the source itself.
// ---------------------------------------------------------------------

describe('the copy and the vocabulary', () => {
  it('every file in this build holds no em dash, including its own comments', () => {
    for (const file of [COPY, TYPES, PLAN, COMPOSE, DATA, PAGE, VIEW, OPENER, LINKS, MIGRATION]) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });

  it('the renderer names no route by hand', () => {
    const source = read(COPY);
    expect(source).toContain('TRIAL_ARC_ROUTES');
    expect(source).not.toMatch(/href: '\//);
  });

  it('and no URL by hand either, anywhere on the screen', () => {
    for (const file of [COPY, TYPES, PLAN, VIEW, PAGE]) {
      expect(read(file).includes('https://'), `${file} names a URL`).toBe(false);
    }
  });

  it('the day 7 pop-up promises the screen and does not announce a focus', () => {
    const body = TRIAL_ARC_DAY_7.body.toLowerCase();
    for (const word of ['pattern', 'strength', 'problem', 'we found', 'we learned', 'days left', 'last day', 'expires', 'membership', 'price']) {
      expect(body.includes(word), `"${word}" appears`).toBe(false);
    }
  });

  it('there is no free-string field anywhere in the stored vocabulary', () => {
    // Every field on a stored plan is a slug from a closed set or a number.
    // A field typed as a bare `string` would be the shape a sentence or a
    // URL could arrive in.
    const types = read(TYPES);
    const block = types.slice(
      types.indexOf('export type TrialArcCloseFocus ='),
      types.indexOf('// ---------------------------------------------------------------------\n// The rendered close')
    );
    const bareStrings = [...block.matchAll(/^\s*(\w+): string;/gm)].map((m) => m[1]);
    // composedLocalDate, composedAt, openedAt and doorTappedAt live on the
    // RECORD, which is the row's own metadata, not on the plan. The plan
    // itself has none.
    expect(bareStrings.filter((name) => !/^(composed|opened|doorTapped)/.test(name!))).toEqual([]);
  });

  it('every door and every focus kind is covered by the content tests', () => {
    const contentTests = read('tests/trial-arc-close.test.ts');
    for (const door of TRIAL_ARC_CLOSE_DOORS) {
      expect(contentTests.includes(`'${door}'`), `${door} has no fixture`).toBe(true);
    }
    for (const kind of TRIAL_ARC_CLOSE_FOCUS_KINDS) {
      expect(contentTests.includes(`'${kind}'`), `${kind} has no fixture`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// TASK B, the conversion links live in one place.
// ---------------------------------------------------------------------

/** Every .ts and .tsx file under app/, components/ and lib/. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir))) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const rel = path.posix.join(dir, entry);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry)) out.push(rel);
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(dir);
  return out;
}

describe('the outbound conversion links have one source of truth', () => {
  it('the two environment variables are NAMED in exactly one file, which is stronger than being read in one', () => {
    // Naming rather than reading, deliberately. A module that merely
    // mentions one of these variable names is a module that could start
    // reading it, and the whole point of this config is that there is one
    // place to look when a link changes.
    const namers = sourceFiles().filter((file) =>
      /(MEMBERSHIP_PRICING_URL|LEAD_DISCOVERY_CALL_URL)/.test(read(file))
    );
    expect(namers).toEqual([LINKS]);
  });

  it('the lead capture widget reads its booking link from the shared config', () => {
    const source = read('lib/lead-capture/env.ts');
    expect(source).toContain("from '../config/conversionLinks'");
    expect(source).toContain('return discoveryCallUrl();');
  });

  it('the booking address itself did not change when it moved', () => {
    expect(read(LINKS)).toContain("'https://calendly.com/mefwellness/discovery-assessment'");
  });

  it('an unset membership page is null, never a placeholder string', () => {
    const source = read(LINKS);
    expect(source).toContain('membershipPricingUrl(): string | null');
  });

  it('the placeholder module and its sentinel are gone from the codebase', () => {
    expect(existsSync(path.join(ROOT, 'lib/membership/pricing.ts'))).toBe(false);
    for (const file of sourceFiles()) {
      const source = read(file);
      // Not even in a comment: the token is gone from the app entirely, so
      // there is nothing for a future change to copy back out of one.
      expect(source.includes('PRICING_LINK'), file).toBe(false);
      expect(source.includes('getPricingUrl('), file).toBe(false);
      expect(source.includes('isPricingUrlConfigured('), file).toBe(false);
    }
  });

  it('the lock screen draws no button when there is no page to point it at', () => {
    const source = read('app/trial-ended/page.tsx');
    expect(source).toContain('const pricingUrl = membershipPricingUrl();');
    // Ternary, not an unconditional anchor: the button exists only inside
    // the branch where the address does.
    expect(source).toContain('{pricingUrl ? (');
    expect(source).toContain('href={pricingUrl}');
  });

  it('the close screen resolves the addresses on the server and hands them down', () => {
    const page = read(PAGE);
    expect(page).toContain("from '@/lib/config/conversionLinks'");
    expect(page).toContain('conversionLinks()');
    // And the client component never resolves one itself.
    expect(read(VIEW).includes('conversionLinks')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The route.
// ---------------------------------------------------------------------

describe('the close route', () => {
  it('is a member surface, so staff are sent to their own dashboard', () => {
    expect(isMemberOnlyPath('/trial/close')).toBe(true);
    expect(isStaffOnlyPath('/trial/close')).toBe(false);
  });

  it('does not swallow the post-trial lock screen, which is a different screen', () => {
    expect(isMemberOnlyPath('/trial-ended')).toBe(false);
  });

  it('the pop-up button and the route map name the same path', () => {
    expect(TRIAL_ARC_DAY_7.href).toBe('/trial/close');
    expect(read('lib/trial-arc/constants.ts')).toContain("weekClose: '/trial/close'");
  });
});

// ---------------------------------------------------------------------
// The storage decision, asserted where it was made.
// ---------------------------------------------------------------------

describe('the close is stored apart from the day 6 recap', () => {
  it('has its own table, and does not write to the recap one', () => {
    for (const file of [DATA, COMPOSE]) {
      expect(read(file), file).not.toContain('member_trial_arc_recaps');
    }
  });

  it('the day the close belongs to is a constraint, not a convention', () => {
    expect(read(MIGRATION)).toContain('day_number = 7');
  });

  it('every stored column can only hold a value this build knows', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("completion in ('full', 'partial')");
    expect(sql).toContain("focus_kind in ('signal', 'thin')");
    expect(sql).toContain("lead_door in ('conversation', 'membership')");
    expect(sql).toContain("door_tapped in ('conversation', 'membership', 'home')");
  });

  it('there is no column an expiry, a countdown or an offer deadline could live in', () => {
    const sql = read(MIGRATION).toLowerCase();
    for (const word of ['expires_at', 'countdown', 'deadline', 'offer_ends', 'days_remaining', 'ends_at']) {
      expect(sql.includes(word), `${word} appears`).toBe(false);
    }
  });
});
