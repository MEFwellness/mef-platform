/**
 * The daily movement lifecycle pass — the job that makes a program start,
 * progress and end on its own, so nobody has to remember to close one out.
 *
 * Three things happen here and nothing else:
 *
 *   upcoming -> active     on the program's start date
 *   current_week advances  on each week boundary
 *   active -> completed    the day after the program's end date
 *
 * Idempotent by construction, not by a "has this run today" flag. Every
 * decision is a pure function of the row's own dates and the member's own
 * local date (lib/program-lifecycle/transitions.ts), so a second run in the
 * same day finds every row already correct and writes nothing. Safe to
 * rerun, safe to run twice, safe to run after a missed day: a program whose
 * whole span passed while the job was down is completed on the next pass
 * rather than left mid-lifecycle.
 *
 * It writes to exactly one table, coach_program_assignments, plus one
 * lifecycle event per transition. The frozen snapshot tables are never
 * touched — see the header of lib/coach-program-builder/assignments.ts.
 *
 * Same service-role client, member-listing and per-row isolation shape as
 * app/api/cron/driver-state-engine/route.ts and the correlation engine's
 * own pass.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgramLifecycleEventType } from '@mef/shared-types-contracts';
import {
  applyLifecycleTransition,
  listLiveAssignments,
  replacePreviousAssignments,
  type AssignmentLifecycleRow,
} from '../coach-program-builder/assignments';
import { recordMemberEvent } from '../events/service';
import { todaysLocalDate } from '../time/localDate';
import { planTransition, type LifecycleTransitionKind } from './transitions';

const DEFAULT_TIMEZONE = 'America/New_York';

const EVENT_TYPE_FOR: Record<LifecycleTransitionKind, ProgramLifecycleEventType> = {
  started: 'program_started',
  week_advanced: 'program_week_advanced',
  completed: 'program_completed',
};

/** One line of the job's log, and one row of its JSON result. This is the "it must log what it transitioned" half of the job: the run says which assignment moved, from what, to what, and into which week. */
export interface LifecycleTransitionLog {
  assignmentId: string;
  memberId: string;
  programName: string;
  kind: LifecycleTransitionKind;
  fromStatus: string;
  toStatus: string;
  week: number;
  durationWeeks: number;
  localDate: string;
}

export interface LifecycleRunResult {
  scanned: number;
  started: number;
  weekAdvanced: number;
  completed: number;
  unchanged: number;
  failed: number;
  transitions: LifecycleTransitionLog[];
}

/** One timezone per member, in a single read — the pass must not fire a profile query per assignment when a member typically has several. */
export async function loadMemberTimezones(
  supabase: SupabaseClient,
  memberIds: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(memberIds));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, timezone')
    .in('id', unique);
  if (error) {
    console.error('program lifecycle: failed to load member timezones', error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((row) => [row.id as string, (row.timezone as string | null) ?? DEFAULT_TIMEZONE])
  );
}

/**
 * Runs the pass over one already-loaded set of rows. Separated from
 * runProgramLifecyclePass so a caller (and a test) can drive it over
 * whatever rows it likes, and so "today" can be supplied per member rather
 * than assumed to be the server's own day.
 */
export async function applyLifecycleForAssignments(
  supabase: SupabaseClient,
  rows: AssignmentLifecycleRow[],
  contextFor: (row: AssignmentLifecycleRow) => { localDate: string; timezone: string }
): Promise<LifecycleRunResult> {
  const result: LifecycleRunResult = {
    scanned: rows.length,
    started: 0,
    weekAdvanced: 0,
    completed: 0,
    unchanged: 0,
    failed: 0,
    transitions: [],
  };

  for (const row of rows) {
    const { localDate, timezone } = contextFor(row);
    const transition = planTransition(row, localDate);
    if (!transition) {
      result.unchanged += 1;
      continue;
    }

    const applied = await applyLifecycleTransition(supabase, row.id, {
      status: transition.toStatus,
      currentWeek: transition.week,
      startedAt: transition.kind === 'started',
      completedAt: transition.kind === 'completed',
    });
    if (!applied) {
      result.failed += 1;
      continue;
    }

    if (transition.kind === 'started') result.started += 1;
    if (transition.kind === 'week_advanced') result.weekAdvanced += 1;
    if (transition.kind === 'completed') result.completed += 1;

    result.transitions.push({
      assignmentId: row.id,
      memberId: row.member_id,
      programName: row.template_name_snapshot,
      kind: transition.kind,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      week: transition.week,
      durationWeeks: transition.durationWeeks,
      localDate,
    });

    await recordProgramLifecycleEvent(supabase, {
      memberId: row.member_id,
      assignmentId: row.id,
      eventType: EVENT_TYPE_FOR[transition.kind],
      timezone,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      week: transition.week,
      durationWeeks: transition.durationWeeks,
    });
  }

  return result;
}

export async function runProgramLifecyclePass(
  supabase: SupabaseClient
): Promise<LifecycleRunResult> {
  const rows = await listLiveAssignments(supabase);
  const timezones = await loadMemberTimezones(
    supabase,
    rows.map((row) => row.member_id)
  );

  const result = await applyLifecycleForAssignments(supabase, rows, (row) => {
    const timezone = timezones.get(row.member_id) ?? DEFAULT_TIMEZONE;
    return { localDate: todaysLocalDate(timezone), timezone };
  });

  for (const transition of result.transitions) {
    console.log(
      `program lifecycle: ${transition.kind} — assignment ${transition.assignmentId} ` +
        `("${transition.programName}") ${transition.fromStatus} -> ${transition.toStatus}, ` +
        `week ${transition.week} of ${transition.durationWeeks}, on ${transition.localDate}`
    );
  }
  console.log(
    `program lifecycle: scanned ${result.scanned}, started ${result.started}, ` +
      `week advanced ${result.weekAdvanced}, completed ${result.completed}, ` +
      `unchanged ${result.unchanged}, failed ${result.failed}`
  );

  return result;
}

/**
 * Assigning a new program to a member who already has one supersedes the
 * old one: 'replaced', with a pointer to what took its place, and one
 * lifecycle event each. Never a delete — the member keeps the history of
 * the program she actually did, and the coach keeps its completion record.
 *
 * newAssignmentIds is the whole batch just created, not one id, because a
 * corrective program arrives as two or three assignments at once (one per
 * weekly session) and must not replace itself.
 *
 * Returns the ids it superseded.
 */
export async function supersedePreviousPrograms(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    newAssignmentIds: string[];
    supersededBy: string;
    timezone: string;
  }
): Promise<string[]> {
  const superseded = await replacePreviousAssignments(supabase, {
    memberId: input.memberId,
    newAssignmentIds: input.newAssignmentIds,
    supersededBy: input.supersededBy,
  });

  for (const assignmentId of superseded) {
    await recordProgramLifecycleEvent(supabase, {
      memberId: input.memberId,
      assignmentId,
      eventType: 'program_replaced',
      timezone: input.timezone,
      fromStatus: 'active',
      toStatus: 'replaced',
      week: null,
      durationWeeks: null,
    });
  }

  if (superseded.length > 0) {
    console.log(
      `program lifecycle: replaced ${superseded.length} program(s) for member ${input.memberId}, ` +
        `superseded by ${input.supersededBy}`
    );
  }

  return superseded;
}

/**
 * One lifecycle event on the member's own stream. Never throws: a program
 * that genuinely transitioned must not be rolled back because an event row
 * failed to write, and the transition is already durable on the assignment
 * by the time this runs.
 */
export async function recordProgramLifecycleEvent(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    assignmentId: string;
    eventType: ProgramLifecycleEventType;
    timezone: string;
    fromStatus: string;
    toStatus: string;
    week: number | null;
    durationWeeks: number | null;
  }
): Promise<void> {
  try {
    await recordMemberEvent(supabase, {
      memberId: input.memberId,
      eventType: input.eventType,
      timezone: input.timezone,
      source: 'system',
      sourceRecordId: input.assignmentId,
      payload: {
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        ...(input.week === null ? {} : { week: String(input.week) }),
        ...(input.durationWeeks === null ? {} : { durationWeeks: String(input.durationWeeks) }),
      },
    });
  } catch (err) {
    console.error('recordProgramLifecycleEvent failed', err);
  }
}
