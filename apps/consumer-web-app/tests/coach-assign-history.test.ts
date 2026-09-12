/**
 * WHAT THE ASSIGN FORM SAYS HAS ALREADY HAPPENED, and the words it says it
 * with.
 *
 * Two things are proved here, and neither of them needs a browser:
 *
 *   THE SENTENCES. Four states (never assigned, open right now, finished
 *     recently, finished a while ago), the day names resolved in the
 *     MEMBER's timezone rather than the reader's, and who sent it named
 *     only when it is honest to name them.
 *   THE COPY. Every key the app asks for is a row migration 229 seeds,
 *     every row it seeds is a key the app asks for, and the fallbacks in
 *     the code are byte for byte the seeded wording. A reworded row and a
 *     stale fallback are two versions of one sentence, and this is what
 *     stops them existing.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildAssignmentHistories,
  buildAssignmentHistory,
  daysSinceCompletion,
  firstNameOf,
  RECENT_COMPLETION_DAYS,
  type AssignmentHistorySource,
} from '../lib/coach-assign/history';
import {
  COACH_ASSIGN_COPY_KEYS,
  DEFAULT_COACH_ASSIGN_COPY,
  coachAssignCopy,
  fillCoachAssignTokens,
} from '../lib/coach-assign/copy';
import { RESEND_DEFAULT_DUE_IN_DAYS } from '../lib/coach-assign/constants';

const MIGRATION = path.resolve(
  __dirname,
  '../../../supabase/migrations/00000000000229_coach_assign_copy.sql'
);

const WBS = 'def-whole-body-signal';
const OTHER = 'def-something-else';
const TIMEZONE = 'America/New_York';
const MEMBER_TODAY = '2026-09-12';
const VIEWER = 'coach-osei';

const BASE = {
  copy: DEFAULT_COACH_ASSIGN_COPY as Record<string, string>,
  timeZone: TIMEZONE,
  memberToday: MEMBER_TODAY,
  clientFirstName: 'Ebony',
  viewerId: VIEWER,
  assignerNames: {} as Record<string, string>,
};

function row(input: Partial<AssignmentHistorySource> & { id: string }): AssignmentHistorySource {
  return {
    assessmentDefinitionId: WBS,
    status: 'completed',
    createdAt: '2026-09-01T15:00:00.000Z',
    assignedBy: VIEWER,
    completedAt: null,
    ...input,
  };
}

function historyFor(assignments: AssignmentHistorySource[], extra: Partial<typeof BASE> = {}) {
  return buildAssignmentHistory({ ...BASE, ...extra, assignments, definitionId: WBS });
}

describe('never assigned', () => {
  it('has no history at all, so the form draws nothing extra', () => {
    expect(historyFor([])).toBeNull();
  });

  it('ignores an assignment for a different instrument entirely', () => {
    expect(
      historyFor([row({ id: 'a', assessmentDefinitionId: OTHER, status: 'pending' })])
    ).toBeNull();
  });

  it('treats a withdrawn assignment as never sent, which is what the row above it already says', () => {
    expect(historyFor([row({ id: 'a', status: 'cancelled' })])).toBeNull();
  });
});

describe('an assignment that is open right now', () => {
  const view = historyFor([
    row({ id: 'open', status: 'pending', createdAt: '2026-09-10T15:00:00.000Z' }),
  ])!;

  it('says so plainly, naming her and the day it was sent', () => {
    expect(view.openNoticeLine).toBe('This is already waiting for Ebony, sent Sep 10.');
  });

  it('is flagged open, which is what makes the confirm button read Resend', () => {
    expect(view.isOpen).toBe(true);
    expect(view.openAssignmentId).toBe('open');
  });

  it('still says when it was last assigned and that it was never finished', () => {
    expect(view.lastAssignedLine).toBe('Last assigned Sep 10, by you.');
    expect(view.lastCompletedLine).toBe('Not completed.');
  });

  it('NAMES THE DAY IN HER TIMEZONE, not the reader s', () => {
    // 03:00 UTC on the 11th is still the evening of the 10th in New York.
    const late = historyFor([
      row({ id: 'open', status: 'pending', createdAt: '2026-09-11T03:00:00.000Z' }),
    ])!;
    expect(late.openNoticeLine).toContain('Sep 10');
  });
});

describe('who sent it', () => {
  it('says "by you" to the coach who sent it, and only to them', () => {
    const mine = historyFor([row({ id: 'a', status: 'pending', assignedBy: VIEWER })])!;
    expect(mine.lastAssignedLine).toContain('by you.');
  });

  it('names another coach when this reader is allowed to see the name', () => {
    const theirs = historyFor([row({ id: 'a', status: 'pending', assignedBy: 'coach-two' })], {
      assignerNames: { 'coach-two': 'Marcus' },
    })!;
    expect(theirs.lastAssignedLine).toBe('Last assigned Sep 1, by Marcus.');
  });

  it('falls back to the stored words rather than inventing a name it could not read', () => {
    const unreadable = historyFor([row({ id: 'a', status: 'pending', assignedBy: 'coach-two' })])!;
    expect(unreadable.lastAssignedLine).toBe('Last assigned Sep 1, by another coach.');
  });
});

describe('last completed', () => {
  it('names the day she finished', () => {
    const view = historyFor([
      row({ id: 'a', status: 'completed', completedAt: '2026-08-20T14:00:00.000Z' }),
    ])!;
    expect(view.lastCompletedLine).toBe('Last completed Aug 20.');
  });

  it('IS THE MOST RECENT COMPLETION SHE HAS, not whatever the newest assignment did', () => {
    // Finished in August, sent a fresh copy this week and still sitting on
    // it. "Not completed" would be true about one row and false about her.
    const view = historyFor([
      row({ id: 'old', status: 'completed', createdAt: '2026-08-01T12:00:00.000Z', completedAt: '2026-08-20T14:00:00.000Z' }),
      row({ id: 'open', status: 'pending', createdAt: '2026-09-10T12:00:00.000Z' }),
    ])!;
    expect(view.lastCompletedLine).toBe('Last completed Aug 20.');
    expect(view.isOpen).toBe(true);
  });

  it('takes the newest of several completions rather than the first it finds', () => {
    const view = historyFor([
      row({ id: 'first', status: 'completed', completedAt: '2026-07-02T14:00:00.000Z' }),
      row({ id: 'second', status: 'completed', completedAt: '2026-08-20T14:00:00.000Z' }),
    ])!;
    expect(view.lastCompletedLine).toBe('Last completed Aug 20.');
  });

  it('says Not completed when she has never finished it', () => {
    const view = historyFor([row({ id: 'a', status: 'pending' })])!;
    expect(view.lastCompletedLine).toBe('Not completed.');
  });
});

describe('the one quiet line about a recent finish', () => {
  function lineFor(completedAt: string) {
    return historyFor([row({ id: 'a', status: 'completed', completedAt })])!.recentCompletionLine;
  }

  it('counts her own calendar days, not hours', () => {
    expect(daysSinceCompletion({ completedAt: '2026-09-09T23:00:00.000Z', timeZone: TIMEZONE, memberToday: MEMBER_TODAY })).toBe(3);
  });

  it('says today, one day and many days in the right words', () => {
    expect(lineFor('2026-09-12T13:00:00.000Z')).toBe('Completed today.');
    expect(lineFor('2026-09-11T13:00:00.000Z')).toBe('Completed 1 day ago.');
    expect(lineFor('2026-09-09T13:00:00.000Z')).toBe('Completed 3 days ago.');
  });

  it('appears on the last day of the window and not the day after it', () => {
    expect(lineFor('2026-08-29T13:00:00.000Z')).toBe('Completed 14 days ago.');
    expect(lineFor('2026-08-28T13:00:00.000Z')).toBeNull();
    expect(RECENT_COMPLETION_DAYS).toBe(14);
  });

  it('IS NOT A BLOCK AND NOT A WARNING: it is the only thing the window changes', () => {
    const recent = historyFor([row({ id: 'a', status: 'completed', completedAt: '2026-09-11T13:00:00.000Z' })])!;
    const older = historyFor([row({ id: 'a', status: 'completed', completedAt: '2026-06-11T13:00:00.000Z' })])!;
    expect(recent.isOpen).toBe(older.isOpen);
    expect(recent.lastAssignedLine).toBe(older.lastAssignedLine);
    expect(older.recentCompletionLine).toBeNull();
  });
});

describe('building every instrument at once', () => {
  it('keys by definition id and leaves out the ones never sent', () => {
    const histories = buildAssignmentHistories({
      ...BASE,
      assignments: [row({ id: 'a', status: 'pending' })],
      definitionIds: [WBS, OTHER],
    });
    expect(Object.keys(histories)).toEqual([WBS]);
  });
});

describe('her first name, for the notice', () => {
  it('takes the first word, keeps a single word whole, and never prints an empty name', () => {
    expect(firstNameOf('Ebony Rivers')).toBe('Ebony');
    expect(firstNameOf('Ebony')).toBe('Ebony');
    expect(firstNameOf('   ')).toBe('them');
    expect(firstNameOf(null)).toBe('them');
  });
});

describe('the copy rows migration 229 seeds', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const seeded = new Map<string, string>();
  for (const match of sql.matchAll(/\('(assign\.[a-z_]+)',\s*'((?:[^']|'')*)'/g)) {
    seeded.set(match[1]!, match[2]!.replace(/''/g, "'"));
  }

  it('seeds a row for every key the app asks for', () => {
    for (const key of COACH_ASSIGN_COPY_KEYS) {
      expect(seeded.has(key), `no row seeded for ${key}`).toBe(true);
    }
  });

  it('asks for every row it seeds, so a stored sentence nothing prints is caught', () => {
    const asked = new Set<string>(COACH_ASSIGN_COPY_KEYS);
    for (const key of seeded.keys()) {
      expect(asked.has(key), `nothing asks for ${key}`).toBe(true);
    }
  });

  it('THE FALLBACK IS THE SEEDED WORDING, byte for byte', () => {
    for (const key of COACH_ASSIGN_COPY_KEYS) {
      expect(DEFAULT_COACH_ASSIGN_COPY[key], key).toBe(seeded.get(key));
    }
  });

  it('NO EM DASH in anything a coach reads', () => {
    for (const value of seeded.values()) {
      expect(value.includes('—'), value).toBe(false);
    }
  });

  it('names the same window the resend path actually uses', () => {
    expect(RESEND_DEFAULT_DUE_IN_DAYS).toBe(7);
    expect(DEFAULT_COACH_ASSIGN_COPY['assign.resend_note']).toContain('seven days from today');
  });
});

describe('reading one line', () => {
  it('falls back to the approved wording when a row is missing or blank', () => {
    expect(coachAssignCopy({}, 'assign.not_completed')).toBe('Not completed.');
    expect(coachAssignCopy({ 'assign.not_completed': '   ' }, 'assign.not_completed')).toBe(
      'Not completed.'
    );
  });

  it('prefers the stored row when there is one, which is what makes an edit take effect', () => {
    expect(
      coachAssignCopy({ 'assign.not_completed': 'Never finished.' }, 'assign.not_completed')
    ).toBe('Never finished.');
  });

  it('LEAVES AN UNKNOWN TOKEN STANDING rather than guessing at it', () => {
    expect(fillCoachAssignTokens('Sent {date} by {who}.', { date: 'Sep 1' })).toBe(
      'Sent Sep 1 by {who}.'
    );
  });
});
