/**
 * SOURCE ATTRIBUTION. The experiment's one measurable question is which
 * INDIVIDUAL source sends people who finish, so a code has to survive being
 * printed on a card, pasted into a link shortener, typed by hand and
 * mangled by an ad platform, and it has to stay distinguishable from every
 * other code the whole way.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeSourceCode,
  partnerLinkFor,
  referrerHostOf,
  resolveSourceCode,
  SOURCE_QUERY_KEYS,
} from '../lib/public-entry/sources';
import { rollUpBySource, totalsOf, type FunnelRow } from '../lib/public-entry/funnel';

describe('normalizing a code', () => {
  it('accepts the codes we hand out', () => {
    for (const code of ['direct', 'qa', 'partner-01', 'client-04', 'ig', 'qr-card', 'corp-03']) {
      expect(normalizeSourceCode(code)).toBe(code);
    }
  });

  it('survives being typed by a human', () => {
    expect(normalizeSourceCode(' Partner-01 ')).toBe('partner-01');
    expect(normalizeSourceCode('PARTNER-01')).toBe('partner-01');
    expect(normalizeSourceCode('partner_01')).toBe('partner01');
  });

  it('refuses anything that cannot be a code', () => {
    expect(normalizeSourceCode(null)).toBeNull();
    expect(normalizeSourceCode('')).toBeNull();
    expect(normalizeSourceCode('   ')).toBeNull();
    expect(normalizeSourceCode('!!!')).toBeNull();
    expect(normalizeSourceCode('---')).toBeNull();
  });

  it('never produces something the database would reject', () => {
    // The same pattern the column's own check constraint enforces
    // (migration 197). A value that got past here and failed there would
    // lose an arrival's attribution silently.
    const pattern = /^[a-z0-9][a-z0-9-]{0,39}$/;
    const inputs = [
      'Dr. Okafor',
      '  -leading-dash',
      'trailing-dash-',
      'a'.repeat(80),
      'ünïcödé',
      '../../etc/passwd',
      "'; drop table public_entry_sources; --",
    ];
    for (const input of inputs) {
      const code = normalizeSourceCode(input);
      if (code !== null) expect(code).toMatch(pattern);
    }
  });

  it('never lets one source be mistaken for another after normalizing', () => {
    expect(normalizeSourceCode('partner-01')).not.toBe(normalizeSourceCode('partner-02'));
    expect(normalizeSourceCode('client-01')).not.toBe(normalizeSourceCode('corp-01'));
  });
});

describe('reading a code off an inbound link', () => {
  it('reads the printed path form', () => {
    expect(resolveSourceCode({ pathSegment: 'dr-okafor' })).toBe('dr-okafor');
  });

  it('reads every query form a partner might paste', () => {
    for (const key of SOURCE_QUERY_KEYS) {
      expect(resolveSourceCode({ query: { [key]: 'partner-02' } })).toBe('partner-02');
    }
  });

  it('lets the printed form win when both are present', () => {
    // A printed link is a deliberate act and a query parameter is what
    // survives being pasted around. When they disagree, the deliberate one
    // is the truth.
    expect(
      resolveSourceCode({ pathSegment: 'qr-card', query: { ref: 'ig' } })
    ).toBe('qr-card');
  });

  it('returns null for a link that carried no code at all', () => {
    expect(resolveSourceCode({})).toBeNull();
    expect(resolveSourceCode({ pathSegment: null, query: {} })).toBeNull();
  });

  it('handles a query value arriving as an array', () => {
    expect(resolveSourceCode({ query: { ref: ['partner-03', 'ignored'] } })).toBe('partner-03');
  });
});

describe('the referrer', () => {
  it('keeps the host and never the page', () => {
    expect(referrerHostOf('https://www.instagram.com/p/abc123/?hl=en')).toBe('www.instagram.com');
  });

  it('drops our own host, because an internal navigation is not a referral', () => {
    expect(referrerHostOf('https://app.mefwellness.com/login', 'app.mefwellness.com')).toBeNull();
  });

  it('is null for anything unparseable or absent', () => {
    expect(referrerHostOf(null)).toBeNull();
    expect(referrerHostOf('not a url')).toBeNull();
  });
});

describe('the link handed to a partner', () => {
  it('is built from the code alone, so every one of them is built the same way', () => {
    expect(partnerLinkFor('https://app.mefwellness.com', 'dr-okafor')).toBe(
      'https://app.mefwellness.com/energy/dr-okafor'
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(partnerLinkFor('https://app.mefwellness.com/', 'ig')).toBe(
      'https://app.mefwellness.com/energy/ig'
    );
  });
});

// ---------------------------------------------------------------------
// The funnel roll-up
// ---------------------------------------------------------------------

function row(overrides: Partial<FunnelRow>): FunnelRow {
  return {
    sessionId: 's1',
    sourceCode: 'partner-01',
    sourceRaw: 'partner-01',
    sourceLabel: 'Partner slot 1 (unassigned)',
    sourceChannel: 'partner',
    patternKey: null,
    isTest: false,
    didStart: false,
    didComplete: false,
    didLeaveEmail: false,
    didClickToApp: false,
    didCreateAccount: false,
    firstSeenAt: '2026-08-31T10:00:00.000Z',
    ...overrides,
  };
}

describe('rolling the funnel up by source', () => {
  it('keeps two partners on the same channel apart', () => {
    const rolled = rollUpBySource(
      [
        row({ sessionId: 'a', sourceCode: 'partner-01' }),
        row({ sessionId: 'b', sourceCode: 'partner-02' }),
        row({ sessionId: 'c', sourceCode: 'partner-02', didComplete: true, didStart: true }),
      ],
      new Set()
    );
    expect(rolled.map((r) => r.sourceCode).sort()).toEqual(['partner-01', 'partner-02']);
    const second = rolled.find((r) => r.sourceCode === 'partner-02')!;
    expect(second.reached).toBe(2);
    expect(second.completed).toBe(1);
  });

  it('counts an arrival with no code as direct', () => {
    const rolled = rollUpBySource(
      [row({ sessionId: 'a', sourceCode: null, sourceRaw: null, sourceLabel: 'Direct (no code)' })],
      new Set()
    );
    expect(rolled[0]!.sourceCode).toBe('direct');
  });

  it('gives an unregistered code its own row rather than folding it into direct', () => {
    // A mistyped or invented link must be investigable. Folding it into
    // direct would make direct traffic look like it is growing when what is
    // really happening is that somebody printed the wrong URL.
    const rolled = rollUpBySource(
      [
        row({ sessionId: 'a', sourceCode: null, sourceRaw: null, sourceLabel: 'Direct (no code)' }),
        row({
          sessionId: 'b',
          sourceCode: null,
          sourceRaw: 'dr-okafr',
          sourceLabel: 'Unregistered code',
        }),
      ],
      new Set()
    );
    expect(rolled.map((r) => r.sourceCode).sort()).toEqual(['direct', 'dr-okafr']);
  });

  it('counts reading the result from the events, not from a column', () => {
    const rolled = rollUpBySource(
      [row({ sessionId: 'a', didComplete: true }), row({ sessionId: 'b', didComplete: true })],
      new Set(['a'])
    );
    expect(rolled[0]!.completed).toBe(2);
    expect(rolled[0]!.engagedResult).toBe(1);
  });

  it('counts every step of one visitor who went all the way through', () => {
    const rolled = rollUpBySource(
      [
        row({
          sessionId: 'a',
          didStart: true,
          didComplete: true,
          didLeaveEmail: true,
          didClickToApp: true,
          didCreateAccount: true,
        }),
      ],
      new Set(['a'])
    );
    const totals = totalsOf(rolled);
    expect(totals).toEqual({
      reached: 1,
      started: 1,
      completed: 1,
      engagedResult: 1,
      leads: 1,
      clickedToApp: 1,
      accounts: 1,
    });
  });

  it('never counts a later step without the one before it, for a real journey', () => {
    // The roll-up itself does not enforce ordering (a row is a fact, not a
    // sequence), so this asserts the shape a real arrival produces: reached
    // is always the largest number and accounts the smallest.
    const rolled = rollUpBySource(
      [
        row({ sessionId: 'a', didStart: true, didComplete: true, didLeaveEmail: true }),
        row({ sessionId: 'b', didStart: true }),
        row({ sessionId: 'c' }),
      ],
      new Set(['a'])
    );
    const t = totalsOf(rolled);
    expect(t.reached).toBeGreaterThanOrEqual(t.started);
    expect(t.started).toBeGreaterThanOrEqual(t.completed);
    expect(t.completed).toBeGreaterThanOrEqual(t.leads);
    expect(t.leads).toBeGreaterThanOrEqual(t.accounts);
  });
});

// ---------------------------------------------------------------------
// The rate limit, and the bug that produced this budget
// ---------------------------------------------------------------------

describe('the public entry rate limit', () => {
  it('lets one honest visitor finish, and lets several behind one address finish', async () => {
    // Found live on 2026-08-31 by driving two complete journeys back to
    // back: the second was refused part way through the nine questions,
    // because this route was sharing the chat widget's budget of twenty.
    // One visitor makes about fourteen calls, and a rate limit is per IP,
    // so an office or a household shared a budget that barely covered one
    // person, and the failure was invisible to her.
    const { checkPublicEntryRateLimit, resetRateLimitForTests } = await import(
      '../lib/lead-capture/rateLimit'
    );
    resetRateLimitForTests();

    const CALLS_PER_JOURNEY = 14;
    let allowed = 0;
    for (let i = 0; i < CALLS_PER_JOURNEY * 4; i += 1) {
      if (checkPublicEntryRateLimit('203.0.113.7')) allowed += 1;
    }
    expect(allowed).toBe(CALLS_PER_JOURNEY * 4);
  });

  it('still refuses a script hammering it', async () => {
    const { checkPublicEntryRateLimit, resetRateLimitForTests } = await import(
      '../lib/lead-capture/rateLimit'
    );
    resetRateLimitForTests();
    let refused = 0;
    for (let i = 0; i < 200; i += 1) {
      if (!checkPublicEntryRateLimit('203.0.113.8')) refused += 1;
    }
    expect(refused).toBeGreaterThan(100);
  });

  it('spends its own budget, never the chat widget one', async () => {
    const { checkPublicEntryRateLimit, checkRateLimit, resetRateLimitForTests } = await import(
      '../lib/lead-capture/rateLimit'
    );
    resetRateLimitForTests();
    for (let i = 0; i < 60; i += 1) checkPublicEntryRateLimit('203.0.113.9');
    // The chat widget's own first request from the same address is still
    // allowed: two maps, two budgets.
    expect(checkRateLimit('203.0.113.9')).toBe(true);
  });
});
