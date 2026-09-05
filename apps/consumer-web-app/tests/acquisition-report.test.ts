/**
 * THE ACQUISITION REPORT'S ARITHMETIC, with no database in sight.
 *
 * What these prove, which an integration test cannot prove cheaply:
 *
 *   1. Every column follows the SAME people. The window selects arrivals,
 *      and an account with no arrival can only ever reach the last two
 *      columns, so a funnel can never report more starts than visits.
 *   2. "Untracked" and "nothing for this grouping" are different answers.
 *      A printed QR card has a source and no creative, and calling that
 *      untracked would be a lie about the card.
 *   3. A zero row is printed. Every source code the link builder knows
 *      about appears whether or not anybody arrived on it, because "this
 *      card is producing nothing" is the most useful thing the screen says.
 *   4. A rate with no denominator is nothing, never nought per cent.
 *   5. The URL round trips: changing the grouping never resets the window,
 *      and changing the window never resets the grouping.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FUNNEL_STAGES,
  NOT_SET_KEY,
  UNTRACKED_KEY,
  bucketOf,
  conversionRate,
  formatRate,
  groupValueOf,
  isUntrackedRow,
  ratesOf,
  rollUp,
  totalsOf,
  type AcquisitionSubjectRow,
} from '@/lib/acquisition/report';
import { windowBounds } from '@/lib/acquisition/reportData';
import { acquisitionHref, parseAcquisitionView } from '@/lib/acquisition/reportView';

function row(overrides: Partial<AcquisitionSubjectRow> = {}): AcquisitionSubjectRow {
  return {
    rowKind: 'visit',
    sessionId: 'session-1',
    memberId: null,
    sourceCode: null,
    sourceRaw: null,
    sourceChannel: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    hadAdClick: false,
    geoCountry: null,
    geoRegion: null,
    geoCity: null,
    partnerName: null,
    locationName: null,
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    isTest: false,
    anchorAt: '2026-09-01T10:00:00.000Z',
    landedAt: '2026-09-01T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    leadCapturedAt: null,
    accountCreatedAt: null,
    paidAt: null,
    ...overrides,
  };
}

/** A whole arrival that went all the way through, on a partner's card. */
const FULL_JOURNEY = row({
  sourceCode: 'partner-01',
  sourceRaw: 'partner-01',
  sourceChannel: 'partner',
  utmSource: 'partner-01',
  utmMedium: 'counter_card',
  utmCampaign: 'autumn_run',
  utmContent: 'card_a',
  locationName: 'Ridgeway Physio',
  locationCity: 'Milton Keynes',
  geoCountry: 'GB',
  geoCity: 'Milton Keynes',
  memberId: 'member-1',
  startedAt: '2026-09-01T10:01:00.000Z',
  completedAt: '2026-09-01T10:06:00.000Z',
  leadCapturedAt: '2026-09-01T10:07:00.000Z',
  accountCreatedAt: '2026-09-02T09:00:00.000Z',
  paidAt: '2026-09-10T09:00:00.000Z',
});

describe('what counts as untracked', () => {
  it('an arrival that carried nothing identifying is untracked', () => {
    expect(isUntrackedRow(row())).toBe(true);
    expect(bucketOf(row(), 'source')).toEqual({ key: UNTRACKED_KEY, kind: 'untracked' });
  });

  it('a landing path, a referring host and a place do not make an arrival tracked', () => {
    // Every arrival has those, including somebody who typed the address in.
    const bare = row({ geoCountry: 'GB', geoCity: 'Milton Keynes' });
    expect(isUntrackedRow(bare)).toBe(true);
  });

  it('an ad click id alone makes an arrival tracked', () => {
    expect(isUntrackedRow(row({ hadAdClick: true }))).toBe(false);
  });

  it('a tracked arrival with nothing for this grouping is NOT untracked', () => {
    const qrCard = row({ sourceCode: 'qr-card', sourceRaw: 'qr-card' });
    expect(bucketOf(qrCard, 'source')).toEqual({ key: 'qr-card', kind: 'named' });
    expect(bucketOf(qrCard, 'creative')).toEqual({ key: NOT_SET_KEY, kind: 'not_set' });
    expect(bucketOf(qrCard, 'campaign')).toEqual({ key: NOT_SET_KEY, kind: 'not_set' });
  });

  it('an unregistered code stays its own row instead of becoming direct traffic', () => {
    const invented = row({ sourceCode: null, sourceRaw: 'made-up-code' });
    expect(groupValueOf(invented, 'source')).toBe('made-up-code');
    expect(bucketOf(invented, 'source').kind).toBe('named');
  });
});

describe('the five groupings ask five different questions', () => {
  it('a partner location and a request geo are never the same value', () => {
    const partnerLocation = groupValueOf(
      row({ locationName: 'Ridgeway Physio', locationCity: 'Milton Keynes' }),
      'location'
    );
    const requestGeo = groupValueOf(row({ geoCity: 'Leeds', geoCountry: 'GB' }), 'geo');
    expect(partnerLocation).toBe('Ridgeway Physio, Milton Keynes');
    expect(requestGeo).toBe('Leeds, GB');
  });

  it('geo stops at the city and carries nothing finer', () => {
    const value = groupValueOf(
      row({ geoCity: 'Milton Keynes', geoRegion: 'ENG', geoCountry: 'GB' }),
      'geo'
    );
    expect(value).toBe('Milton Keynes, ENG, GB');
    expect(value).not.toMatch(/\d+\.\d+/);
  });

  it('campaign and creative come from the link, not from the source code', () => {
    expect(groupValueOf(FULL_JOURNEY, 'campaign')).toBe('autumn_run');
    expect(groupValueOf(FULL_JOURNEY, 'creative')).toBe('card_a');
  });
});

describe('the roll up', () => {
  it('counts every stage of one arrival that went all the way through', () => {
    const [partner] = rollUp([FULL_JOURNEY], 'source');
    expect(partner).toMatchObject({
      key: 'partner-01',
      visits: 1,
      starts: 1,
      completions: 1,
      leads: 1,
      accounts: 1,
      paid: 1,
    });
  });

  it('an account with no arrival reaches the last two columns and no others', () => {
    // This is the honesty rule. Its visit is either already counted on the
    // arrival leg or no longer exists as a row anywhere, so counting it
    // again from the account's own copy would double count the funnel.
    const accountOnly = row({
      rowKind: 'account',
      sessionId: null,
      memberId: 'member-2',
      landedAt: null,
      accountCreatedAt: '2026-09-02T09:00:00.000Z',
      paidAt: '2026-09-03T09:00:00.000Z',
    });
    const rows = rollUp([accountOnly], 'source');
    const untracked = rows.find((entry) => entry.key === UNTRACKED_KEY);
    expect(untracked).toMatchObject({
      visits: 0,
      starts: 0,
      completions: 0,
      leads: 0,
      accounts: 1,
      paid: 1,
    });
  });

  it('never reports more starts than visits', () => {
    const rows = rollUp(
      [
        FULL_JOURNEY,
        row({ rowKind: 'account', sessionId: null, memberId: 'member-3', landedAt: null }),
        row({ sourceCode: 'qr-card', sourceRaw: 'qr-card', startedAt: '2026-09-01T10:01:00.000Z' }),
      ],
      'source'
    );
    for (const entry of rows) {
      expect(entry.starts).toBeLessThanOrEqual(entry.visits + (entry.accounts > 0 ? 1 : 0));
      expect(entry.completions).toBeLessThanOrEqual(entry.starts);
    }
    const totals = totalsOf(rows);
    expect(totals.visits).toBe(2);
    expect(totals.starts).toBe(2);
    expect(totals.accounts).toBe(2);
  });

  it('the untracked row is always present, at zero when nothing is untracked', () => {
    const rows = rollUp([FULL_JOURNEY], 'source');
    const untracked = rows.find((entry) => entry.key === UNTRACKED_KEY);
    expect(untracked).toBeTruthy();
    expect(untracked?.visits).toBe(0);
    expect(untracked?.accounts).toBe(0);
  });

  it('every known source code appears even when nobody arrived on it', () => {
    const rows = rollUp([FULL_JOURNEY], 'source', [
      { key: 'partner-01', label: 'Ridgeway Physio', detail: 'partner' },
      { key: 'partner-02', label: 'Partner slot 2 (unassigned)', detail: 'partner' },
      { key: 'ig', label: 'Instagram', detail: 'social', retired: true },
    ]);
    const keys = rows.map((entry) => entry.key);
    expect(keys).toContain('partner-02');
    expect(keys).toContain('ig');
    expect(rows.find((entry) => entry.key === 'partner-02')?.visits).toBe(0);
    expect(rows.find((entry) => entry.key === 'ig')?.retired).toBe(true);
    // A known code keeps its human label rather than printing its slug.
    expect(rows.find((entry) => entry.key === 'partner-01')?.label).toBe('Ridgeway Physio');
  });

  it('the totals equal the sum of the rows, always', () => {
    const rows = rollUp(
      [
        FULL_JOURNEY,
        row({ sourceCode: 'qr-card', sourceRaw: 'qr-card' }),
        row(),
        row({ rowKind: 'account', sessionId: null, memberId: 'm', landedAt: null }),
      ],
      'source',
      [{ key: 'partner-05', label: 'Partner slot 5', detail: 'partner' }]
    );
    const totals = totalsOf(rows);
    for (const stage of FUNNEL_STAGES) {
      const summed = rows.reduce((sum, entry) => sum + entry[stage.key], 0);
      expect(totals[stage.key]).toBe(summed);
    }
  });

  it('puts the catch-all rows last so the working partners read first', () => {
    const rows = rollUp([FULL_JOURNEY, row(), row({ sourceCode: 'qr-card' })], 'creative');
    expect(rows[rows.length - 1]?.kind).toBe('untracked');
    expect(rows[0]?.kind).toBe('named');
  });
});

describe('conversion rates', () => {
  it('a stage nobody has reached has no rate at all, never nought per cent', () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(formatRate(null)).toBeNull();
    const rates = ratesOf({ visits: 0, starts: 0, completions: 0, leads: 0, accounts: 0, paid: 0 });
    expect(rates.starts).toBeNull();
  });

  it('nobody converting out of a real denominator IS nought per cent', () => {
    expect(formatRate(conversionRate(0, 12))).toBe('0%');
  });

  it('reads each stage against the one before it', () => {
    const rates = ratesOf({ visits: 100, starts: 50, completions: 25, leads: 5, accounts: 2, paid: 1 });
    expect(formatRate(rates.starts ?? null)).toBe('50%');
    expect(formatRate(rates.completions ?? null)).toBe('50%');
    expect(formatRate(rates.leads ?? null)).toBe('20%');
    expect(formatRate(rates.accounts ?? null)).toBe('40%');
    expect(formatRate(rates.paid ?? null)).toBe('50%');
  });

  it('keeps one decimal below ten per cent so a small experiment is not rounded away', () => {
    expect(formatRate(conversionRate(1, 40))).toBe('2.5%');
    expect(formatRate(conversionRate(1, 4))).toBe('25%');
  });
});

describe('the window', () => {
  it('is half open, so the last day is whole and the day after is not counted', () => {
    expect(windowBounds('2026-08-31', '2026-09-03')).toEqual({
      fromIso: '2026-08-31T00:00:00.000Z',
      toIso: '2026-09-04T00:00:00.000Z',
    });
  });

  it('a single day window is one whole day', () => {
    const bounds = windowBounds('2026-08-31', '2026-08-31');
    expect(bounds.fromIso).toBe('2026-08-31T00:00:00.000Z');
    expect(bounds.toIso).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('the URL', () => {
  it('defaults to grouping by source and the last thirty days, test traffic excluded', () => {
    const view = parseAcquisitionView(undefined, '2026-09-03');
    expect(view.groupBy).toBe('source');
    expect(view.rangeKey).toBe('30d');
    expect(view.includeTestAccounts).toBe(false);
  });

  it('an unknown grouping falls back to source rather than showing nothing', () => {
    expect(parseAcquisitionView({ group: 'astrology' }, '2026-09-03').groupBy).toBe('source');
  });

  it('changing the grouping carries the window and the toggle over', () => {
    const view = parseAcquisitionView({ range: '7d', test: 'on', group: 'campaign' }, '2026-09-03');
    const href = acquisitionHref(view, { groupBy: 'geo' });
    expect(href).toContain('range=7d');
    expect(href).toContain('test=on');
    expect(href).toContain('group=geo');
  });

  it('changing the window carries the grouping over', () => {
    const view = parseAcquisitionView({ range: '30d', group: 'location' }, '2026-09-03');
    const href = acquisitionHref(view, { rangeKey: '90d' });
    expect(href).toContain('range=90d');
    expect(href).toContain('group=location');
  });

  it('round trips through parse, so what the link says is what the screen shows', () => {
    const view = parseAcquisitionView({ range: '7d', group: 'creative', test: 'on' }, '2026-09-03');
    const href = acquisitionHref(view);
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
    const again = parseAcquisitionView(params, '2026-09-03');
    expect(again.groupBy).toBe('creative');
    expect(again.rangeKey).toBe('7d');
    expect(again.includeTestAccounts).toBe(true);
  });
});

// ---------------------------------------------------------------------
// The rules the source itself has to keep passing
// ---------------------------------------------------------------------

describe('the report shows behavioural funnel data and nothing else', () => {
  const root = path.resolve(__dirname, '..');
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf-8');

  it('the report reader never selects an answer, a pattern or an email', () => {
    const reader = read('lib/acquisition/reportData.ts');
    for (const forbidden of ['pattern_key', 'lead_email', 'public_entry_answers', 'answer_value']) {
      expect(reader).not.toContain(forbidden);
    }
  });

  it('the report screen never selects one either', () => {
    const page = read('app/admin/acquisition/page.tsx');
    for (const forbidden of ['pattern_key', 'lead_email', 'public_entry_answers', 'patternSpread']) {
      expect(page).not.toContain(forbidden);
    }
  });

  it('the report view carries no answer column and no pattern key', () => {
    const migration = read('../../supabase/migrations/00000000000201_acquisition_report.sql');
    const view = migration.slice(
      migration.indexOf('create view acquisition_report_rows'),
      migration.indexOf('comment on view acquisition_report_rows')
    );
    expect(view.length).toBeGreaterThan(0);
    for (const forbidden of ['pattern_key', 'lead_email', 'public_entry_answers', 'answer_value']) {
      expect(view).not.toContain(forbidden);
    }
  });

  it('geo stops at the city, and no finer column exists to select', () => {
    const migration = read('../../supabase/migrations/00000000000201_acquisition_report.sql');
    expect(migration).not.toMatch(/latitude|longitude|postcode|postal_code|ip_address/i);
  });

  it('which tiers count as paid is read from the tier table, not written into the query', () => {
    const migration = read('../../supabase/migrations/00000000000201_acquisition_report.sql');
    const view = migration.slice(
      migration.indexOf('create view member_paid_conversion'),
      migration.indexOf('comment on view member_paid_conversion')
    );
    expect(view).toContain("t.grants_access = true");
    expect(view).toContain("t.key <> 'trial'");
    // A hardcoded list would stop counting a paid tier added next year.
    expect(view).not.toMatch(/in \('monthly', ?'annual'/);
    // A purchase event is picked up with no switch to flip.
    expect(view).toContain("'purchase_completed'");
  });
});

describe('the browser still wins when it carries an arrival', () => {
  const root = path.resolve(__dirname, '..');
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf-8');

  it('signup runs the email match only when this browser carries no token', () => {
    const auth = read('app/actions/auth.ts');
    expect(auth).toContain('const browserCarriesArrival =');
    expect(auth).toMatch(/if \(!browserCarriesArrival\) \{\s*await linkArrivalByEmail/);
  });

  it('the signup form sends whether it holds one, and never the token itself', () => {
    const form = read('app/(auth)/signup/page.tsx');
    expect(form).toContain('PUBLIC_ENTRY_TOKEN_FIELD');
    expect(form).toContain('publicEntryArrivalValue(fromPublicEntry)');
    // The token itself is never put in the form: anything a browser can
    // name, a browser can invent.
    expect(form).not.toMatch(/name=\{?["']?visitorToken/);
  });

  it('the email match refuses to overwrite an origin that already stands', () => {
    const data = read('lib/acquisition/data.ts');
    const fn = data.slice(data.indexOf('export async function attachUserAcquisitionFromLead'));
    expect(fn).toContain("if (existing.data) return { attached: false, sourceCode: null };");
    expect(fn).toContain('ignoreDuplicates: true');
    // It reads back what it wrote rather than treating "no error" as "it
    // worked": a write matching no policy returns zero rows and no error.
    expect(fn).toContain("from('user_acquisition')\n    .select('source_code')");
  });

  it('the email match never writes the browser bind', () => {
    const data = read('lib/acquisition/data.ts');
    const fn = data.slice(data.indexOf('export async function attachUserAcquisitionFromLead'));
    expect(fn).not.toContain("from('member_public_entry_origin')");
  });
});
