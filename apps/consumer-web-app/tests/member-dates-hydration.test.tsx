/**
 * Part 2 of build 5 — the member's screens render one date, not two, and
 * it is HER date.
 *
 * The coach half of this defect was B3 (tests/coach-dates-hydration.test.tsx).
 * The member half is the same mistake with a second consequence. A date
 * formatted with no explicit zone is two different strings, one per render
 * pass, which React reports as a hydration error. A date formatted in the
 * SERVER's zone is one string and still the wrong day: Vercel runs in UTC,
 * so from 8pm Eastern onward every instant is already tomorrow.
 *
 * So each screen below is checked twice over:
 *
 *   1. THE CONTROL, first. The formatter each component used to call really
 *      does produce different text either side of midnight. If the control
 *      ever passes by returning one string, this harness has stopped being
 *      able to see the bug and the rest of the file is worthless.
 *   2. THE REAL RENDER. The actual component, rendered to HTML with
 *      `renderToStaticMarkup` under five zones either side of midnight, is
 *      byte-identical, AND says the day the member's own timezone says.
 *
 * Nothing here mocks a date helper. The components are handed the same
 * timezone the server would hand them and are rendered for real.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatInTimeZone, formatDisplayDate } from '@/lib/time/displayDate';
import {
  instantToZonedInputValue,
  zonedInputValueToInstant,
  localDateStringFor,
} from '@/lib/time/localDate';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/app/actions/notifications', () => ({
  markMyNotificationRead: async () => ({}),
}));
vi.mock('@/app/actions/food-products', () => ({
  editFoodLogEntryAction: async () => ({}),
  removeFoodLogEntryAction: async () => ({}),
  duplicateFoodLogEntryAction: async () => ({}),
}));
vi.mock('@/app/actions/food-search', () => ({
  saveMealFromProductAction: async () => ({}),
}));
vi.mock('@/app/actions/wearables', () => ({
  connectWearableProvider: async () => ({}),
  disconnectWearableProviderAction: async () => ({}),
  syncWearableProviderAction: async () => ({}),
}));

const { NotificationsList } = await import('@/app/notifications/NotificationsList');
const { CoachMessages } = await import('@/app/today/CoachMessages');
const { ProteinLedgerEntries } = await import('@/components/protein-ledger/ProteinLedgerEntries');
const { FoodLogList } = await import('@/components/food-products/FoodLogList');
const { WearableConnectionCard } = await import('@/app/connections/WearableConnectionCard');
const { MemberProgramsList } = await import(
  '@/components/coach-program-builder/MemberProgramsList'
);

/** Two zones behind UTC, two ahead of it, and UTC itself. */
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

/** Renders `node` once per zone and returns the set of distinct HTML strings. */
function rendersAcrossZones(node: () => JSX.Element): Set<string> {
  return new Set(ZONES.map((zone) => inZone(zone, () => renderToStaticMarkup(node()))));
}

/** The member this whole file is about. Eastern, like the standing test member. */
const HER_ZONE = 'America/New_York';

// ---------------------------------------------------------------------------
// The control
// ---------------------------------------------------------------------------

describe('the control — the harness can still see an unpinned date', () => {
  it('a bare toLocaleDateString really is two different strings across zones', () => {
    const rendered = ZONES.map((zone) =>
      inZone(zone, () =>
        new Date('2026-08-28T02:30:00.000Z').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      )
    );
    expect(new Set(rendered).size).toBeGreaterThan(1);
  });

  it('a bare toLocaleTimeString really is two different clocks across zones', () => {
    const utc = inZone('UTC', () =>
      new Date('2026-08-28T02:30:00.000Z').toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
    const ny = inZone('America/New_York', () =>
      new Date('2026-08-28T02:30:00.000Z').toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
    expect(utc).not.toBe(ny);
    expect(utc).toBe('2:30 AM');
    expect(ny).toBe('10:30 PM');
  });
});

// ---------------------------------------------------------------------------
// The shared helpers
// ---------------------------------------------------------------------------

describe('formatInTimeZone is one answer everywhere, and it is her answer', () => {
  for (const iso of NEAR_MIDNIGHT) {
    it(`${iso} renders identically in every zone`, () => {
      const rendered = ZONES.map((zone) =>
        inZone(zone, () =>
          formatInTimeZone(iso, { month: 'short', day: 'numeric' }, HER_ZONE)
        )
      );
      expect(new Set(rendered).size).toBe(1);
      expect(rendered[0]).not.toContain('Invalid');
    });
  }

  it('says the day the member actually lived, not the server day', () => {
    // 02:30 UTC on the 28th is 10:30pm on the 27th in New York.
    expect(
      formatInTimeZone('2026-08-28T02:30:00.000Z', { month: 'short', day: 'numeric' }, HER_ZONE)
    ).toBe('Aug 27');
    expect(
      formatDisplayDate('2026-08-28T02:30:00.000Z', { month: 'short', day: 'numeric' })
    ).toBe('Aug 28');
  });

  it('a bare calendar date keeps its own day under the UTC pin', () => {
    // `start_date` and `scheduled_date` are date columns, not instants.
    expect(formatDisplayDate('2026-08-28', { month: 'short', day: 'numeric' })).toBe('Aug 28');
    const everywhere = ZONES.map((zone) =>
      inZone(zone, () => formatDisplayDate('2026-08-28', { month: 'short', day: 'numeric' }))
    );
    expect(new Set(everywhere).size).toBe(1);
  });

  it('never invents a date', () => {
    expect(formatInTimeZone(null, { day: 'numeric' }, HER_ZONE)).toBe('date not available');
    expect(formatInTimeZone('not a date', { day: 'numeric' }, HER_ZONE)).toBe(
      'date not available'
    );
  });
});

describe('a datetime-local field round trips through her zone, not the runtime', () => {
  it('an instant becomes her wall clock', () => {
    const everywhere = ZONES.map((zone) =>
      inZone(zone, () => instantToZonedInputValue('2026-08-28T02:30:00.000Z', HER_ZONE))
    );
    expect(new Set(everywhere).size).toBe(1);
    expect(everywhere[0]).toBe('2026-08-27T22:30');
  });

  it('and her wall clock becomes the same instant again', () => {
    for (const iso of NEAR_MIDNIGHT) {
      const wall = instantToZonedInputValue(iso, HER_ZONE);
      expect(zonedInputValueToInstant(wall, HER_ZONE).toISOString()).toBe(
        // The input carries minutes, so the round trip is exact to the minute.
        iso.replace(/:\d\d\.\d\d\dZ$/, ':00.000Z')
      );
    }
  });

  it('holds across a daylight saving boundary', () => {
    // 2026-11-01, the US fall-back. 05:30 UTC is 01:30 EDT, still -4.
    const wall = instantToZonedInputValue('2026-11-01T05:30:00.000Z', HER_ZONE);
    expect(zonedInputValueToInstant(wall, HER_ZONE).toISOString()).toBe(
      '2026-11-01T05:30:00.000Z'
    );
    // 07:30 UTC is 02:30 EST, now -5.
    const later = instantToZonedInputValue('2026-11-01T07:30:00.000Z', HER_ZONE);
    expect(later).toBe('2026-11-01T02:30');
    expect(zonedInputValueToInstant(later, HER_ZONE).toISOString()).toBe(
      '2026-11-01T07:30:00.000Z'
    );
  });

  it('is not the runtime offset trick it replaced', () => {
    const oldWay = (iso: string) => {
      const d = new Date(iso);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    };
    const spread = ZONES.map((zone) => inZone(zone, () => oldWay('2026-08-28T02:30:00.000Z')));
    expect(new Set(spread).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The six screens
// ---------------------------------------------------------------------------

const NOTIFICATION = {
  id: 'n1',
  user_id: 'm1',
  title: 'A note from your coach',
  body: 'Nice work this week.',
  read_at: null,
  created_at: '2026-08-28T02:30:00.000Z',
  type: 'coach_message',
} as never;

describe('NotificationsList', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => (
        <NotificationsList notifications={[NOTIFICATION]} timeZone={HER_ZONE} />
      )).size
    ).toBe(1);
  });

  it('says the day she got it, in her own zone', () => {
    const html = inZone('Asia/Tokyo', () =>
      renderToStaticMarkup(
        <NotificationsList notifications={[NOTIFICATION]} timeZone={HER_ZONE} />
      )
    );
    expect(html).toContain('Aug 27, 2026');
    expect(html).not.toContain('Aug 28, 2026');
  });
});

describe('CoachMessages', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => (
        <CoachMessages notifications={[NOTIFICATION]} timeZone={HER_ZONE} />
      )).size
    ).toBe(1);
  });

  it('says her day', () => {
    const html = inZone('UTC', () =>
      renderToStaticMarkup(<CoachMessages notifications={[NOTIFICATION]} timeZone={HER_ZONE} />)
    );
    expect(html).toContain('Aug 27');
  });
});

const LEDGER_ENTRY = {
  id: 'e1',
  productName: 'Greek yogurt',
  manualLabel: null,
  servings: 1,
  consumedAt: '2026-08-28T02:30:00.000Z',
  proteinGrams: 18,
  source: 'search' as const,
  estimatedProteinLevel: null,
};

describe('ProteinLedgerEntries', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => (
        <ProteinLedgerEntries entries={[LEDGER_ENTRY]} timeZone={HER_ZONE} />
      )).size
    ).toBe(1);
  });

  it('shows her clock, not UTC', () => {
    const html = inZone('Pacific/Kiritimati', () =>
      renderToStaticMarkup(<ProteinLedgerEntries entries={[LEDGER_ENTRY]} timeZone={HER_ZONE} />)
    );
    expect(html).toContain('10:30 PM');
    expect(html).not.toContain('2:30 AM');
  });
});

const FOOD_ENTRY = {
  id: 'f1',
  member_id: 'm1',
  product_id: null,
  manual_label: 'Chicken and rice',
  meal_category: 'dinner',
  servings: 1,
  consumed_at: '2026-08-28T02:30:00.000Z',
  notes: null,
  member_adjusted: false,
  product: null,
} as never;

describe('FoodLogList', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => <FoodLogList entries={[FOOD_ENTRY]} timeZone={HER_ZONE} />).size
    ).toBe(1);
  });

  it('shows her clock', () => {
    const html = inZone('UTC', () =>
      renderToStaticMarkup(<FoodLogList entries={[FOOD_ENTRY]} timeZone={HER_ZONE} />)
    );
    expect(html).toContain('10:30 PM');
  });
});

const CONNECTION = {
  id: 'c1',
  member_id: 'm1',
  provider: 'oura' as const,
  status: 'connected' as const,
  provider_status: 'active' as const,
  last_synced_at: '2026-08-28T02:30:00.000Z',
} as never;

describe('WearableConnectionCard', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => (
        <WearableConnectionCard provider="oura" connection={CONNECTION} timeZone={HER_ZONE} />
      )).size
    ).toBe(1);
  });

  it('says her day and her clock on "Last synced"', () => {
    const html = inZone('Asia/Tokyo', () =>
      renderToStaticMarkup(
        <WearableConnectionCard provider="oura" connection={CONNECTION} timeZone={HER_ZONE} />
      )
    );
    expect(html).toContain('Last synced Aug 27 at 10:30 PM');
  });
});

// ---------------------------------------------------------------------------
// The programs split
// ---------------------------------------------------------------------------

function workout(id: string, scheduledDate: string, status = 'not_started') {
  return {
    id,
    assignment_id: 'a1',
    member_id: 'm1',
    template_name: 'Hip and Core Foundation: Session A',
    scheduled_date: scheduledDate,
    status,
    estimated_duration_minutes: 30,
    corrective_tags: null,
    program_tags: null,
  } as never;
}

const PROGRAM = {
  groupKey: 'g1',
  name: 'Hip and Core Foundation',
  blurb: 'A 4 week program from your coach.',
  hasExplanation: false,
  status: 'active' as const,
  startDate: '2026-08-24',
  endDate: '2026-09-20',
  currentWeek: 1,
  durationWeeks: 4,
  assignmentIds: ['a1'],
  workouts: [
    workout('w-monday', '2026-08-26'),
    workout('w-today', '2026-08-27'),
    workout('w-tomorrow', '2026-08-28'),
  ],
  totalWorkouts: 3,
  completedWorkouts: 0,
  completionPercent: 0,
  headline: 'Week 1 of 4',
  detail: 'August 24 to September 20',
};

describe('MemberProgramsList splits her sessions on HER day', () => {
  it('is byte-identical across every zone', () => {
    expect(
      rendersAcrossZones(() => (
        <MemberProgramsList programs={[PROGRAM]} workouts={PROGRAM.workouts} today="2026-08-27" />
      )).size
    ).toBe(1);
  });

  it("the 28th is Coming up while her own date is the 27th, whatever UTC thinks", () => {
    const html = inZone('UTC', () =>
      renderToStaticMarkup(
        <MemberProgramsList programs={[PROGRAM]} workouts={PROGRAM.workouts} today="2026-08-27" />
      )
    );
    const comingUp = html.indexOf('Coming up');
    const alreadyDone = html.indexOf('Already done');
    const sessionOnThe28th = html.indexOf('Fri, Aug 28');
    const sessionOnThe26th = html.indexOf('Wed, Aug 26');
    expect(comingUp).toBeGreaterThan(-1);
    expect(alreadyDone).toBeGreaterThan(-1);
    // The 28th sits between "Coming up" and "Already done"; the 27th sits after.
    expect(sessionOnThe28th).toBeGreaterThan(comingUp);
    expect(sessionOnThe28th).toBeLessThan(alreadyDone);
    expect(sessionOnThe26th).toBeGreaterThan(alreadyDone);
  });

  it('reads the prop and nothing else: a far-future today puts every session behind her', () => {
    // If the component ever computes its own date again, this fails
    // whatever day the suite runs on.
    const html = renderToStaticMarkup(
      <MemberProgramsList programs={[PROGRAM]} workouts={PROGRAM.workouts} today="2099-01-01" />
    );
    expect(html).toContain('Already done');
    expect(html).not.toContain('Coming up');
  });

  it('and a far-past today puts every session ahead of her', () => {
    const html = renderToStaticMarkup(
      <MemberProgramsList programs={[PROGRAM]} workouts={PROGRAM.workouts} today="2000-01-01" />
    );
    expect(html).toContain('Coming up');
    expect(html).not.toContain('Already done');
  });

  it('the bug it replaced: at 02:30 UTC on the 28th, her local date is still the 27th', () => {
    // What the component used to compute for itself, while rendering.
    const utcToday = new Date('2026-08-28T02:30:00.000Z').toISOString().slice(0, 10);
    expect(utcToday).toBe('2026-08-28');
    // What the server decides for her now: the same conversion
    // memberTodayLocalDate performs, on the same instant.
    const herToday = inZone('UTC', () =>
      localDateStringFor('2026-08-28T02:30:00.000Z', HER_ZONE)
    );
    expect(herToday).toBe('2026-08-27');
    // Which is the difference between her next session being offered and
    // being filed under "Already done".
    expect(utcToday).not.toBe(herToday);
  });
});
