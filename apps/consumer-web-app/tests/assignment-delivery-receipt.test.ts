/**
 * A coach assignment's delivery receipt, and the sentence a coach reads
 * off it.
 *
 * THE GAP THIS CLOSES. An open row in assessment_assignments says a coach
 * decided to send something. It said nothing about whether it ever reached
 * her, and the due date it has carried since migration 77 was never read,
 * so "sent this morning", "sent nine days ago and never seen" and "sent
 * nine days ago and a week late" were one sentence: Pending.
 *
 * FIVE THINGS HAVE TO BE TRUE for the new sentence to be worth believing,
 * and this file proves each of them.
 *
 *   1. THE RULES, pure. Which state an assignment is in, whether it is
 *      late, and the sentence each combination produces.
 *   2. THE FIVE ARE NEVER CONFUSED. Completed, cancelled, unseen, open and
 *      overdue, asserted against each other as a matrix rather than one at
 *      a time, because the failure worth catching is two of them reading
 *      the same.
 *   3. ONCE PER ASSIGNMENT, over a fake Postgres that actually enforces
 *      the unique constraint. Two showings are one row with the FIRST
 *      timestamp, never two rows and never a moved timestamp.
 *   4. WHO MAY WRITE ONE, through the real action: not for another
 *      member's assignment, not for one that is finished or cancelled, and
 *      never anything the coach side runs.
 *   5. NO RECEIPT IS EVER A COMPLETION, AN ATTEMPT OR AN ANALYTICS FIGURE.
 *
 * Timezone-safe throughout: every day name asserted here is asserted
 * against a member zone that is NOT the zone the instant is stored in, so
 * a helper that quietly formatted in UTC would fail rather than pass by
 * luck.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSIGNMENT_RECEIPTS_FIRST_INSTANT,
  assignmentDueDate,
  assignmentStatusLine,
  dueAtForLocalDate,
  dueAtInDays,
  resolveAssignmentDeliveryStatus,
  resolveAssignmentDueState,
  resolveAssignmentProgress,
} from '@/lib/assignments/status';

const NY = 'America/New_York';
const AUCKLAND = 'Pacific/Auckland';

/** Made after receipts existed, so an absent one is a real fact about it. */
const SENT = '2026-09-10T13:00:00.000Z';
/** Made before, so an absent receipt proves nothing. */
const SENT_PRE_BUILD = '2026-08-20T13:00:00.000Z';

const TODAY = '2026-09-12';

// ---------------------------------------------------------------------
// 1. The rules
// ---------------------------------------------------------------------

describe('the six delivery states, decided from real rows only', () => {
  const base = { createdAt: SENT, deliveredAt: null } as const;

  it('a failed read knows nothing, and says so rather than guessing either way', () => {
    const status = resolveAssignmentDeliveryStatus({
      ...base,
      status: 'pending',
      readable: false,
    });
    expect(status.kind).toBe('unreadable');
  });

  it('a cancelled assignment is cancelled, even when a receipt exists', () => {
    const status = resolveAssignmentDeliveryStatus({
      ...base,
      status: 'cancelled',
      cancelledAt: '2026-09-11T09:00:00.000Z',
      deliveredAt: '2026-09-10T18:00:00.000Z',
    });
    expect(status).toEqual({ kind: 'cancelled', at: '2026-09-11T09:00:00.000Z' });
  });

  it('a completion outranks everything below it, receipt or no receipt', () => {
    const status = resolveAssignmentDeliveryStatus({
      ...base,
      status: 'completed',
      completedAt: '2026-09-11T15:00:00.000Z',
    });
    expect(status).toEqual({ kind: 'completed', at: '2026-09-11T15:00:00.000Z' });
  });

  it('a receipt on an open assignment is delivered', () => {
    const status = resolveAssignmentDeliveryStatus({
      ...base,
      status: 'pending',
      deliveredAt: '2026-09-10T18:00:00.000Z',
    });
    expect(status).toEqual({ kind: 'delivered', at: '2026-09-10T18:00:00.000Z' });
  });

  it('no receipt, on an assignment made after this system existed, is a real non-delivery', () => {
    expect(resolveAssignmentDeliveryStatus({ ...base, status: 'pending' }).kind).toBe(
      'not_delivered'
    );
  });

  it('no receipt, on an assignment made before it, is NO RECORD and never a non-delivery', () => {
    expect(
      resolveAssignmentDeliveryStatus({ ...base, createdAt: SENT_PRE_BUILD, status: 'pending' })
        .kind
    ).toBe('no_record');
    expect(Date.parse(SENT_PRE_BUILD)).toBeLessThan(Date.parse(ASSIGNMENT_RECEIPTS_FIRST_INSTANT));
  });

  it('a receipt IS believed on a pre-build assignment, because a row could only come from a real display', () => {
    expect(
      resolveAssignmentDeliveryStatus({
        ...base,
        createdAt: SENT_PRE_BUILD,
        status: 'pending',
        deliveredAt: '2026-08-21T10:00:00.000Z',
      }).kind
    ).toBe('delivered');
  });

  it('an unparseable created_at claims less, never more', () => {
    expect(
      resolveAssignmentDeliveryStatus({ ...base, createdAt: 'not a date', status: 'pending' }).kind
    ).toBe('no_record');
  });
});

describe('overdue, derived at read time and never stored', () => {
  it('a due day behind her own today is late, and says by how many days', () => {
    const due = resolveAssignmentDueState({
      status: 'pending',
      dueAt: '2026-09-09T00:00:00.000Z',
      memberToday: TODAY,
    });
    expect(due).toEqual({
      dueDate: '2026-09-09',
      isOverdue: true,
      daysOverdue: 3,
      daysUntilDue: null,
    });
  });

  it('due TODAY is not late: she has the whole of the day her coach named', () => {
    const due = resolveAssignmentDueState({
      status: 'pending',
      dueAt: '2026-09-12T00:00:00.000Z',
      memberToday: TODAY,
    });
    expect(due.isOverdue).toBe(false);
    expect(due.daysUntilDue).toBe(0);
  });

  it('a due day ahead of her is not late, and counts down', () => {
    const due = resolveAssignmentDueState({
      status: 'pending',
      dueAt: '2026-09-19T00:00:00.000Z',
      memberToday: TODAY,
    });
    expect(due.isOverdue).toBe(false);
    expect(due.daysUntilDue).toBe(7);
  });

  it('no due date can never be late', () => {
    expect(
      resolveAssignmentDueState({ status: 'pending', dueAt: null, memberToday: TODAY })
    ).toEqual({ dueDate: null, isOverdue: false, daysOverdue: null, daysUntilDue: null });
  });

  it('a stored due_at that will not parse is treated as no due date, never as late', () => {
    const due = resolveAssignmentDueState({
      status: 'pending',
      dueAt: 'whenever',
      memberToday: TODAY,
    });
    expect(due.dueDate).toBeNull();
    expect(due.isOverdue).toBe(false);
  });

  it('A COMPLETED ASSIGNMENT IS NEVER LATE, however long ago its due day was', () => {
    const due = resolveAssignmentDueState({
      status: 'completed',
      dueAt: '2026-08-01T00:00:00.000Z',
      memberToday: TODAY,
    });
    expect(due.isOverdue).toBe(false);
    expect(due.daysOverdue).toBeNull();
    // The date is still reported, because a coach may want to see it.
    expect(due.dueDate).toBe('2026-08-01');
  });

  it('A CANCELLED ASSIGNMENT IS NEVER LATE, for the same reason', () => {
    const due = resolveAssignmentDueState({
      status: 'cancelled',
      dueAt: '2026-08-01T00:00:00.000Z',
      memberToday: TODAY,
    });
    expect(due.isOverdue).toBe(false);
    expect(due.daysOverdue).toBeNull();
  });

  it('the due day is the calendar day the coach picked, in every reader zone', () => {
    // Stored as midnight UTC, which is 8pm the previous evening in New
    // York. Reading it in a reader's own zone would name the day before.
    expect(assignmentDueDate('2026-09-12T00:00:00.000Z')).toBe('2026-09-12');
    expect(assignmentDueDate('2026-09-12')).toBe('2026-09-12');
    expect(assignmentDueDate(null)).toBeNull();
  });

  it('what is written and what is read back are the same calendar day', () => {
    expect(assignmentDueDate(dueAtForLocalDate('2026-09-12'))).toBe('2026-09-12');
    expect(assignmentDueDate(dueAtInDays('2026-09-05', 7))).toBe('2026-09-12');
  });

  it('HER day boundary decides, not the server’s', () => {
    // The same assignment, the same stored due date, two members whose
    // calendars are a day apart. The one who is already on the 13th is
    // late; the one still on the 12th is not.
    const dueAt = '2026-09-12T00:00:00.000Z';
    expect(
      resolveAssignmentDueState({ status: 'pending', dueAt, memberToday: '2026-09-13' }).isOverdue
    ).toBe(true);
    expect(
      resolveAssignmentDueState({ status: 'pending', dueAt, memberToday: '2026-09-12' }).isOverdue
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 2. The five are never confused
// ---------------------------------------------------------------------

function lineFor(
  input: Parameters<typeof resolveAssignmentProgress>[0],
  timeZone = NY
): string {
  return assignmentStatusLine(resolveAssignmentProgress(input), { timeZone });
}

describe('completed, cancelled, unseen, open and overdue are five different sentences', () => {
  const shared = { createdAt: SENT, memberToday: TODAY } as const;

  const completed = {
    ...shared,
    status: 'completed' as const,
    dueAt: '2026-09-09T00:00:00.000Z',
    completedAt: '2026-09-11T15:00:00.000Z',
    deliveredAt: '2026-09-10T18:00:00.000Z',
  };
  const cancelled = {
    ...shared,
    status: 'cancelled' as const,
    dueAt: '2026-09-09T00:00:00.000Z',
    cancelledAt: '2026-09-11T15:00:00.000Z',
    deliveredAt: null,
  };
  const unseen = {
    ...shared,
    status: 'pending' as const,
    dueAt: '2026-09-19T00:00:00.000Z',
    deliveredAt: null,
  };
  const open = {
    ...shared,
    status: 'pending' as const,
    dueAt: '2026-09-19T00:00:00.000Z',
    deliveredAt: '2026-09-10T18:00:00.000Z',
  };
  const overdue = {
    ...shared,
    status: 'pending' as const,
    dueAt: '2026-09-09T00:00:00.000Z',
    deliveredAt: '2026-09-10T18:00:00.000Z',
  };

  const all = { completed, cancelled, unseen, open, overdue };

  it('all five produce five different sentences', () => {
    const lines = Object.values(all).map((input) => lineFor(input));
    expect(new Set(lines).size).toBe(5);
  });

  it('only the overdue one is flagged overdue', () => {
    const flagged = Object.entries(all)
      .filter(([, input]) => resolveAssignmentProgress(input).due.isOverdue)
      .map(([name]) => name);
    expect(flagged).toEqual(['overdue']);
  });

  it('only the two terminal ones report a terminal state', () => {
    const terminal = Object.entries(all)
      .filter(([, input]) =>
        ['completed', 'cancelled'].includes(resolveAssignmentProgress(input).delivery.kind)
      )
      .map(([name]) => name);
    expect(terminal.sort()).toEqual(['cancelled', 'completed']);
  });

  it('only the unseen one says it has not been seen', () => {
    const notSeen = Object.entries(all)
      .filter(([, input]) => lineFor(input).includes('Not seen yet'))
      .map(([name]) => name);
    expect(notSeen).toEqual(['unseen']);
  });

  it('each sentence says the one thing it is about, and nothing it cannot support', () => {
    expect(lineFor(completed)).toBe('Completed Sep 11.');
    expect(lineFor(cancelled)).toBe('Cancelled Sep 11.');
    expect(lineFor(unseen)).toBe(
      'Sent Sep 10. Not seen yet, they have not opened a screen it appears on. Due Sep 19.'
    );
    expect(lineFor(open)).toBe('Sent Sep 10. Seen Sep 10, not completed. Due Sep 19.');
    expect(lineFor(overdue)).toBe(
      'Sent Sep 10. Seen Sep 10, not completed. Overdue since Sep 9 (3 days).'
    );
  });

  it('a terminal sentence never carries a deadline, however late its due day was', () => {
    expect(lineFor(completed)).not.toContain('Overdue');
    expect(lineFor(completed)).not.toContain('Due');
    expect(lineFor(cancelled)).not.toContain('Overdue');
    expect(lineFor(cancelled)).not.toContain('Due');
  });

  it('an undated assignment is never given a deadline it does not have', () => {
    const line = lineFor({ ...unseen, dueAt: null });
    expect(line).not.toContain('Due');
    expect(line).not.toContain('Overdue');
  });

  it('one day late says day, not days', () => {
    const line = lineFor({ ...overdue, dueAt: '2026-09-11T00:00:00.000Z' });
    expect(line).toContain('Overdue since Sep 11 (1 day).');
  });

  it('due today says so plainly, and is not a deadline that has passed', () => {
    const line = lineFor({ ...open, dueAt: '2026-09-12T00:00:00.000Z' });
    expect(line).toContain('Due today (Sep 12).');
    expect(line).not.toContain('Overdue');
  });

  it('an unreadable receipt says only that, and claims nothing about lateness', () => {
    const line = lineFor({ ...overdue, readable: false });
    expect(line).toBe('The delivery record for this one could not be read.');
    expect(line).not.toContain('Overdue');
  });

  it('the day names are read in the MEMBER’s zone, not the reader’s', () => {
    // 2026-09-10T13:00:00Z is Sep 10 in New York and Sep 11 in Auckland.
    expect(lineFor(unseen, NY)).toContain('Sent Sep 10.');
    expect(lineFor(unseen, AUCKLAND)).toContain('Sent Sep 11.');
  });

  it('no em dash reaches a coach', () => {
    for (const input of Object.values(all)) {
      expect(lineFor(input)).not.toContain('—');
    }
  });
});

// ---------------------------------------------------------------------
// 3 and 4. The claim, and who may write one
// ---------------------------------------------------------------------

const MEMBER = 'member-1';

type Receipt = {
  member_id: string;
  assignment_id: string;
  delivered_at: string;
  presentation: string;
};

type World = {
  signedIn: boolean;
  /** The assignment row her own RLS-scoped read would return, or null when it is not hers. */
  assignment: { id: string; status: string } | null;
  assignmentReadFails: boolean;
  receipts: Receipt[];
  inserts: string[];
};

const world: World = {
  signedIn: true,
  assignment: { id: 'assignment-1', status: 'pending' },
  assignmentReadFails: false,
  receipts: [],
  inserts: [],
};

function resetWorld() {
  world.signedIn = true;
  world.assignment = { id: 'assignment-1', status: 'pending' };
  world.assignmentReadFails = false;
  world.receipts = [];
  world.inserts = [];
}

/**
 * A fake Postgres that enforces the one constraint this feature depends
 * on: unique (assignment_id) on the receipts table. An insert that would
 * break it returns the same shape a real duplicate does, zero rows and an
 * error, so claimAssignmentDelivery's read-back path is genuinely
 * exercised rather than assumed.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      let inserted: Receipt | null = null;
      let insertFailed = false;

      builder.select = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.in = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      };

      builder.insert = (row: Record<string, unknown>) => {
        world.inserts.push(table);
        const candidate = row as unknown as Receipt;
        const clash = world.receipts.some((r) => r.assignment_id === candidate.assignment_id);
        if (clash) insertFailed = true;
        else {
          world.receipts.push(candidate);
          inserted = candidate;
        }
        return builder;
      };

      builder.maybeSingle = async () => {
        if (inserted) return { data: inserted, error: null };
        if (insertFailed) return { data: null, error: { message: 'duplicate key value' } };

        if (table === 'assessment_assignments') {
          if (world.assignmentReadFails) return { data: null, error: { message: 'boom' } };
          // Her own RLS-scoped read: an assignment that is not hers simply
          // is not there.
          const hers = world.assignment && world.assignment.id === filters.id ? world.assignment : null;
          return { data: hers, error: null };
        }
        if (table === 'member_assignment_deliveries') {
          const found =
            world.receipts.find(
              (r) =>
                r.member_id === filters.member_id && r.assignment_id === filters.assignment_id
            ) ?? null;
          return { data: found, error: null };
        }
        return { data: null, error: null };
      };

      return builder;
    },
  }),
}));

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => (world.signedIn ? { id: MEMBER } : null),
}));

vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => NY,
  FALLBACK_TIMEZONE: NY,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { trackAssignmentDeliveredAction } = await import('@/app/actions/assessmentAssignments');

beforeEach(resetWorld);

/** The one row, or a failure that says so rather than a confusing undefined further down. */
function onlyReceipt(): Receipt {
  const row = world.receipts[0];
  if (!row) throw new Error('expected exactly one receipt, found none');
  return row;
}

describe('the receipt is written once, on a real display', () => {
  it('the first display writes exactly one row, against her own assignment', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.receipts).toHaveLength(1);
    expect(onlyReceipt().assignment_id).toBe('assignment-1');
    expect(onlyReceipt().member_id).toBe(MEMBER);
    expect(onlyReceipt().presentation).toBe('popup');
  });

  it('a second display writes nothing, and never moves the timestamp', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    const first = onlyReceipt().delivered_at;

    // Home renders the pop-up and the persistent card in one pass.
    await trackAssignmentDeliveredAction('assignment-1', 'home_card');
    // She reopens the app the next day and sees the card again.
    await trackAssignmentDeliveredAction('assignment-1', 'home_card');

    expect(world.receipts).toHaveLength(1);
    expect(onlyReceipt().delivered_at).toBe(first);
    expect(onlyReceipt().presentation).toBe('popup');
  });

  it('the persistent Home card is a real delivery too, when it gets there first', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'home_card');
    expect(onlyReceipt().presentation).toBe('home_card');
  });

  it('it writes one row in one table, and creates no completion and no attempt', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.inserts).toEqual(['member_assignment_deliveries']);
    expect(world.inserts).not.toContain('assessment_assignments');
    expect(world.inserts).not.toContain('assessment_attempts');
  });

  it('a re-assignment is a new assignment, so it gets its own receipt', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    world.assignment = { id: 'assignment-2', status: 'pending' };
    await trackAssignmentDeliveredAction('assignment-2', 'popup');
    expect(world.receipts.map((r) => r.assignment_id)).toEqual(['assignment-1', 'assignment-2']);
  });
});

describe('the reasons it writes nothing, each of them silent', () => {
  it('nobody signed in', async () => {
    world.signedIn = false;
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.inserts).toHaveLength(0);
  });

  it('an assignment that is not hers is simply not there, so nothing is written', async () => {
    await trackAssignmentDeliveredAction('somebody-elses-assignment', 'popup');
    expect(world.inserts).toHaveLength(0);
  });

  it('a COMPLETED assignment is not a delivery', async () => {
    world.assignment = { id: 'assignment-1', status: 'completed' };
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.inserts).toHaveLength(0);
  });

  it('a CANCELLED assignment is not a delivery', async () => {
    world.assignment = { id: 'assignment-1', status: 'cancelled' };
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.inserts).toHaveLength(0);
  });

  it('a failed assignment read writes nothing rather than guessing', async () => {
    world.assignmentReadFails = true;
    await trackAssignmentDeliveredAction('assignment-1', 'popup');
    expect(world.inserts).toHaveLength(0);
  });

  it('a presentation outside the two the column allows is refused before any read', async () => {
    await trackAssignmentDeliveredAction('assignment-1', 'email');
    await trackAssignmentDeliveredAction('assignment-1', '');
    expect(world.inserts).toHaveLength(0);
  });

  it('an empty or non-string assignment id is refused', async () => {
    await trackAssignmentDeliveredAction('', 'popup');
    await trackAssignmentDeliveredAction(null, 'popup');
    await trackAssignmentDeliveredAction(42, 'popup');
    expect(world.inserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 5. The structural guards
// ---------------------------------------------------------------------

const APP_ROOT = join(__dirname, '..');

/**
 * Strips comments, so a header EXPLAINING the receipt is never mistaken
 * for a file that writes one. Every guard below reads code, not prose.
 */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('nothing writes a receipt from a render, and nothing coach-side writes one at all', () => {
  it('the only write is the tracked action, reached only from the beacon route', () => {
    const writers = walk(join(APP_ROOT, 'app'))
      .concat(walk(join(APP_ROOT, 'components')), walk(join(APP_ROOT, 'lib')))
      .filter((file) => codeOf(readFileSync(file, 'utf8')).includes('claimAssignmentDelivery'));

    expect(writers.map((f) => f.replace(`${APP_ROOT}/`, '')).sort()).toEqual([
      'app/actions/assessmentAssignments.ts',
      'lib/assignments/data.ts',
    ]);
  });

  it('no code under app/coach touches the receipt table or the claim', () => {
    for (const file of walk(join(APP_ROOT, 'app/coach'))) {
      const code = codeOf(readFileSync(file, 'utf8'));
      expect(code, file).not.toContain('claimAssignmentDelivery');
      expect(code, file).not.toContain('member_assignment_deliveries');
    }
  });

  it('the tracker fires from a mounted effect, never from a render', () => {
    const code = codeOf(
      readFileSync(join(APP_ROOT, 'components/assignments/TrackAssignmentDelivered.tsx'), 'utf8')
    );
    expect(code).toContain("'use client'");
    expect(code).toContain('useEffect');
    expect(code).toContain('sendBeacon');
    // A Server Action call from an invisible tracker re-renders the whole
    // route, which is the thing the beacon exists to avoid.
    expect(code).not.toContain('trackAssignmentDeliveredAction');
  });

  it('every surface that draws an open assignment mounts the tracker', () => {
    const surfaces = [
      'components/dashboard/AssignedQuestionnairePriorityCard.tsx',
      'components/stress-load/StressLoadEntry.tsx',
      'components/dashboard/RootMessagePopupClient.tsx',
    ];
    for (const surface of surfaces) {
      expect(readFileSync(join(APP_ROOT, surface), 'utf8'), surface).toContain(
        'TrackAssignmentDelivered'
      );
    }
  });

  it('no analytics figure counts a receipt', () => {
    const analyticsFiles = walk(join(APP_ROOT, 'lib/analytics')).concat(
      walk(join(APP_ROOT, 'lib/analytics-service'))
    );
    for (const file of analyticsFiles) {
      expect(codeOf(readFileSync(file, 'utf8')), file).not.toContain(
        'member_assignment_deliveries'
      );
    }
  });

  it('nothing added here writes a completion: migration 144’s trigger is still the only one', () => {
    const code = codeOf(readFileSync(join(APP_ROOT, 'lib/assignments/data.ts'), 'utf8')).concat(
      codeOf(readFileSync(join(APP_ROOT, 'lib/assignments/status.ts'), 'utf8'))
    );
    expect(code).not.toContain('assessment_assignments');
    expect(code).not.toContain('completed_attempt_id');
  });
});
