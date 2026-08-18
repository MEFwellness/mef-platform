/**
 * Assignment lifecycle — the arithmetic and the copy, with no database.
 *
 * Everything here is a pure function, so these tests pin the rules
 * themselves: when a program starts, which week it is in, when it is over,
 * what a pause costs (nothing), what the approve screen pre-fills, what a
 * member reads at each status, and when a coach gets flagged. The
 * integration half (real rows, real RLS, the real job) is
 * tests/program-lifecycle-integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROGRAM_DURATION_WEEKS,
  addDays,
  daysBetween,
  endDateFor,
  hasRunOut,
  nextWeekdayOnOrAfter,
  planTransition,
  resumedStatus,
  weekOn,
  type LifecycleFacts,
} from '../lib/program-lifecycle/transitions';
import {
  correctiveApprovalDefaults,
  defaultCorrectiveStartDate,
  weeklyDayPatternFor,
  CORRECTIVE_PROGRAM_DURATION_WEEKS,
} from '../lib/corrective-engine/approvalDefaults';
import {
  buildMemberProgramViews,
  isCurrentProgramStatus,
  programDetail,
  programDisplayName,
  programHeadline,
} from '../lib/program-lifecycle/memberView';
import {
  buildCoachProgramGroups,
  isLiveProgramStatus,
} from '../lib/program-lifecycle/coachView';
import {
  PROGRAM_COMPLETE_REASON,
  PROGRAM_ENDING_REASON,
  programAttentionReasons,
} from '../lib/program-lifecycle/coachAttention';
import { initialLifecycleState, durationWeeksFor } from '../lib/coach-program-builder/assignments';
import type {
  CoachAssignedWorkout,
  MemberProgramLifecycle,
} from '@mef/shared-types-contracts';

/** A four-week program starting Monday 3 August 2026, currently active in week 1. */
function facts(overrides: Partial<LifecycleFacts> = {}): LifecycleFacts {
  return {
    status: 'active',
    start_date: '2026-08-03',
    end_date: '2026-08-30',
    duration_weeks: 4,
    current_week: 1,
    paused_days: 0,
    ...overrides,
  };
}

describe('date arithmetic', () => {
  it('end date is the last day of the last week, inclusive', () => {
    // 4 weeks from Monday 3 Aug is 28 days, so the last day is Sunday 30 Aug.
    expect(endDateFor('2026-08-03', 4)).toBe('2026-08-30');
    expect(daysBetween('2026-08-03', '2026-08-30')).toBe(27);
  });

  it('days paused push the end date out by exactly that many days', () => {
    expect(endDateFor('2026-08-03', 4, 10)).toBe('2026-09-09');
  });

  it('nextWeekdayOnOrAfter returns the date itself when it already matches', () => {
    expect(nextWeekdayOnOrAfter('2026-08-03', 1)).toBe('2026-08-03'); // a Monday
    expect(nextWeekdayOnOrAfter('2026-08-04', 1)).toBe('2026-08-10');
    expect(nextWeekdayOnOrAfter('2026-08-04', 4)).toBe('2026-08-06'); // Thursday
  });

  it('addDays crosses a month boundary correctly', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });
});

describe('weekOn', () => {
  it('is week 1 on the start date and week 2 seven days later', () => {
    expect(weekOn(facts(), '2026-08-03')).toBe(1);
    expect(weekOn(facts(), '2026-08-09')).toBe(1);
    expect(weekOn(facts(), '2026-08-10')).toBe(2);
    expect(weekOn(facts(), '2026-08-17')).toBe(3);
    expect(weekOn(facts(), '2026-08-24')).toBe(4);
  });

  it('clamps at both ends and never returns 0 or more than the duration', () => {
    expect(weekOn(facts(), '2026-07-01')).toBe(1);
    expect(weekOn(facts(), '2027-01-01')).toBe(4);
  });

  it('does not count days spent paused, so a pause never costs a week', () => {
    // Held for 14 days, so 24 August is still week 2, not week 4.
    expect(weekOn(facts({ paused_days: 14 }), '2026-08-24')).toBe(2);
  });
});

describe('planTransition — the daily job, decided in one place', () => {
  it('starts an upcoming program on its start date, not before', () => {
    const upcoming = facts({ status: 'upcoming', current_week: 1 });
    expect(planTransition(upcoming, '2026-08-02')).toBeNull();

    const started = planTransition(upcoming, '2026-08-03');
    expect(started).toEqual({
      kind: 'started',
      fromStatus: 'upcoming',
      toStatus: 'active',
      week: 1,
      durationWeeks: 4,
    });
  });

  it('advances the week on a week boundary', () => {
    const advanced = planTransition(facts({ current_week: 1 }), '2026-08-10');
    expect(advanced).toMatchObject({ kind: 'week_advanced', toStatus: 'active', week: 2 });
  });

  it('completes the day after the end date, never on it', () => {
    expect(planTransition(facts({ current_week: 4 }), '2026-08-30')).toBeNull();
    expect(planTransition(facts({ current_week: 4 }), '2026-08-31')).toMatchObject({
      kind: 'completed',
      fromStatus: 'active',
      toStatus: 'completed',
      week: 4,
    });
  });

  it('is idempotent: a row already at the right week and status plans nothing', () => {
    const row = facts({ current_week: 2 });
    expect(planTransition(row, '2026-08-10')).toBeNull();
    expect(planTransition(row, '2026-08-11')).toBeNull();
  });

  it('completes a program whose whole span passed while the job was down, in one pass', () => {
    const missed = facts({ status: 'upcoming', current_week: 1 });
    expect(planTransition(missed, '2026-10-01')).toMatchObject({
      kind: 'completed',
      fromStatus: 'upcoming',
      toStatus: 'completed',
    });
  });

  it('leaves a paused program alone: it does not advance and it does not complete', () => {
    expect(planTransition(facts({ status: 'paused' }), '2026-08-10')).toBeNull();
    expect(planTransition(facts({ status: 'paused' }), '2026-12-01')).toBeNull();
  });

  it('never revisits a terminal status', () => {
    for (const status of ['completed', 'replaced', 'cancelled'] as const) {
      expect(planTransition(facts({ status }), '2027-01-01')).toBeNull();
    }
  });

  it('a program with no end date can never run out by time', () => {
    expect(hasRunOut(facts({ end_date: null }), '2030-01-01')).toBe(false);
  });
});

describe('resume', () => {
  it('returns to active, or to upcoming when it was held before it ever started', () => {
    expect(resumedStatus(facts({ status: 'paused' }), '2026-08-10')).toBe('active');
    expect(
      resumedStatus(facts({ status: 'paused', start_date: '2026-09-01' }), '2026-08-10')
    ).toBe('upcoming');
  });
});

describe('opening state of a newly created assignment', () => {
  it('opens upcoming when the start date is ahead', () => {
    expect(initialLifecycleState({ startDate: '2026-08-10', durationWeeks: 4, today: '2026-08-03' }))
      .toEqual({ status: 'upcoming', endDate: '2026-09-06', currentWeek: 1 });
  });

  it('opens active immediately when it starts today, rather than waiting for the job', () => {
    expect(initialLifecycleState({ startDate: '2026-08-03', durationWeeks: 4, today: '2026-08-03' }))
      .toEqual({ status: 'active', endDate: '2026-08-30', currentWeek: 1 });
  });

  it('opens at the right week when backdated', () => {
    expect(initialLifecycleState({ startDate: '2026-08-03', durationWeeks: 4, today: '2026-08-18' }))
      .toMatchObject({ status: 'active', currentWeek: 3 });
  });

  it('opens completed when its whole span is already in the past', () => {
    expect(initialLifecycleState({ startDate: '2026-06-01', durationWeeks: 4, today: '2026-08-03' }))
      .toMatchObject({ status: 'completed', currentWeek: 4 });
  });
});

describe('duration comes from the program', () => {
  it('reads `weeks` off a weekly schedule config', () => {
    expect(
      durationWeeksFor({ type: 'weekly', startDate: '2026-08-03', daysOfWeek: [1], weeks: 4 }, [])
    ).toBe(4);
  });

  it('falls back to the span the dates actually cover', () => {
    expect(durationWeeksFor({ type: 'specific_dates', dates: [] }, ['2026-08-03', '2026-08-16'])).toBe(2);
    expect(durationWeeksFor({ type: 'single', date: '2026-08-03' }, ['2026-08-03'])).toBe(1);
  });

  it('falls back to the default when there is nothing to read at all', () => {
    expect(durationWeeksFor({ type: 'specific_dates', dates: [] }, [])).toBe(
      DEFAULT_PROGRAM_DURATION_WEEKS
    );
  });
});

describe('smart defaults at approval time', () => {
  it('a corrective program is four weeks', () => {
    expect(CORRECTIVE_PROGRAM_DURATION_WEEKS).toBe(4);
  });

  it('the weekday patterns are still Mon/Thu and Mon/Wed/Fri', () => {
    expect(weeklyDayPatternFor(2)).toEqual([1, 4]);
    expect(weeklyDayPatternFor(3)).toEqual([1, 3, 5]);
  });

  it('the default start date is the next occurrence of the pattern’s first weekday', () => {
    // Both patterns start on a Monday, so both default to the next Monday.
    expect(defaultCorrectiveStartDate(2, '2026-08-05')).toBe('2026-08-10');
    expect(defaultCorrectiveStartDate(3, '2026-08-05')).toBe('2026-08-10');
  });

  it('approving on the pattern’s own weekday starts the following week, never today', () => {
    expect(defaultCorrectiveStartDate(3, '2026-08-03')).toBe('2026-08-10');
  });

  it('the end date follows from the start date and the duration, with nothing typed in', () => {
    const defaults = correctiveApprovalDefaults(3, '2026-08-05');
    expect(defaults).toEqual({
      startDate: '2026-08-10',
      durationWeeks: 4,
      endDate: '2026-09-06',
      daysOfWeek: [1, 3, 5],
    });
  });
});

// ---------------------------------------------------------------------------
// What the member reads.
// ---------------------------------------------------------------------------

function lifecycleRow(overrides: Partial<MemberProgramLifecycle>): MemberProgramLifecycle {
  return {
    id: 'a1',
    member_id: 'm1',
    template_name_snapshot: 'Corrective: Lower Cross: Session A',
    program_group_key: 'corrective-program:g1',
    status: 'active',
    start_date: '2026-08-03',
    end_date: '2026-08-30',
    duration_weeks: 4,
    current_week: 2,
    paused_days: 0,
    started_at: null,
    completed_at: null,
    paused_at: null,
    resumed_at: null,
    replaced_at: null,
    replaced_by_assignment_id: null,
    schedule_type: 'weekly',
    schedule_config: { type: 'weekly', startDate: '2026-08-03', daysOfWeek: [1], weeks: 4 },
    published_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function workout(overrides: Partial<CoachAssignedWorkout>): CoachAssignedWorkout {
  return {
    id: 'w1',
    assignment_id: 'a1',
    member_id: 'm1',
    coach_id: 'c1',
    scheduled_date: '2026-08-03',
    occurrence_label: null,
    template_name: 'Corrective: Lower Cross: Session A',
    description: null,
    goal: null,
    difficulty: null,
    estimated_duration_minutes: null,
    equipment: [],
    program_tags: [],
    corrective_tags: [],
    movement_tags: [],
    target_muscles: [],
    member_instructions: null,
    coach_notes: null,
    internal_notes: null,
    status: 'not_started',
    ...overrides,
  } as CoachAssignedWorkout;
}

describe('the member’s view of her program', () => {
  it('an active program says which week of how many, and the dates it runs', () => {
    expect(
      programHeadline({ status: 'active', currentWeek: 2, durationWeeks: 4, startDate: '2026-08-03' })
    ).toBe('Week 2 of 4');
    expect(
      programDetail({
        status: 'active',
        startDate: '2026-08-03',
        endDate: '2026-08-30',
        completedWorkouts: 3,
        totalWorkouts: 12,
      })
    ).toBe('August 3 to August 30');
  });

  it('an upcoming program says when it starts', () => {
    expect(
      programHeadline({ status: 'upcoming', currentWeek: 1, durationWeeks: 4, startDate: '2026-08-10' })
    ).toBe('Starts Monday, August 10');
  });

  it('a paused program says it is paused, and that it will pick up where she left off', () => {
    expect(
      programHeadline({ status: 'paused', currentWeek: 2, durationWeeks: 4, startDate: '2026-08-03' })
    ).toBe('Paused');
    expect(
      programDetail({
        status: 'paused',
        startDate: '2026-08-03',
        endDate: '2026-08-30',
        completedWorkouts: 3,
        totalWorkouts: 12,
      })
    ).toContain('pick up where you left off');
  });

  it('a completed program says her coach is reviewing her next phase', () => {
    expect(
      programHeadline({ status: 'completed', currentWeek: 4, durationWeeks: 4, startDate: '2026-08-03' })
    ).toBe('Program complete');
    expect(
      programDetail({
        status: 'completed',
        startDate: '2026-08-03',
        endDate: '2026-08-30',
        completedWorkouts: 9,
        totalWorkouts: 12,
      })
    ).toBe('Your coach is reviewing your next phase. You finished 9 of 12 sessions.');
  });

  it('no member-facing copy uses an em dash', () => {
    const statuses = ['active', 'upcoming', 'paused', 'completed', 'replaced', 'cancelled'] as const;
    for (const status of statuses) {
      const headline = programHeadline({
        status,
        currentWeek: 2,
        durationWeeks: 4,
        startDate: '2026-08-03',
      });
      const detail = programDetail({
        status,
        startDate: '2026-08-03',
        endDate: '2026-08-30',
        completedWorkouts: 3,
        totalWorkouts: 12,
      });
      expect(headline).not.toContain('—');
      expect(detail ?? '').not.toContain('—');
    }
  });

  it('three weekly sessions of one program read as one program, not three', () => {
    const views = buildMemberProgramViews(
      [
        lifecycleRow({ id: 'a1', template_name_snapshot: 'Corrective: Lower Cross: Session A' }),
        lifecycleRow({ id: 'a2', template_name_snapshot: 'Corrective: Lower Cross: Session B' }),
        lifecycleRow({ id: 'a3', template_name_snapshot: 'Corrective: Lower Cross: Session C' }),
      ],
      [workout({ id: 'w1', assignment_id: 'a1' }), workout({ id: 'w2', assignment_id: 'a2' })]
    );
    expect(views).toHaveLength(1);
    // The MEMBER-facing name. The coach's own view of the same three
    // assignments keeps the clinical one, asserted below.
    expect(views[0]!.name).toBe('Hip and Core Foundation');
    expect(views[0]!.headline).toBe('Week 2 of 4');
    expect(views[0]!.assignmentIds).toEqual(['a1', 'a2', 'a3']);
    expect(views[0]!.workouts).toHaveLength(2);
  });

  it('a program has one span even when its sessions disagree about their own dates', () => {
    // What migration 172's backfill left behind: Session A's first Monday,
    // Session B's first Wednesday and Session C's first Friday, each with
    // its own four weeks. She must read one week number, not three.
    const views = buildMemberProgramViews(
      [
        lifecycleRow({ id: 'a1', start_date: '2026-08-24', end_date: '2026-09-20', current_week: 1 }),
        lifecycleRow({ id: 'a2', start_date: '2026-08-19', end_date: '2026-09-15', current_week: 2 }),
        lifecycleRow({ id: 'a3', start_date: '2026-08-21', end_date: '2026-09-17', current_week: 1 }),
      ],
      []
    );
    expect(views).toHaveLength(1);
    expect(views[0]!.startDate).toBe('2026-08-19');
    expect(views[0]!.endDate).toBe('2026-09-20');
    expect(views[0]!.headline).toBe('Week 2 of 4');
  });

  it('a program is never called complete while part of it is still running', () => {
    const views = buildMemberProgramViews(
      [
        lifecycleRow({ id: 'a1', status: 'completed' }),
        lifecycleRow({ id: 'a2', status: 'active' }),
      ],
      []
    );
    expect(views[0]!.status).toBe('active');
  });

  it('a completed program is history, an active or upcoming one is current', () => {
    expect(isCurrentProgramStatus('active')).toBe(true);
    expect(isCurrentProgramStatus('paused')).toBe(true);
    expect(isCurrentProgramStatus('upcoming')).toBe(true);
    expect(isCurrentProgramStatus('completed')).toBe(false);
    expect(isCurrentProgramStatus('replaced')).toBe(false);
    expect(isCurrentProgramStatus('cancelled')).toBe(false);
  });

  it('history keeps the completion record rather than losing it', () => {
    const views = buildMemberProgramViews(
      [lifecycleRow({ id: 'a1', status: 'completed', program_group_key: 'g-done' })],
      [
        workout({ id: 'w1', status: 'completed' }),
        workout({ id: 'w2', status: 'completed' }),
        workout({ id: 'w3', status: 'skipped' }),
        workout({ id: 'w4', status: 'not_started' }),
      ]
    );
    expect(views[0]!.completedWorkouts).toBe(2);
    expect(views[0]!.totalWorkouts).toBe(4);
    expect(views[0]!.completionPercent).toBe(50);
  });

  it('the current program sorts above history', () => {
    const views = buildMemberProgramViews(
      [
        lifecycleRow({ id: 'a1', program_group_key: 'g-old', status: 'completed' }),
        lifecycleRow({ id: 'a2', program_group_key: 'g-new', status: 'active' }),
      ],
      []
    );
    expect(views.map((v) => v.groupKey)).toEqual(['g-new', 'g-old']);
  });

  it('a one-off program keeps its own name', () => {
    expect(programDisplayName(['Shoulder Reset'])).toBe('Shoulder Reset');
    expect(programDisplayName(['Alpha: Session A', 'Beta: Session B'])).toBe('Alpha: Session A');
  });
});

// ---------------------------------------------------------------------------
// What the coach gets flagged about.
// ---------------------------------------------------------------------------

describe('the coach’s needs-attention flags', () => {
  const today = '2026-09-01';

  it('flags a program that finished recently with nothing to replace it', () => {
    expect(
      programAttentionReasons(
        [
          {
            member_id: 'm1',
            status: 'completed',
            end_date: '2026-08-30',
            completed_at: '2026-08-31T12:00:00Z',
            replaced_by_assignment_id: null,
          },
        ],
        today
      )
    ).toEqual([PROGRAM_COMPLETE_REASON]);
  });

  it('stops flagging once the member is on something again', () => {
    expect(
      programAttentionReasons(
        [
          {
            member_id: 'm1',
            status: 'completed',
            end_date: '2026-08-30',
            completed_at: '2026-08-31T12:00:00Z',
            replaced_by_assignment_id: null,
          },
          {
            member_id: 'm1',
            status: 'active',
            end_date: '2026-09-27',
            completed_at: null,
            replaced_by_assignment_id: null,
          },
        ],
        today
      )
    ).not.toContain(PROGRAM_COMPLETE_REASON);
  });

  it('never flags a replaced program: the coach already decided what came next', () => {
    expect(
      programAttentionReasons(
        [
          {
            member_id: 'm1',
            status: 'replaced',
            end_date: '2026-08-30',
            completed_at: null,
            replaced_by_assignment_id: 'a2',
          },
        ],
        today
      )
    ).toEqual([]);
  });

  it('stops flagging a program that finished long ago', () => {
    expect(
      programAttentionReasons(
        [
          {
            member_id: 'm1',
            status: 'completed',
            end_date: '2026-06-01',
            completed_at: '2026-06-02T00:00:00Z',
            replaced_by_assignment_id: null,
          },
        ],
        today
      )
    ).toEqual([]);
  });

  it('flags a program inside its last week, and not one further out', () => {
    const endingSoon = programAttentionReasons(
      [
        {
          member_id: 'm1',
          status: 'active',
          end_date: '2026-09-05',
          completed_at: null,
          replaced_by_assignment_id: null,
        },
      ],
      today
    );
    expect(endingSoon).toEqual([PROGRAM_ENDING_REASON]);

    const notYet = programAttentionReasons(
      [
        {
          member_id: 'm1',
          status: 'active',
          end_date: '2026-10-01',
          completed_at: null,
          replaced_by_assignment_id: null,
        },
      ],
      today
    );
    expect(notYet).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// What the coach reads. One card per program, not per weekly session — the
// live run found that listing sessions separately made Pause act on a third
// of a program.
// ---------------------------------------------------------------------------

function summary(overrides: {
  id: string;
  name: string;
  groupKey: string;
  status?: MemberProgramLifecycle['status'];
  startDate?: string;
  endDate?: string;
  currentWeek?: number;
  total?: number;
  completed?: number;
  visibility?: 'draft' | 'published';
}) {
  return {
    assignment: {
      id: overrides.id,
      member_id: 'm1',
      coach_id: 'c1',
      template_id: null,
      template_name_snapshot: overrides.name,
      schedule_type: 'weekly' as const,
      schedule_config: {
        type: 'weekly' as const,
        startDate: overrides.startDate ?? '2026-08-03',
        daysOfWeek: [1],
        weeks: 4,
      },
      visibility: overrides.visibility ?? ('published' as const),
      published_at: '2026-08-01T00:00:00Z',
      assignment_notes: null,
      internal_notes: null,
      status: overrides.status ?? ('active' as const),
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      cancelled_at: null,
      cancelled_by: null,
      start_date: overrides.startDate ?? '2026-08-03',
      end_date: overrides.endDate ?? '2026-08-30',
      duration_weeks: 4,
      current_week: overrides.currentWeek ?? 2,
      paused_days: 0,
      started_at: null,
      completed_at: null,
      paused_at: null,
      resumed_at: null,
      replaced_at: null,
      replaced_by_assignment_id: null,
      program_group_key: overrides.groupKey,
      source_blueprint_version_id: null,
    },
    totalWorkouts: overrides.total ?? 4,
    completedWorkouts: overrides.completed ?? 1,
    completionPercent: 25,
    lastCompletedAt: null,
    nextScheduledDate: null,
  };
}

describe('the coach’s view of a client’s programs', () => {
  it('three weekly sessions are one card, with one status and one set of controls', () => {
    const groups = buildCoachProgramGroups([
      summary({ id: 'a1', name: 'Corrective: Lower Cross: Session A', groupKey: 'g1' }),
      summary({ id: 'a2', name: 'Corrective: Lower Cross: Session B', groupKey: 'g1' }),
      summary({ id: 'a3', name: 'Corrective: Lower Cross: Session C', groupKey: 'g1' }),
    ]);
    expect(groups).toHaveLength(1);
    // The coach still reads the clinical name, unchanged. Only the member
    // side maps it (lib/programs/memberPresentation.ts).
    expect(groups[0]!.name).toBe('Corrective: Lower Cross');
    expect(groups[0]!.status).toBe('active');
    expect(groups[0]!.sessions).toHaveLength(3);
    expect(groups[0]!.currentWeek).toBe(2);
    expect(groups[0]!.durationWeeks).toBe(4);
  });

  it('completion is counted across the whole program, not one session', () => {
    const groups = buildCoachProgramGroups([
      summary({ id: 'a1', name: 'P: Session A', groupKey: 'g1', total: 4, completed: 3 }),
      summary({ id: 'a2', name: 'P: Session B', groupKey: 'g1', total: 4, completed: 1 }),
    ]);
    expect(groups[0]!.totalWorkouts).toBe(8);
    expect(groups[0]!.completedWorkouts).toBe(4);
    expect(groups[0]!.completionPercent).toBe(50);
  });

  it('the program’s span is the span of all its sessions', () => {
    const groups = buildCoachProgramGroups([
      summary({ id: 'a1', name: 'P: Session A', groupKey: 'g1', startDate: '2026-08-24', endDate: '2026-09-20' }),
      summary({ id: 'a2', name: 'P: Session B', groupKey: 'g1', startDate: '2026-08-19', endDate: '2026-09-15' }),
    ]);
    expect(groups[0]!.startDate).toBe('2026-08-19');
    expect(groups[0]!.endDate).toBe('2026-09-20');
  });

  it('at most one program is live, and finished ones sort into history', () => {
    const groups = buildCoachProgramGroups([
      summary({ id: 'a1', name: 'Old program', groupKey: 'g-old', status: 'replaced' }),
      summary({ id: 'a2', name: 'Finished program', groupKey: 'g-done', status: 'completed' }),
      summary({ id: 'a3', name: 'Current program', groupKey: 'g-now', status: 'active' }),
    ]);
    const live = groups.filter((g) => isLiveProgramStatus(g.status));
    const history = groups.filter((g) => !isLiveProgramStatus(g.status));
    expect(live.map((g) => g.name)).toEqual(['Current program']);
    expect(history.map((g) => g.name).sort()).toEqual(['Finished program', 'Old program']);
    expect(groups[0]!.name).toBe('Current program');
  });

  it('a program with any unpublished session is marked as carrying a draft', () => {
    const groups = buildCoachProgramGroups([
      summary({ id: 'a1', name: 'P: Session A', groupKey: 'g1' }),
      summary({ id: 'a2', name: 'P: Session B', groupKey: 'g1', visibility: 'draft' }),
    ]);
    expect(groups[0]!.hasDraft).toBe(true);
  });
});
