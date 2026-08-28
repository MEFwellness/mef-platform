/**
 * B3 — the coach and administrator screens render one date, not two.
 *
 * A React app renders every page twice: once on Vercel, which runs in UTC,
 * and once in the reader's own browser, which does not. Any date formatted
 * without an explicit zone (or locale) is therefore two different strings,
 * and React reports the disagreement as a hydration error. Measured live on
 * 2026-08-28 before this fix, `/admin/access` threw React #425 five times,
 * #418 three times and #423 once on a single load.
 *
 * These tests are the two halves of that:
 *
 *   1. THE CONTROL. The bare `toLocaleDateString(undefined, …)` this screen
 *      used to call really does produce different text either side of
 *      midnight. If this test ever passes by returning one string, the
 *      harness below has stopped being able to see the bug and the whole
 *      file is worthless.
 *   2. THE REAL RENDER. The actual admin panel, rendered to HTML with
 *      `renderToStaticMarkup` under each of those zones, is byte-identical.
 *      Not "the helper is pure" — the screen.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDisplayDate } from '@/lib/time/displayDate';

vi.mock('@/app/actions/memberAccess', () => ({
  expireMemberAccessAction: async () => ({ ok: true }),
  setMemberAccessAction: async () => ({ ok: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { MemberAccessPanel } = await import('@/app/admin/access/MemberAccessPanel');

/**
 * Zones deliberately chosen to sit either side of UTC midnight for the
 * fixture instants below: two behind it, two ahead of it, and UTC itself.
 */
const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati'];

/** Stored instants that fall on different calendar days depending on where you read them. */
const NEAR_MIDNIGHT = [
  '2026-08-28T00:15:00.000Z',
  '2026-08-28T02:30:00.000Z',
  '2026-08-27T23:45:00.000Z',
  '2026-01-01T00:00:00.000Z',
];

const ORIGINAL_TZ = process.env.TZ;
function inZone<T>(zone: string, work: () => T): T {
  process.env.TZ = zone;
  try {
    return work();
  } finally {
    process.env.TZ = ORIGINAL_TZ;
  }
}
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const ROW = {
  memberId: '11111111-1111-4111-8111-111111111111',
  email: 'real.member@example.com',
  displayName: 'Real Member',
  isTest: false,
  accountCreatedAt: '2026-06-01T12:00:00.000Z',
  tier: 'trial' as const,
  source: 'trial',
  status: 'active',
  fullAccess: false,
  trialStartedAt: '2026-08-28T00:15:00.000Z',
  trialEndsAt: '2026-08-28T02:30:00.000Z',
  assignedAt: '2026-08-27T23:45:00.000Z',
  note: null,
  accessLabel: 'Trial',
  allowed: true,
  trialDaysLeft: 3,
};

describe('B3 control — the harness can still see a locale-dependent date', () => {
  it('the formatter this screen used to call produces different text in different zones', () => {
    const rendered = ZONES.map((zone) =>
      inZone(zone, () =>
        new Date('2026-08-28T02:30:00.000Z').toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      )
    );
    expect(new Set(rendered).size).toBeGreaterThan(1);
  });

  it('...and the same instant read in Los Angeles really is the previous day', () => {
    const utc = inZone('UTC', () =>
      new Date('2026-08-28T02:30:00.000Z').toLocaleDateString(undefined, { day: 'numeric' })
    );
    const la = inZone('America/Los_Angeles', () =>
      new Date('2026-08-28T02:30:00.000Z').toLocaleDateString(undefined, { day: 'numeric' })
    );
    expect(utc).toBe('28');
    expect(la).toBe('27');
  });
});

describe('B3 — formatDisplayDate is one answer everywhere', () => {
  for (const iso of NEAR_MIDNIGHT) {
    it(`${iso} renders identically in every zone`, () => {
      const rendered = ZONES.map((zone) =>
        inZone(zone, () =>
          formatDisplayDate(iso, { year: 'numeric', month: 'short', day: 'numeric' })
        )
      );
      expect(new Set(rendered).size).toBe(1);
      expect(rendered[0]).not.toContain('Invalid');
    });
  }

  it('a missing or unparseable value never invents a date', () => {
    expect(formatDisplayDate(null, { day: 'numeric' })).toBe('date not available');
    expect(formatDisplayDate('not a date', { day: 'numeric' })).toBe('date not available');
  });
});

describe('B3 — the administrator access panel renders one HTML, whatever zone reads it', () => {
  let renders: string[] = [];

  beforeEach(() => {
    renders = ZONES.map((zone) =>
      inZone(zone, () => renderToStaticMarkup(<MemberAccessPanel rows={[ROW]} includeTest={false} />))
    );
  });

  it('is byte-identical across every zone either side of midnight', () => {
    expect(new Set(renders).size).toBe(1);
  });

  it('really did render the three dates it is being tested on (not an empty page)', () => {
    const html = renders[0]!;
    expect(html).toContain('Trial started');
    expect(html).toContain('Trial ends');
    expect(html).toContain('Last assigned');
    // Every stored instant here belongs to 27 or 28 August 2026; pinned to
    // UTC they read as their UTC day, and one of them is the 27th, so a
    // render that silently dropped the dates could not pass this.
    expect(html).toContain('Aug 28, 2026');
    expect(html).toContain('Aug 27, 2026');
  });

  it('says "not set" for a member with no trial rather than a wrong date', () => {
    const html = inZone('Asia/Tokyo', () =>
      renderToStaticMarkup(
        <MemberAccessPanel
          rows={[{ ...ROW, trialStartedAt: null, trialEndsAt: null, assignedAt: null }]}
          includeTest={false}
        />
      )
    );
    expect(html).toContain('not set');
    expect(html).not.toContain('Invalid Date');
  });
});
