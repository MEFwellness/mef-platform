/**
 * The coach's This Week band, and the one merged flag section under it.
 *
 * FOUR CLAIMS, HELD SEPARATELY, because each of them fails in its own way.
 *
 * 1. IT IS THE RECAP'S WEEK, NOT A SECOND ONE. The band's seven days and
 *    the Weekly Reflection recap's seven days are asserted to be the same
 *    days for the same client on the same date, on every weekday, and the
 *    band's check-in count is asserted equal to the recap's own count over
 *    the same rows. A band that drifted by a day would let a coach and a
 *    member read two different "3 of 7".
 *
 * 2. IT DOES NOT RENDER FOR ANYONE BUT A PROGRAM TIER CLIENT. Null, not an
 *    empty band, because an empty band is a claim that there was nothing
 *    this week.
 *
 * 3. THE RENDER WRITES NOTHING. The action is reached from a page render,
 *    and the fake client it is driven against throws on insert, update,
 *    upsert and delete rather than counting them, so a write is a failed
 *    test and never a number somebody has to notice.
 *
 * 4. ONE FINDING, ONCE. An alert and a client-list reason describing the
 *    same fact produce one line, and the alert is the one kept.
 *
 * Plus the language law the band was built around: the word "missed"
 * appears nowhere in any state of any row, including the states where it
 * would be easiest to reach for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assignmentRow,
  checkinRow,
  experimentRow,
  programRow,
  reflectionRow,
  resetPlanRow,
} from '@/lib/coach-week/rows';
import { thisWeekWindowFor, thisWeekWindowLabel, withinThisWeek } from '@/lib/coach-week/window';
import {
  findingKeyForAlert,
  findingKeyForReason,
  foldAttentionReasons,
} from '@/lib/coach-week/flags';
import type { ThisWeekBand } from '@/lib/coach-week/types';
import { buildReflectionRecap } from '@/lib/weekly-reflection/recap';
import { mostRecentReflectionWeekStart, recapRangeFor } from '@/lib/weekly-reflection/week';
import { NO_CHECKIN_TODAY_REASON, PAIN_INCREASING_REASON } from '@/app/coach/lib';
import { PAIN_STOP_REASON } from '@/lib/programs/feedback/attention';
import { ThisWeekBandView } from '@/app/coach/clients/[id]/ThisWeekBandView';

// ---------------------------------------------------------------------
// 1. The window is the recap's window.
// ---------------------------------------------------------------------

describe('the band counts the same seven days the Weekly Reflection recap does', () => {
  // A whole week of local dates, so the Monday-to-Thursday case (where the
  // reflection is not offered at all and the band must still name the week
  // that just closed) is covered rather than assumed.
  const WEEK = [
    '2026-08-31', // Monday
    '2026-09-01',
    '2026-09-02',
    '2026-09-03', // Thursday
    '2026-09-04', // Friday
    '2026-09-05', // Saturday
    '2026-09-06', // Sunday
  ];

  it('resolves the identical week key and the identical seven days, on every weekday', () => {
    for (const localDate of WEEK) {
      const window = thisWeekWindowFor(localDate);
      const recapWeekStart = mostRecentReflectionWeekStart(localDate);
      const recapRange = recapRangeFor(recapWeekStart);

      expect(window.weekStart).toBe(recapWeekStart);
      expect({ from: window.from, to: window.to }).toEqual(recapRange);
    }
  });

  it('mid-week, reports the week that just ended rather than the one that has not started', () => {
    // Tuesday 2026-09-01. The Friday that just passed is 2026-08-28.
    const window = thisWeekWindowFor('2026-09-01');
    expect(window.weekStart).toBe('2026-08-28');
    expect(window.from).toBe('2026-08-22');
    expect(window.to).toBe('2026-08-28');
  });

  it('counts exactly the days the recap counts, from the same rows', () => {
    const localDate = '2026-09-06';
    const window = thisWeekWindowFor(localDate);

    // Five inside the window, two outside it, and one duplicate day.
    const dates = [
      '2026-08-29',
      '2026-08-30',
      '2026-08-30',
      '2026-09-01',
      '2026-09-03',
      '2026-09-04',
      '2026-08-27', // before the window
      '2026-09-05', // after it
    ];
    const inWindow = dates.filter((date) => withinThisWeek(date, window));

    const recap = buildReflectionRecap({
      weekStart: window.weekStart,
      checkinLocalDates: dates,
      patternStates: [],
    });

    expect(recap.from).toBe(window.from);
    expect(recap.to).toBe(window.to);
    expect(new Set(inWindow).size).toBe(recap.checkinCount);
    expect(checkinRow(recap.checkinCount).statement).toBe('Checked in on 5 of 7 days.');
  });

  it('names its window on the screen, so no count ever appears without its days', () => {
    expect(thisWeekWindowLabel({ from: '2026-08-29', to: '2026-09-04' })).toBe(
      'Week of Aug 29 to Sep 4'
    );
    // A bare YYYY-MM-DD is a calendar day and is read in UTC, so the label
    // is the same in every reader's zone rather than sliding a day back
    // for anyone west of Greenwich.
    expect(thisWeekWindowLabel({ from: '2026-01-01', to: '2026-01-07' })).toBe(
      'Week of Jan 1 to Jan 7'
    );
  });
});

// ---------------------------------------------------------------------
// 2. The rows, and the words they may not use.
// ---------------------------------------------------------------------

describe('the rows say only what the rows support', () => {
  it('never claims a miss for a day with no check-in', () => {
    expect(checkinRow(0).statement).toBe('Checked in on 0 of 7 days.');
    expect(checkinRow(0).statement).not.toMatch(/miss/i);
    // And no per-day grid: the row carries no detail lines at all.
    expect(checkinRow(3).details).toEqual([]);
  });

  it('reads the reflection line the delivery module already wrote, verbatim', () => {
    const line = 'Delivered Friday. Not yet completed.';
    expect(reflectionRow(line).statement).toBe(line);
  });

  it('says nothing opened rather than inventing a state, when there is no line', () => {
    expect(reflectionRow(null).statement).toContain('Nothing opened for her this week');
  });

  it('reports a stopped session as a pain report, never as a skip', () => {
    const row = programRow([{ status: 'stopped' }]);
    const text = row.details.map((d) => d.text).join(' ');
    expect(text).toContain('stopped after she reported pain');
    expect(text).toContain('That is not a skip');
    expect(text).not.toMatch(/miss/i);
  });

  it('keeps partially completed as its own state rather than folding it into completed', () => {
    const row = programRow([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'partially_completed' },
    ]);
    expect(row.statement).toBe('3 sessions scheduled in these 7 days.');
    const texts = row.details.map((d) => d.text);
    expect(texts).toContain('2 completed.');
    expect(texts).toContain('1 partly completed.');
  });

  it('says out loud that a not-started session cannot be told apart from an unopened one', () => {
    const text = programRow([{ status: 'not_started' }]).details[0]!.text;
    expect(text).toContain('no record of whether she opened');
    expect(text).toContain('not a skip');
  });

  it('says nothing was scheduled rather than showing an empty program row', () => {
    const row = programRow([]);
    expect(row.statement).toBe('No sessions were scheduled in these 7 days.');
    expect(row.details).toEqual([]);
  });

  it('reports experiments as running, finished with an outcome, or past their end', () => {
    const row = experimentRow([
      {
        title: 'Lights out by ten',
        status: 'active',
        outcome: null,
        startDate: '2026-09-01',
        durationDays: 14,
      },
      {
        title: 'Walk after lunch',
        status: 'completed',
        outcome: 'partially_worked',
        startDate: '2026-08-10',
        durationDays: 14,
      },
      {
        title: 'No screens in bed',
        status: 'expired_no_reflection',
        outcome: null,
        startDate: '2026-08-01',
        durationDays: 7,
      },
    ]);
    expect(row.statement).toBe(
      '1 running, 1 finished in these 7 days, 1 past its end with no reflection.'
    );
    const texts = row.details.map((d) => d.text);
    expect(texts[0]).toContain('running');
    expect(texts[1]).toContain('it partially worked');
    expect(texts[2]).toContain('past its end date with no reflection written yet');
    expect(texts.join(' ')).not.toMatch(/miss/i);
  });

  it('counts only the Reset Plan\'s three explicit states, and never a missing day', () => {
    const row = resetPlanRow({
      startLocalDate: '2026-08-20',
      logs: [
        { state: 'completed_normal' },
        { state: 'completed_normal' },
        { state: 'completed_difficult' },
        { state: 'not_today' },
        { state: null }, // a row that only ever carried a day-3 answer
      ],
    });
    expect(row.statement).toBe('Logged on 4 days since day one (2026-08-20).');
    expect(row.details[0]!.text).toBe('2 normal, 1 difficult day, 1 not today.');
    expect(row.statement + row.details[0]!.text).not.toMatch(/miss/i);
  });

  it('tells a plan that was never started apart from one that was never built', () => {
    expect(resetPlanRow(null).statement).toBe('She has not started one.');
    expect(resetPlanRow({ startLocalDate: null, logs: [] }).statement).toContain(
      'not activated yet'
    );
  });

  it('carries the assignment ledger\'s own sentence, and marks only a real passed deadline', () => {
    const row = assignmentRow({
      open: [
        {
          id: 'a1',
          name: 'Stress & Load Deep-Dive',
          statusLine: 'Sent Sep 5. Seen Sep 5, not completed. Overdue since Sep 2 (3 days).',
          open: true,
          overdue: true,
        },
        {
          id: 'a2',
          name: 'Core Values Snapshot',
          statusLine: 'Sent Sep 4. Not seen yet, they have not opened a screen it appears on.',
          open: true,
          overdue: false,
        },
      ],
      closedInWindow: [
        {
          id: 'a3',
          name: 'Life Signal Check',
          statusLine: 'Completed Sep 3.',
          open: false,
          overdue: false,
        },
      ],
    });

    expect(row.statement).toContain('2 still open (1 past the day it was due)');
    expect(row.statement).toContain('1 closed in these 7 days');
    // The window is named for the closed ones and explicitly NOT claimed
    // for the open ones, which are open whatever week they were sent in.
    expect(row.statement).toContain('Open ones are counted whatever week they were sent in');
    expect(row.details[0]!.overdue).toBe(true);
    expect(row.details[1]!.overdue).toBe(false);
    // A completed one names its completion day and no deadline at all.
    expect(row.details[2]!.text).toBe('Life Signal Check: Completed Sep 3.');
    expect(row.details[2]!.overdue).toBeUndefined();
  });

  it('says nothing is open rather than showing an empty assignment row', () => {
    expect(assignmentRow({ open: [], closedInWindow: [] }).statement).toBe(
      'Nothing is open, and nothing closed in these 7 days.'
    );
  });
});

describe('every assignment on the band is named', () => {
  it('names the coach-assigned-only experiences, which have no registry entry on purpose', async () => {
    const { listAssessmentRegistryEntries } = await import('@/lib/assessment-registry/registry');
    const { STRESS_LOAD_DEFINITION_ID } = await import('@/lib/stress-load/constants');
    const { STRESS_LOAD_LABEL } = await import('@/lib/stress-load/copy');
    const { OYV_DEFINITION_ID } = await import('@/lib/owning-your-value/constants');
    const { OYV_LABEL } = await import('@/lib/owning-your-value/copy');
    const { assignmentNamesByDefinitionId } = await import('@/lib/assignments/experienceNames');

    // The premise: they really are absent from the registry. If either is
    // ever added, this test should be the thing that says so.
    for (const id of [STRESS_LOAD_DEFINITION_ID, OYV_DEFINITION_ID]) {
      expect(listAssessmentRegistryEntries().some((e) => e.databaseId === id)).toBe(false);
    }

    // And the shared map, which is what stops the band printing
    // "Assessment: Completed Aug 29" twice for two different things. It
    // moved out of app/actions/coachWeek.ts when the second such experience
    // arrived (Owning Your Value), so the band and the client detail panel
    // read one map rather than two.
    const names = assignmentNamesByDefinitionId();
    expect(names.get(STRESS_LOAD_DEFINITION_ID)).toBe(STRESS_LOAD_LABEL);
    expect(names.get(OYV_DEFINITION_ID)).toBe(OYV_LABEL);
    expect(STRESS_LOAD_LABEL).toBe('Stress & Load Deep-Dive');
    expect(OYV_LABEL).toBe('Owning Your Value');

    const source = readFileSync(
      join(__dirname, '..', 'app', 'actions', 'coachWeek.ts'),
      'utf8'
    );
    expect(source).toContain('assignmentNamesByDefinitionId()');
  });
});

// ---------------------------------------------------------------------
// 3. One finding, once.
// ---------------------------------------------------------------------

describe('an alert and a client list reason about one fact are shown once', () => {
  it('drops the list reason when an alert already covers it, and keeps the alert', () => {
    const kept = foldAttentionReasons({
      alerts: [{ alertKey: 'no_checkin' }],
      attentionReasons: [NO_CHECKIN_TODAY_REASON, PAIN_INCREASING_REASON],
    });
    expect(kept).toEqual([PAIN_INCREASING_REASON]);
  });

  it('folds the pain trend the same way, because both readings are one trend', () => {
    expect(findingKeyForAlert('symptoms_worsening_pain')).toBe(
      findingKeyForReason(PAIN_INCREASING_REASON)
    );
    expect(
      foldAttentionReasons({
        alerts: [{ alertKey: 'symptoms_worsening_pain' }],
        attentionReasons: [PAIN_INCREASING_REASON],
      })
    ).toEqual([]);
  });

  it('does not fold two facts that merely sound alike', () => {
    // Digestion worsening is a different area and must not silence the
    // pain reason.
    expect(
      foldAttentionReasons({
        alerts: [{ alertKey: 'symptoms_worsening_digestion' }],
        attentionReasons: [PAIN_INCREASING_REASON],
      })
    ).toEqual([PAIN_INCREASING_REASON]);
  });

  it('keeps a reason it has never heard of, rather than swallowing it', () => {
    expect(
      foldAttentionReasons({ alerts: [], attentionReasons: ['Something new a coach added'] })
    ).toEqual(['Something new a coach added']);
  });

  it('shows one line when the client list produces the same reason twice', () => {
    expect(
      foldAttentionReasons({
        alerts: [],
        attentionReasons: [PAIN_STOP_REASON, PAIN_STOP_REASON],
      })
    ).toEqual([PAIN_STOP_REASON]);
  });

  it('no longer claims she missed a check-in on a day that is not over', () => {
    expect(NO_CHECKIN_TODAY_REASON).toBe('No check-in logged today');
    expect(NO_CHECKIN_TODAY_REASON).not.toMatch(/miss/i);
  });
});

// ---------------------------------------------------------------------
// 4. Rendered, against real HTML.
// ---------------------------------------------------------------------

function band(): ThisWeekBand {
  const window = thisWeekWindowFor('2026-09-06');
  return {
    window,
    rows: [
      checkinRow(4),
      reflectionRow('Delivered Friday. Not yet completed.'),
      programRow([{ status: 'completed' }, { status: 'stopped' }]),
      experimentRow([]),
      resetPlanRow({ startLocalDate: '2026-08-20', logs: [{ state: 'not_today' }] }),
      assignmentRow({
        open: [
          {
            id: 'a1',
            name: 'Stress & Load Deep-Dive',
            statusLine: 'Sent Sep 5. Seen Sep 5, not completed. Overdue since Sep 2 (3 days).',
            open: true,
            overdue: true,
          },
        ],
        closedInWindow: [],
      }),
    ],
  };
}

describe('the band, rendered', () => {
  const html = renderToStaticMarkup(<ThisWeekBandView band={band()} />);

  it('names its window at the top', () => {
    expect(html).toContain('Week of Aug 29 to Sep 4');
  });

  it('renders all six rows', () => {
    for (const key of [
      'checkins',
      'weekly_reflection',
      'programs',
      'experiments',
      'reset_plan',
      'assignments',
    ]) {
      expect(html).toContain(`data-week-row="${key}"`);
    }
  });

  it('draws the overdue chip only where a real deadline passed', () => {
    expect(html).toContain('Overdue');
  });

  it('never uses the word missed, in any row, in any state', () => {
    expect(html).not.toMatch(/miss/i);
  });

  it('never uses an em dash', () => {
    expect(html).not.toContain('—');
  });
});
