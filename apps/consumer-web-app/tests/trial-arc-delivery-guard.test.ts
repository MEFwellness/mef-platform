/**
 * THE RULES THIS BUILD HAS TO KEEP, ASSERTED AGAINST ITS OWN SOURCE.
 *
 * The companion file tests/trial-arc-pacing.test.ts is about what the arc
 * DECIDES. This one is about the shape of the thing: where the branch sits,
 * who is allowed to write a receipt, what the arc is not allowed to be
 * wired into, and the fact that it ships switched off. Every one of these
 * is a rule a later change could break while the pacing tests all still
 * pass.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from '@/lib/trial-arc/config';

const ROOT = path.join(__dirname, '..');
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

const CHAIN = 'app/actions/rootPopupMessages.ts';
const ENGINE = 'lib/trial-arc/engine.ts';
const COPY = 'lib/trial-arc/copy.ts';
const DATA = 'lib/trial-arc/data.ts';
const DELIVERY_ACTIONS = 'app/actions/trialArcDelivery.ts';
const MIGRATION = '../../supabase/migrations/00000000000204_trial_arc_delivery.sql';

describe('it ships switched off', () => {
  it('TRIAL_ARC_LAUNCH is still null, so the arc is launched for no one', () => {
    expect(TRIAL_ARC_LAUNCH).toBeNull();
    expect(trialArcLaunchInstant()).toBeNull();
  });

  it('nothing in the application ever hands the engine a launch date of its own', () => {
    // The escape hatch exists for the test suite and the live verification
    // runner only. An application file passing it would be a second switch
    // beside the constant, which is exactly what prompt 2 refused to build.
    for (const file of [CHAIN, DELIVERY_ACTIONS, 'lib/public-entry/welcome.ts', 'app/dashboard/page.tsx']) {
      expect(read(file), file).not.toContain('launch:');
    }
  });

  it('the engine refuses on the launch constant BEFORE it reads anything, so the arc costs Home nothing while it is off', () => {
    const source = read(ENGINE);
    const body = source.slice(source.indexOf('export async function resolveTrialArcDecision'));
    const launchCheck = body.indexOf('trialArcLaunchInstant(');
    const firstRead = body.indexOf('await ');
    expect(launchCheck).toBeGreaterThan(-1);
    expect(launchCheck).toBeLessThan(firstRead);
  });
});

describe('eligibility is the only gate, and it is not re-implemented', () => {
  it('the engine asks lib/trial-arc/eligibility.ts and refuses on its answer', () => {
    const source = read(ENGINE);
    expect(source).toContain("from './eligibility'");
    expect(source).toContain('if (!eligibility.eligible)');
  });

  it('the engine never re-derives a relationship or re-tests a coach assignment for itself', () => {
    const source = read(ENGINE);
    expect(source).not.toContain('deriveRelationship');
    expect(source).not.toContain('coach_client_assignments');
    expect(source).not.toContain('everCoachAssigned');
    expect(source).not.toContain("tier ===");
  });

  it('nothing in the arc names the suppression column as a column', () => {
    // Prose about it in a header comment is fine and is not a read. A
    // quoted column name is what a PostgREST select, filter or write looks
    // like, and tests/trial-arc-suppression-guard.test.ts already owns the
    // full rule; this is the same fence drawn round this build's own files.
    for (const file of [ENGINE, COPY, DATA, DELIVERY_ACTIONS, 'lib/trial-arc/state.ts', 'lib/trial-arc/day.ts']) {
      const source = read(file);
      expect(source, file).not.toContain("'trial_arc_suppressed_at'");
      expect(source, file).not.toContain('"trial_arc_suppressed_at"');
      expect(source, file).not.toContain('trial_arc_suppressed_at:');
    }
  });
});

describe('where the branch sits', () => {
  const source = read(CHAIN);
  const body = source.slice(
    source.indexOf('async function findMyPendingRootPopupMessage'),
    source.indexOf('/** The dismissal state (if any) for a specific message key')
  );

  it('the trial arc is the SECOND kind the chain can return, immediately after the welcome', () => {
    const kinds = [...body.matchAll(/kind: '([a-z0-9_]+)'/g)].map((match) => match[1]);
    expect(kinds[0]).toBe('public_entry_welcome');
    expect(kinds[1]).toBe('trial_arc_day');
  });

  it('its branch checks its own due-ness, per this chain\'s one rule', () => {
    // The stretch of code between the PREVIOUS return and this one, which is
    // the same mechanical rule tests/root-popup-chain-guards.test.ts applies
    // to every branch in the file.
    const ownReturn = body.lastIndexOf('return {', body.indexOf("kind: 'trial_arc_day'"));
    const previousReturn = body.lastIndexOf('return {', ownReturn - 1);
    expect(body.slice(previousReturn, ownReturn)).toContain('await isOfferStillDue(');
  });

  it('the header table names it, with the lifetime it actually uses', () => {
    expect(source).toMatch(/trial_arc_day\s+isOfferStillDue\s+once per trial day/);
  });

  it('the outer due-check gives it the once-per-day rule, not the recurring one', () => {
    const outer = source.slice(source.indexOf('export async function getMyRootPopupMessageAction'));
    expect(outer).toContain("message.kind === 'trial_arc_day'");
    expect(outer).toContain('isOfferPopupDue(dismissal)');
  });
});

describe('the arc is a pop-up and nothing else', () => {
  it('is not wired into the Priority Card hierarchy', () => {
    for (const file of ['lib/priority/service.ts', 'lib/priority/select.ts', 'lib/priority/types.ts', 'lib/priority/copy.ts']) {
      expect(read(file), file).not.toContain('trial-arc');
      expect(read(file), file).not.toContain('trialArc');
    }
  });

  it('has no Home card and no route of its own', () => {
    const home = read('app/dashboard/page.tsx');
    expect(home).not.toContain('trial-arc');
    expect(home).not.toContain('trialArc');
  });
});

describe('no render writes a receipt', () => {
  const WRITERS = ['claimTrialArcDelivery', 'markTrialArcCtaTapped'];

  it('the two writers are named only in the data module, the beacon actions, and tests', () => {
    const allowed = new Set([DATA, DELIVERY_ACTIONS]);
    const searched = [
      CHAIN,
      ENGINE,
      COPY,
      'lib/trial-arc/state.ts',
      'lib/trial-arc/day.ts',
      'lib/trial-arc/connection.ts',
      'lib/trial-arc/presence.ts',
      'lib/public-entry/welcome.ts',
      'app/dashboard/page.tsx',
      'components/dashboard/RootMessagePopupClient.tsx',
      'components/trial-arc/TrackTrialArcDelivered.tsx',
      DATA,
      DELIVERY_ACTIONS,
    ];
    for (const file of searched) {
      const source = read(file);
      for (const writer of WRITERS) {
        if (allowed.has(file)) continue;
        expect(source.includes(`${writer}(`), `${writer} appears in ${file}`).toBe(false);
      }
    }
  });

  it('the engine and the decision write nothing at all', () => {
    for (const file of [ENGINE, 'lib/trial-arc/state.ts', 'lib/trial-arc/day.ts', 'lib/trial-arc/connection.ts', 'lib/trial-arc/presence.ts', COPY]) {
      const source = read(file);
      expect(source, file).not.toContain('.insert(');
      expect(source, file).not.toContain('.upsert(');
      expect(source, file).not.toContain('.update(');
      expect(source, file).not.toContain('.delete(');
    }
  });

  it('the presence check reads the greeting row and never claims it', () => {
    const source = read('lib/trial-arc/presence.ts');
    expect(source).not.toContain('tryMarkReturnGreetingShown(');
    expect(source).toContain(".from('member_return_greetings')");
    expect(source).toContain('.select(');
  });

  it('the receipt is fired from a mounted effect, through the beacon, not from a Server Action call', () => {
    const tracker = read('components/trial-arc/TrackTrialArcDelivered.tsx');
    expect(tracker).toContain('useEffect');
    expect(tracker).toContain('sendBeacon');
    expect(tracker).not.toContain('Action(');
  });
});

describe('the delivery table', () => {
  const sql = read(MIGRATION);

  it('is insert if absent, enforced by the database', () => {
    expect(sql).toContain('unique (member_id, message_key)');
    expect(read(DATA)).toContain('.insert(');
    expect(read(DATA)).not.toContain('.upsert(');
  });

  it('only ever lets the CTA stamp change on a written row', () => {
    expect(sql).toContain('revoke update on member_trial_arc_deliveries from authenticated');
    expect(sql).toContain('grant update (cta_tapped_at) on member_trial_arc_deliveries to authenticated');
  });

  it('is written only by the member herself, from her own session', () => {
    expect(sql).toContain('for insert with check (member_id = auth.uid())');
    expect(sql).not.toContain('service_role');
  });

  it('records the day, the state and the step the closer needs', () => {
    for (const column of ['day_number', 'pace_state', 'pointed_step', 'delivered_local_date', 'cta_tapped_at']) {
      expect(sql, column).toContain(column);
    }
  });

  it('has room for days 6 and 7 already, so a later prompt changes no schema', () => {
    expect(sql).toContain('day_number between 1 and 7');
  });
});

describe('the copy', () => {
  const source = read(COPY);

  it('holds no em dash anywhere in the file, including its own comments', () => {
    expect(source).not.toContain('—');
  });

  it('names every route it can send her to, so a button can never point at a screen the message did not promise', () => {
    expect(source).toContain('TRIAL_ARC_ROUTES');
    // No hand written path strings: every href comes from the one route map.
    expect(source).not.toMatch(/href: '\//);
  });
});
