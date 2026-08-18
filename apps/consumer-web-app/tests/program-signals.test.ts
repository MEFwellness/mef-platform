/**
 * THE SIGNAL SURFACE, as arithmetic. Pure functions over literal rows, so
 * every claim the coach's panel makes is checked here before it reaches a
 * screen.
 *
 * The sentences matter as much as the counts. A coach reading "She has
 * skipped Dead Bug 3 times" is the whole point of insights.ts, so the text
 * itself is asserted rather than a shape around it.
 */
import { describe, it, expect } from 'vitest';
import type {
  BlueprintBlock,
  CoachAssignedWorkout,
  CoachAssignedWorkoutExercise,
  MemberExerciseAvoidance,
  MemberExerciseFeedback,
} from '@mef/shared-types-contracts';
import {
  buildProgramSignals,
  formatLoadLine,
  loadSignalsForExercise,
} from '../lib/programs/signals/aggregate';
import {
  INSIGHT_REPEAT_REPORT_THRESHOLD,
  INSIGHT_SKIP_THRESHOLD,
  programInsights,
} from '../lib/programs/signals/insights';

// ---------------------------------------------------------------------
// Fixtures. Deliberately literal.
// ---------------------------------------------------------------------

function workout(
  id: string,
  week: number,
  status: string,
  extra: Partial<CoachAssignedWorkout> = {}
): CoachAssignedWorkout {
  return {
    id,
    assignment_id: 'assignment-1',
    member_id: 'member-1',
    coach_id: 'coach-1',
    scheduled_date: '2026-08-01',
    occurrence_label: null,
    template_name: 'Test Program: Session A',
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
    status: status as CoachAssignedWorkout['status'],
    started_at: null,
    completed_at: null,
    skipped_at: null,
    member_feedback: null,
    published_at: '2026-08-01T00:00:00Z',
    source_prescription_snapshot_id: null,
    program_week: week,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...extra,
  };
}

function exercise(
  id: string,
  workoutId: string,
  externalId: string,
  name: string,
  extra: Partial<CoachAssignedWorkoutExercise> = {}
): CoachAssignedWorkoutExercise {
  return {
    id,
    assigned_workout_id: workoutId,
    section_id: 'section-strength',
    member_id: 'member-1',
    coach_id: 'coach-1',
    provider: 'your_move',
    external_id: externalId,
    exercise_name: name,
    sequence_index: 0,
    status: 'completed',
    completed_at: null,
    member_notes: null,
    difficulty_rating: null,
    comfort_rating: null,
    selection_reasoning: null,
    member_reasoning: null,
    logged_load: null,
    logged_load_unit: null,
    logged_load_per_side: false,
    logged_load_at: null,
    stopped_at: null,
    movement_pattern: null,
    is_locked: false,
    replacement_criteria: {},
    swapped_from_external_id: null,
    swapped_from_exercise_name: null,
    swapped_at: null,
    created_at: '2026-08-01T00:00:00Z',
    sets: 3,
    reps: '8',
    rep_range_low: 8,
    rep_range_high: 8,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: 60,
    tempo: null,
    rpe: null,
    load: null,
    load_unit: null,
    resistance: null,
    band_color: null,
    side: null,
    unilateral: false,
    hold_duration_seconds: null,
    frequency: null,
    priority: 'medium',
    is_required: true,
    notes: null,
    coaching_cues: null,
    pain_modification_notes: null,
    alternate_exercises: {},
    ...extra,
  } as CoachAssignedWorkoutExercise;
}

function feedback(
  id: string,
  overrides: Partial<MemberExerciseFeedback> = {}
): MemberExerciseFeedback {
  return {
    id,
    member_id: 'member-1',
    coach_id: 'coach-1',
    assigned_workout_exercise_id: null,
    assigned_workout_id: null,
    assignment_id: 'assignment-1',
    program_group_key: 'group-1',
    program_week: 1,
    provider: 'your_move',
    external_id: 'ex-1',
    exercise_name: 'Goblet Squat',
    reason: 'do_not_like',
    other_text: null,
    branch: 'alternatives',
    outcome: 'kept_original',
    replacement_provider: null,
    replacement_external_id: null,
    replacement_exercise_name: null,
    occurrences_updated: 0,
    initiated_by: 'member',
    coach_notified: false,
    coach_reviewed_at: null,
    created_at: '2026-08-05T00:00:00Z',
    ...overrides,
  };
}

function avoidance(
  id: string,
  overrides: Partial<MemberExerciseAvoidance> = {}
): MemberExerciseAvoidance {
  return {
    id,
    member_id: 'member-1',
    provider: 'your_move',
    external_id: 'ex-9',
    exercise_name: 'Bird Dog',
    source: 'pain',
    feedback_id: null,
    released_at: null,
    released_by: null,
    created_at: '2026-08-06T00:00:00Z',
    ...overrides,
  };
}

const BLOCKS = new Map<string, BlueprintBlock>([['section-strength', 'strength']]);

function build(input: {
  workouts?: CoachAssignedWorkout[];
  exercises?: CoachAssignedWorkoutExercise[];
  feedback?: MemberExerciseFeedback[];
  avoidance?: MemberExerciseAvoidance[];
}) {
  return buildProgramSignals({
    groupKey: 'group-1',
    programName: 'Test Program',
    workouts: input.workouts ?? [],
    exercises: input.exercises ?? [],
    feedback: input.feedback ?? [],
    avoidance: input.avoidance ?? [],
    blockBySectionId: BLOCKS,
  });
}

// ---------------------------------------------------------------------

describe('completion', () => {
  it('counts by week and overall, and a skipped session is not a completed one', () => {
    const signals = build({
      workouts: [
        workout('w1', 1, 'completed'),
        workout('w2', 1, 'completed'),
        workout('w3', 2, 'skipped'),
        workout('w4', 2, 'completed'),
        workout('w5', 3, 'not_started'),
        workout('w6', 3, 'not_started'),
      ],
    });

    expect(signals.totalSessions).toBe(6);
    expect(signals.completedSessions).toBe(3);
    expect(signals.skippedSessions).toBe(1);
    expect(signals.completionPercent).toBe(50);

    expect(signals.weeks).toEqual([
      { week: 1, totalSessions: 2, completedSessions: 2, skippedSessions: 0, completionPercent: 100 },
      { week: 2, totalSessions: 2, completedSessions: 1, skippedSessions: 1, completionPercent: 50 },
      { week: 3, totalSessions: 2, completedSessions: 0, skippedSessions: 0, completionPercent: 0 },
    ]);
  });

  it('an empty program is 0%, not a division by zero', () => {
    expect(build({}).completionPercent).toBe(0);
  });
});

describe('skips and stops are two different facts', () => {
  it('tallies each on its own list', () => {
    const signals = build({
      workouts: [workout('w1', 1, 'completed')],
      exercises: [
        exercise('e1', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
        exercise('e2', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
        exercise('e3', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
        exercise('e4', 'w1', 'ex-bird-dog', 'Bird Dog', { status: 'stopped' }),
      ],
    });

    expect(signals.skippedExercises).toEqual([
      { provider: 'your_move', externalId: 'ex-dead-bug', exerciseName: 'Dead Bug', count: 3 },
    ]);
    expect(signals.stoppedExercises).toEqual([
      { provider: 'your_move', externalId: 'ex-bird-dog', exerciseName: 'Bird Dog', count: 1 },
    ]);
  });
});

describe('logged weights', () => {
  it('reads as one line per exercise, oldest first', () => {
    const signals = build({
      workouts: [workout('w1', 1, 'completed'), workout('w2', 2, 'completed'), workout('w3', 3, 'completed')],
      exercises: [
        exercise('e2', 'w2', 'ex-1', 'Goblet Squat', {
          logged_load: 22.5,
          logged_load_unit: 'lbs',
          logged_load_at: '2026-08-08T10:00:00Z',
        }),
        exercise('e1', 'w1', 'ex-1', 'Goblet Squat', {
          logged_load: 20,
          logged_load_unit: 'lbs',
          logged_load_at: '2026-08-01T10:00:00Z',
        }),
        exercise('e3', 'w3', 'ex-1', 'Goblet Squat', {
          logged_load: 25,
          logged_load_unit: 'lbs',
          logged_load_at: '2026-08-15T10:00:00Z',
        }),
      ],
    });

    expect(signals.loadTrends).toHaveLength(1);
    const trend = signals.loadTrends[0]!;
    expect(trend.line).toBe('20 to 22.5 to 25 lbs');
    expect(trend.firstLoad).toBe(20);
    expect(trend.lastLoad).toBe(25);
    expect(trend.points.map((p) => p.week)).toEqual([1, 2, 3]);
  });

  it('says per side when the number was per side', () => {
    expect(
      formatLoadLine([
        { week: 1, date: '2026-08-01', load: 15, unit: 'lbs', perSide: true },
        { week: 2, date: '2026-08-08', load: 17.5, unit: 'lbs', perSide: true },
      ])
    ).toBe('15 to 17.5 lbs per side');
  });

  it('an exercise she never logged has no trend at all', () => {
    const signals = build({
      workouts: [workout('w1', 1, 'completed')],
      exercises: [exercise('e1', 'w1', 'ex-1', 'Goblet Squat')],
    });
    expect(signals.loadTrends).toEqual([]);
  });
});

describe('what she said', () => {
  it('separates pain, too easy, too difficult and everything else', () => {
    const signals = build({
      feedback: [
        feedback('f1', { reason: 'pain', branch: 'safety', outcome: 'stopped_for_pain', exercise_name: 'Bird Dog' }),
        feedback('f2', { reason: 'too_easy', branch: 'progression_note', outcome: 'logged_for_coach' }),
        feedback('f3', { reason: 'too_difficult', branch: 'regression', outcome: 'kept_original' }),
        feedback('f4', { reason: 'no_equipment', branch: 'alternatives', outcome: 'swapped' }),
      ],
    });

    expect(signals.painReports.map((r) => r.exerciseName)).toEqual(['Bird Dog']);
    expect(signals.tooEasyFlags).toHaveLength(1);
    expect(signals.tooDifficultFlags).toHaveLength(1);
    expect(signals.otherReports).toHaveLength(1);
    expect(signals.hasOpenPainReport).toBe(true);
  });

  it('a resolved pain report keeps its place on the list and stops being open', () => {
    const signals = build({
      feedback: [
        feedback('f1', {
          reason: 'pain',
          branch: 'safety',
          outcome: 'stopped_for_pain',
          coach_reviewed_at: '2026-08-10T00:00:00Z',
        }),
      ],
    });
    expect(signals.painReports).toHaveLength(1);
    expect(signals.painReports[0]!.resolvedAt).toBe('2026-08-10T00:00:00Z');
    expect(signals.hasOpenPainReport).toBe(false);
  });

  it('a swap reads as from, to and why', () => {
    const signals = build({
      feedback: [
        feedback('f1', {
          reason: 'no_equipment',
          branch: 'alternatives',
          outcome: 'swapped',
          exercise_name: 'Goblet Squat',
          replacement_exercise_name: 'Bodyweight Squat',
          occurrences_updated: 4,
        }),
      ],
    });
    expect(signals.swaps).toEqual([
      {
        fromExerciseName: 'Goblet Squat',
        toExerciseName: 'Bodyweight Squat',
        reasonLabel: 'no equipment',
        otherText: null,
        occurrencesUpdated: 4,
        at: '2026-08-05T00:00:00Z',
      },
    ]);
  });
});

describe('the avoidance list', () => {
  it('puts live entries above released ones and says why each is there', () => {
    const signals = build({
      avoidance: [
        avoidance('a1', { released_at: '2026-08-09T00:00:00Z', exercise_name: 'Plank' }),
        avoidance('a2', { exercise_name: 'Bird Dog', source: 'pain' }),
      ],
    });
    expect(signals.avoidance.map((a) => a.exerciseName)).toEqual(['Bird Dog', 'Plank']);
    expect(signals.avoidance[0]!.sourceLabel).toBe('She reported pain on it');
  });
});

describe('repeated patterns become sentences', () => {
  it('says a skip count out loud once it repeats, and stays quiet before that', () => {
    const twice = programInsights(
      build({
        workouts: [workout('w1', 1, 'completed')],
        exercises: [
          exercise('e1', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
          exercise('e2', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
          exercise('e3', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' }),
        ],
      })
    );
    expect(twice.some((i) => i.text === 'She has skipped Dead Bug 3 times.')).toBe(true);

    const once = programInsights(
      build({
        workouts: [workout('w1', 1, 'completed')],
        exercises: [exercise('e1', 'w1', 'ex-dead-bug', 'Dead Bug', { status: 'skipped' })],
      })
    );
    expect(once.some((i) => i.kind === 'repeated_skip')).toBe(false);
    expect(INSIGHT_SKIP_THRESHOLD).toBe(2);
  });

  it('one pain report is enough, and it leads the list', () => {
    const insights = programInsights(
      build({
        workouts: [workout('w1', 1, 'completed')],
        feedback: [
          feedback('f1', {
            reason: 'pain',
            branch: 'safety',
            outcome: 'stopped_for_pain',
            exercise_name: 'Bird Dog',
            program_week: 2,
          }),
        ],
      })
    );
    expect(insights[0]!.kind).toBe('pain');
    expect(insights[0]!.tone).toBe('attention');
    expect(insights[0]!.text).toBe(
      'She reported pain on Bird Dog in week 2. This has not been reviewed yet.'
    );
  });

  it('a resolved pain report says so instead of nagging', () => {
    const insights = programInsights(
      build({
        feedback: [
          feedback('f1', {
            reason: 'pain',
            branch: 'safety',
            outcome: 'stopped_for_pain',
            exercise_name: 'Bird Dog',
            program_week: 2,
            coach_reviewed_at: '2026-08-10T00:00:00Z',
          }),
        ],
      })
    );
    expect(insights[0]!.text).toContain('You marked it reviewed.');
  });

  it('two reports about one exercise is a pattern, one is not', () => {
    const twice = programInsights(
      build({
        feedback: [
          feedback('f1', { external_id: 'ex-1', exercise_name: 'Goblet Squat' }),
          feedback('f2', { external_id: 'ex-1', exercise_name: 'Goblet Squat' }),
        ],
      })
    );
    expect(twice.some((i) => i.kind === 'repeated_report')).toBe(true);

    const once = programInsights(
      build({ feedback: [feedback('f1', { external_id: 'ex-1', exercise_name: 'Goblet Squat' })] })
    );
    expect(once.some((i) => i.kind === 'repeated_report')).toBe(false);
    expect(INSIGHT_REPEAT_REPORT_THRESHOLD).toBe(2);
  });

  it('says too easy in the words that point at the coach', () => {
    const insights = programInsights(
      build({
        feedback: [
          feedback('f1', {
            reason: 'too_easy',
            branch: 'progression_note',
            outcome: 'logged_for_coach',
            exercise_name: 'Goblet Squat',
          }),
        ],
      })
    );
    const easy = insights.find((i) => i.kind === 'too_easy')!;
    expect(easy.text).toBe(
      'She said Goblet Squat felt too easy. She is waiting on you for more.'
    );
  });

  it('celebrates a weight that went up', () => {
    const insights = programInsights(
      build({
        workouts: [workout('w1', 1, 'completed'), workout('w2', 3, 'completed')],
        exercises: [
          exercise('e1', 'w1', 'ex-1', 'Goblet Squat', {
            logged_load: 20,
            logged_load_unit: 'lbs',
            logged_load_at: '2026-08-01T10:00:00Z',
          }),
          exercise('e2', 'w2', 'ex-1', 'Goblet Squat', {
            logged_load: 25,
            logged_load_unit: 'lbs',
            logged_load_at: '2026-08-15T10:00:00Z',
          }),
        ],
      })
    );
    const good = insights.find((i) => i.kind === 'load_progress')!;
    expect(good.tone).toBe('good');
    expect(good.text).toBe('She has taken Goblet Squat from 20 to 25 lbs.');
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(programInsights(build({}))).toEqual([]);
  });

  it('no insight anywhere contains an em dash', () => {
    const insights = programInsights(
      build({
        workouts: [workout('w1', 1, 'completed'), workout('w2', 1, 'skipped')],
        exercises: [
          exercise('e1', 'w1', 'ex-1', 'Goblet Squat', { status: 'skipped' }),
          exercise('e2', 'w2', 'ex-1', 'Goblet Squat', { status: 'skipped' }),
        ],
        feedback: [
          feedback('f1', { reason: 'pain', branch: 'safety', outcome: 'stopped_for_pain' }),
          feedback('f2', { reason: 'too_easy', branch: 'progression_note' }),
        ],
      })
    );
    for (const insight of insights) {
      expect(insight.text).not.toContain('—');
      expect(insight.text).not.toContain('–');
    }
  });
});

describe('one exercise, as the load rules see it', () => {
  it('reads pain, difficulty and completion off her own rows', () => {
    const exercises = [
      exercise('e1', 'w1', 'ex-1', 'Goblet Squat', { status: 'completed' }),
      exercise('e2', 'w2', 'ex-1', 'Goblet Squat', { status: 'completed', difficulty_rating: 'easy' }),
      exercise('e3', 'w3', 'ex-1', 'Goblet Squat', { status: 'skipped' }),
    ];
    const signals = build({ exercises });
    const read = loadSignalsForExercise(signals, 'ex-1', exercises);
    expect(read.completedOccurrences).toBe(2);
    expect(read.missedOccurrences).toBe(1);
    expect(read.reportedTooEasy).toBe(true);
    expect(read.reportedPain).toBe(false);
  });

  it('a stopped occurrence counts as pain even with no feedback row', () => {
    const exercises = [exercise('e1', 'w1', 'ex-1', 'Goblet Squat', { status: 'stopped' })];
    const read = loadSignalsForExercise(build({ exercises }), 'ex-1', exercises);
    expect(read.reportedPain).toBe(true);
  });
});
