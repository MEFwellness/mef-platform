/**
 * HOW THE PROGRAM IS GOING. Everything a member did, said and lifted inside
 * one program, turned into the handful of facts a coach actually reads.
 *
 * Pure functions over rows that were already fetched (the reads are in
 * ./data.ts), so every rule below can be checked against a handful of
 * literals and so the coach's screen and a test are looking at the same
 * arithmetic.
 *
 * ONE PROGRAM, NOT ONE ASSIGNMENT. A corrective program is two or three
 * assignments sharing a program_group_key (migration 172), and a coach
 * asking how the program is going means all of it. Every count here is
 * across the group.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 *   No score. Nothing in this file reduces a member to a number out of a
 *   hundred, because a coach reading "68" has to guess what it was made of
 *   and a coach reading "she has skipped Dead Bug three times" does not.
 *
 *   No verdict. Whether any of this means progress, rotation or a repeat is
 *   ../review/recommend.ts's job, and it is a separate job on purpose: the
 *   signals have to be readable even when the recommendation is wrong.
 *
 *   No member-facing text. Every string in this file is written for a coach
 *   and none of it is routed to a member screen.
 *
 * NO EM DASHES, per the house rule.
 */
import type {
  BlueprintBlock,
  CoachAssignedWorkout,
  CoachAssignedWorkoutExercise,
  MemberExerciseAvoidance,
  MemberExerciseFeedback,
} from '@mef/shared-types-contracts';
import type { LoggedLoadUnit } from '../weightLogging';

// ---------------------------------------------------------------------
// The shapes.
// ---------------------------------------------------------------------

export interface WeekCompletion {
  week: number;
  totalSessions: number;
  completedSessions: number;
  skippedSessions: number;
  completionPercent: number;
}

export interface ExerciseTally {
  provider: string;
  externalId: string;
  exerciseName: string;
  count: number;
}

export interface SwapRecord {
  fromExerciseName: string;
  toExerciseName: string;
  /** Her reason, as the sheet labelled it. Never the raw stored key. */
  reasonLabel: string;
  /** Her own words, when she typed any. Coach facing only. */
  otherText: string | null;
  occurrencesUpdated: number;
  at: string;
}

export interface PainReport {
  feedbackId: string;
  exerciseName: string;
  externalId: string;
  otherText: string | null;
  programWeek: number | null;
  at: string;
  /** Set once a coach has marked it reviewed. The record stays either way. */
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface FeedbackFlag {
  feedbackId: string;
  exerciseName: string;
  externalId: string;
  programWeek: number | null;
  at: string;
  resolvedAt: string | null;
}

export interface RatingTrendPoint {
  week: number;
  /** How many ratings of each kind landed in this week. */
  counts: Record<string, number>;
}

export interface LoadPoint {
  week: number | null;
  date: string;
  load: number;
  unit: LoggedLoadUnit;
  perSide: boolean;
}

export interface ExerciseLoadTrend {
  provider: string;
  externalId: string;
  exerciseName: string;
  block: BlueprintBlock;
  points: LoadPoint[];
  /** "20 to 22.5 to 25 lbs". The whole trend as one line, which is what the panel renders. */
  line: string;
  firstLoad: number;
  lastLoad: number;
  unit: LoggedLoadUnit;
  perSide: boolean;
}

export interface AvoidanceEntry {
  id: string;
  exerciseName: string;
  externalId: string;
  provider: string;
  /** Why it is on the list, in words. */
  sourceLabel: string;
  at: string;
  releasedAt: string | null;
}

export interface ProgramSignals {
  groupKey: string;
  programName: string;
  isCorrectiveProgram: boolean;

  totalSessions: number;
  completedSessions: number;
  skippedSessions: number;
  completionPercent: number;
  weeks: WeekCompletion[];

  /** Exercises she skipped, most skipped first. */
  skippedExercises: ExerciseTally[];
  /** Exercises she stopped because they hurt. Its own list, never mixed into skips. */
  stoppedExercises: ExerciseTally[];

  swaps: SwapRecord[];
  painReports: PainReport[];
  tooEasyFlags: FeedbackFlag[];
  tooDifficultFlags: FeedbackFlag[];
  /** Every other report, so nothing a member said is invisible to her coach. */
  otherReports: FeedbackFlag[];

  difficultyTrend: RatingTrendPoint[];
  comfortTrend: RatingTrendPoint[];

  loadTrends: ExerciseLoadTrend[];

  avoidance: AvoidanceEntry[];

  /** True while at least one pain report has not been marked reviewed. */
  hasOpenPainReport: boolean;
}

// ---------------------------------------------------------------------
// Small vocabularies. Coach facing, so they are written out.
// ---------------------------------------------------------------------

const REASON_LABEL: Record<string, string> = {
  pain: 'pain or discomfort',
  too_difficult: 'too difficult',
  too_easy: 'too easy',
  do_not_understand: 'did not understand it',
  no_equipment: 'no equipment',
  no_space: 'not enough space',
  not_comfortable: 'not comfortable doing it',
  do_not_like: 'did not like it',
  other: 'something else',
};

const AVOIDANCE_SOURCE_LABEL: Record<string, string> = {
  pain: 'She reported pain on it',
  repeated_dislike: 'She reported it more than once',
  repeated_skip: 'She skipped it repeatedly',
  swapped_away: 'She swapped it out',
};

export function feedbackReasonLabelForCoach(reason: string): string {
  return REASON_LABEL[reason] ?? 'something else';
}

// ---------------------------------------------------------------------
// The aggregation.
// ---------------------------------------------------------------------

export interface SignalInput {
  groupKey: string;
  programName: string;
  workouts: CoachAssignedWorkout[];
  exercises: CoachAssignedWorkoutExercise[];
  feedback: MemberExerciseFeedback[];
  avoidance: MemberExerciseAvoidance[];
  /** The MEF block each exercise sits in, by section id, from the frozen sections. */
  blockBySectionId: Map<string, BlueprintBlock>;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function tally(
  rows: CoachAssignedWorkoutExercise[],
  matches: (row: CoachAssignedWorkoutExercise) => boolean
): ExerciseTally[] {
  const byExercise = new Map<string, ExerciseTally>();
  for (const row of rows) {
    if (!matches(row)) continue;
    const key = `${row.provider}:${row.external_id}`;
    const entry = byExercise.get(key);
    if (entry) {
      entry.count += 1;
      continue;
    }
    byExercise.set(key, {
      provider: row.provider,
      externalId: row.external_id,
      exerciseName: row.exercise_name,
      count: 1,
    });
  }
  return [...byExercise.values()].sort(
    (a, b) => b.count - a.count || a.exerciseName.localeCompare(b.exerciseName)
  );
}

function ratingTrend(
  exercises: CoachAssignedWorkoutExercise[],
  weekByWorkoutId: Map<string, number>,
  read: (row: CoachAssignedWorkoutExercise) => string | null
): RatingTrendPoint[] {
  const byWeek = new Map<number, Record<string, number>>();
  for (const row of exercises) {
    const value = read(row);
    if (!value) continue;
    const week = weekByWorkoutId.get(row.assigned_workout_id) ?? 1;
    const counts = byWeek.get(week) ?? {};
    counts[value] = (counts[value] ?? 0) + 1;
    byWeek.set(week, counts);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, counts]) => ({ week, counts }));
}

/** "20 to 22.5 to 25 lbs per side". The whole progression as one readable line. */
export function formatLoadLine(points: LoadPoint[]): string {
  if (points.length === 0) return '';
  const last = points[points.length - 1]!;
  const numbers = points.map((p) => (Number.isInteger(p.load) ? String(p.load) : String(p.load)));
  return `${numbers.join(' to ')} ${last.unit}${last.perSide ? ' per side' : ''}`;
}

export function buildProgramSignals(input: SignalInput): ProgramSignals {
  const weekByWorkoutId = new Map<string, number>();
  for (const workout of input.workouts) {
    weekByWorkoutId.set(workout.id, workout.program_week ?? 1);
  }

  // --- Completion, by week and overall ---
  const byWeek = new Map<number, { total: number; completed: number; skipped: number }>();
  for (const workout of input.workouts) {
    const week = workout.program_week ?? 1;
    const entry = byWeek.get(week) ?? { total: 0, completed: 0, skipped: 0 };
    entry.total += 1;
    if (workout.status === 'completed') entry.completed += 1;
    if (workout.status === 'skipped') entry.skipped += 1;
    byWeek.set(week, entry);
  }
  const weeks: WeekCompletion[] = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, entry]) => ({
      week,
      totalSessions: entry.total,
      completedSessions: entry.completed,
      skippedSessions: entry.skipped,
      completionPercent: percent(entry.completed, entry.total),
    }));

  const totalSessions = input.workouts.length;
  const completedSessions = input.workouts.filter((w) => w.status === 'completed').length;
  const skippedSessions = input.workouts.filter((w) => w.status === 'skipped').length;

  // --- What she said ---
  const swaps: SwapRecord[] = input.feedback
    .filter((row) => row.outcome === 'swapped' && row.replacement_exercise_name)
    .map((row) => ({
      fromExerciseName: row.exercise_name,
      toExerciseName: row.replacement_exercise_name!,
      reasonLabel: feedbackReasonLabelForCoach(row.reason),
      otherText: row.other_text,
      occurrencesUpdated: row.occurrences_updated,
      at: row.created_at,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const painReports: PainReport[] = input.feedback
    .filter((row) => row.branch === 'safety')
    .map((row) => ({
      feedbackId: row.id,
      exerciseName: row.exercise_name,
      externalId: row.external_id,
      otherText: row.other_text,
      programWeek: row.program_week,
      at: row.created_at,
      resolvedAt: row.coach_reviewed_at,
      resolutionNote: (row as MemberExerciseFeedback & { coach_review_note?: string | null })
        .coach_review_note ?? null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const flagsFor = (predicate: (row: MemberExerciseFeedback) => boolean): FeedbackFlag[] =>
    input.feedback
      .filter(predicate)
      .map((row) => ({
        feedbackId: row.id,
        exerciseName: row.exercise_name,
        externalId: row.external_id,
        programWeek: row.program_week,
        at: row.created_at,
        resolvedAt: row.coach_reviewed_at,
      }))
      .sort((a, b) => b.at.localeCompare(a.at));

  const tooEasyFlags = flagsFor((row) => row.reason === 'too_easy');
  const tooDifficultFlags = flagsFor((row) => row.reason === 'too_difficult');
  const otherReports = flagsFor(
    (row) => row.branch === 'alternatives' && row.reason !== 'too_easy' && row.reason !== 'too_difficult'
  );

  // --- What she lifted ---
  const loadsByExercise = new Map<string, ExerciseLoadTrend>();
  const logged = input.exercises
    .filter((row) => row.logged_load !== null && row.logged_load !== undefined)
    .slice()
    .sort((a, b) => (a.logged_load_at ?? '').localeCompare(b.logged_load_at ?? ''));
  for (const row of logged) {
    const key = `${row.provider}:${row.external_id}`;
    const point: LoadPoint = {
      week: weekByWorkoutId.get(row.assigned_workout_id) ?? null,
      date: (row.logged_load_at ?? '').slice(0, 10),
      load: Number(row.logged_load),
      unit: (row.logged_load_unit as LoggedLoadUnit | null) ?? 'lbs',
      perSide: row.logged_load_per_side === true,
    };
    const trend = loadsByExercise.get(key);
    if (trend) {
      trend.points.push(point);
      continue;
    }
    loadsByExercise.set(key, {
      provider: row.provider,
      externalId: row.external_id,
      exerciseName: row.exercise_name,
      block: input.blockBySectionId.get(row.section_id) ?? 'strength',
      points: [point],
      line: '',
      firstLoad: point.load,
      lastLoad: point.load,
      unit: point.unit,
      perSide: point.perSide,
    });
  }
  const loadTrends = [...loadsByExercise.values()].map((trend) => {
    const last = trend.points[trend.points.length - 1]!;
    return {
      ...trend,
      line: formatLoadLine(trend.points),
      firstLoad: trend.points[0]!.load,
      lastLoad: last.load,
      unit: last.unit,
      perSide: last.perSide,
    };
  });
  loadTrends.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  return {
    groupKey: input.groupKey,
    programName: input.programName,
    isCorrectiveProgram: input.workouts.some((w) => (w.corrective_tags ?? []).length > 0),

    totalSessions,
    completedSessions,
    skippedSessions,
    completionPercent: percent(completedSessions, totalSessions),
    weeks,

    skippedExercises: tally(input.exercises, (row) => row.status === 'skipped'),
    stoppedExercises: tally(input.exercises, (row) => row.status === 'stopped'),

    swaps,
    painReports,
    tooEasyFlags,
    tooDifficultFlags,
    otherReports,

    difficultyTrend: ratingTrend(input.exercises, weekByWorkoutId, (row) => row.difficulty_rating),
    comfortTrend: ratingTrend(input.exercises, weekByWorkoutId, (row) => row.comfort_rating),

    loadTrends,

    avoidance: input.avoidance
      .map((row) => ({
        id: row.id,
        exerciseName: row.exercise_name,
        externalId: row.external_id,
        provider: row.provider,
        sourceLabel: AVOIDANCE_SOURCE_LABEL[row.source] ?? 'She asked not to be given it',
        at: row.created_at,
        releasedAt: row.released_at,
      }))
      .sort((a, b) => {
        if ((a.releasedAt === null) !== (b.releasedAt === null)) return a.releasedAt === null ? -1 : 1;
        return b.at.localeCompare(a.at);
      }),

    hasOpenPainReport: painReports.some((report) => report.resolvedAt === null),
  };
}

/**
 * One exercise's signals, in the shape the load rules take. Pulled out of
 * the aggregate rather than recomputed by the caller, so "she reported pain
 * on this one" means exactly the same thing on the panel and in the number.
 */
export function loadSignalsForExercise(
  signals: ProgramSignals,
  externalId: string,
  exercises: CoachAssignedWorkoutExercise[]
): {
  reportedPain: boolean;
  reportedTooDifficult: boolean;
  reportedTooEasy: boolean;
  completedOccurrences: number;
  missedOccurrences: number;
} {
  const mine = exercises.filter((row) => row.external_id === externalId);
  return {
    reportedPain:
      signals.painReports.some((report) => report.externalId === externalId) ||
      mine.some((row) => row.status === 'stopped' || row.comfort_rating === 'pain'),
    reportedTooDifficult:
      signals.tooDifficultFlags.some((flag) => flag.externalId === externalId) ||
      mine.some((row) => row.difficulty_rating === 'very_difficult'),
    reportedTooEasy:
      signals.tooEasyFlags.some((flag) => flag.externalId === externalId) ||
      mine.some((row) => row.difficulty_rating === 'very_easy' || row.difficulty_rating === 'easy'),
    completedOccurrences: mine.filter(
      (row) => row.status === 'completed' || row.status === 'partially_completed'
    ).length,
    missedOccurrences: mine.filter((row) => row.status === 'skipped' || row.status === 'stopped')
      .length,
  };
}
