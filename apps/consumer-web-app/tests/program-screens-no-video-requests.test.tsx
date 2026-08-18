/**
 * The member's program screens must never spend Your Move video quota by
 * being looked at.
 *
 * Modelled on tests/exercise-library-browse-no-video-requests.test.ts,
 * which proves the same thing for the browse grid. The allowance is 350
 * plays a month, so "opening a program fetched a video for every exercise
 * in it" would not be a small bug: one member opening one 10-exercise
 * workout twice a day would spend the whole month's allowance in under
 * three weeks without ever watching anything.
 *
 * Proved two ways, because either alone is weak:
 *
 *   1. STRUCTURALLY. The program screens never call fetch, never render a
 *      <video>, and never pass an autoplay or preload hint to the one
 *      component that can spend quota. TapToPlayVideo remains the only
 *      file in the product that requests a video URL at all.
 *
 *   2. BY RENDERING. The real components are rendered with real data and
 *      a spy on global fetch. Opening the workout, expanding an exercise
 *      and reaching any exercise in the guided walk-through produces zero
 *      requests and a poster with a play button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutWithContent,
} from '@mef/shared-types-contracts';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
}));
vi.mock('@/app/actions/coach-programs', () => ({
  updateMyAssignedWorkoutStatusAction: async () => ({}),
  updateMyAssignedWorkoutExerciseAction: async () => ({}),
}));

import { MemberAssignedWorkoutDetail } from '../components/coach-program-builder/MemberAssignedWorkoutDetail';
import { AssignedWorkoutGuidedSession } from '../components/coach-program-builder/AssignedWorkoutGuidedSession';
import { GuidedExerciseStage } from '../components/movement-sessions/GuidedSessionPlayer';
import { toGuidedWorkoutExercises } from '../lib/coach-program-builder/guidedWorkout';
import type { AssignedExerciseMediaMap } from '../lib/coach-program-builder/assignedWorkoutMedia';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const PROGRAM_SCREEN_FILES = [
  'components/coach-program-builder/MemberAssignedWorkoutDetail.tsx',
  'components/coach-program-builder/AssignedWorkoutGuidedSession.tsx',
  'components/movement-sessions/GuidedSessionPlayer.tsx',
  'components/movement-sessions/MovementSessionPlayer.tsx',
  'lib/coach-program-builder/assignedWorkoutMedia.ts',
  'lib/coach-program-builder/guidedWorkout.ts',
];

// ---------------------------------------------------------------------------
// Fixtures — one workout with two exercises, dosed the way the generator
// now doses them.
// ---------------------------------------------------------------------------

function exercise(overrides: Partial<CoachAssignedWorkoutExercise>): CoachAssignedWorkoutExercise {
  return {
    id: 'exercise-1',
    assigned_workout_id: 'workout-1',
    section_id: 'section-1',
    member_id: 'member-1',
    coach_id: 'coach-1',
    provider: 'your_move',
    external_id: 'ext-1',
    exercise_name: 'Quadriceps Roll',
    sequence_index: 0,
    status: 'not_started',
    completed_at: null,
    member_notes: null,
    difficulty_rating: null,
    comfort_rating: null,
    selection_reasoning: 'Foam-roll release for hip flexors, tight in Lower Cross.',
    created_at: '2026-08-17T00:00:00Z',
    sets: 1,
    reps: null,
    rep_range_low: null,
    rep_range_high: null,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: 15,
    tempo: null,
    rpe: null,
    load: null,
    load_unit: null,
    resistance: null,
    band_color: null,
    side: null,
    unilateral: false,
    hold_duration_seconds: 60,
    frequency: null,
    priority: 'medium',
    is_required: true,
    notes: null,
    coaching_cues: 'Keep the roll slow and breathe out on the tender spots.',
    pain_modification_notes: null,
    alternate_exercises: {},
    ...overrides,
  };
}

const WORKOUT: CoachAssignedWorkoutWithContent = {
  id: 'workout-1',
  assignment_id: 'assignment-1',
  member_id: 'member-1',
  coach_id: 'coach-1',
  scheduled_date: '2026-08-18',
  occurrence_label: null,
  template_name: 'Corrective: Lower Cross: Session A',
  description: 'Auto-generated 4-week corrective phase.',
  goal: 'corrective',
  difficulty: 'intermediate',
  estimated_duration_minutes: null,
  equipment: ['bodyweight', 'foam roller'],
  program_tags: [],
  corrective_tags: ['lower_cross'],
  movement_tags: [],
  target_muscles: [],
  member_instructions: null,
  coach_notes: null,
  internal_notes: null,
  status: 'not_started',
  started_at: null,
  completed_at: null,
  skipped_at: null,
  member_feedback: null,
  published_at: '2026-08-17T00:00:00Z',
  source_prescription_snapshot_id: null,
  created_at: '2026-08-17T00:00:00Z',
  updated_at: '2026-08-17T00:00:00Z',
  sections: [
    {
      id: 'section-1',
      assigned_workout_id: 'workout-1',
      member_id: 'member-1',
      coach_id: 'coach-1',
      name: 'Release',
      section_type: 'corrective',
      sequence_index: 0,
      block_reasoning: 'Myofascial release for this member’s tight muscles.',
      created_at: '2026-08-17T00:00:00Z',
      exercises: [exercise({})],
    },
    {
      id: 'section-2',
      assigned_workout_id: 'workout-1',
      member_id: 'member-1',
      coach_id: 'coach-1',
      name: 'Stability',
      section_type: 'activation',
      sequence_index: 1,
      block_reasoning: 'The main corrective work.',
      created_at: '2026-08-17T00:00:00Z',
      exercises: [
        exercise({
          id: 'exercise-2',
          section_id: 'section-2',
          external_id: 'ext-2',
          exercise_name: 'Glute Bridge',
          sets: 2,
          reps: '10',
          rep_range_low: 10,
          rep_range_high: 10,
          hold_duration_seconds: null,
          tempo: '3-1-3',
          rest_seconds: 45,
          selection_reasoning: 'Stability work for glutes, long in Lower Cross.',
          coaching_cues: 'Drive through the heels and keep the ribs down.',
        }),
      ],
    },
  ],
};

const MEDIA: AssignedExerciseMediaMap = {
  'ext-1': {
    primaryMuscle: 'quadriceps',
    category: 'mobility',
    posterUrl: 'https://example.test/posters/ext-1.jpg',
    cues: ['Roll slowly.'],
  },
  'ext-2': {
    primaryMuscle: 'glutes',
    category: 'strength',
    posterUrl: 'https://example.test/posters/ext-2.jpg',
    cues: ['Squeeze at the top.'],
  },
};

// ---------------------------------------------------------------------------
// 1. Structurally
// ---------------------------------------------------------------------------

describe('the program screens cannot request a video', () => {
  it('never passes an autoplay, a reset key or a preload hint to the video component', () => {
    for (const relative of PROGRAM_SCREEN_FILES) {
      const source = read(relative);
      expect(source, `${relative} passes autoPlayKey`).not.toMatch(/autoPlayKey/);
      expect(source, `${relative} passes autoPlay`).not.toMatch(/autoPlay/);
      expect(source, `${relative} preloads media`).not.toMatch(/preload=/);
    }
  });

  it('never calls fetch and never renders a video element itself', () => {
    for (const relative of PROGRAM_SCREEN_FILES) {
      const source = read(relative);
      expect(source, `${relative} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${relative} renders a video element`).not.toMatch(/<video/);
      expect(source, `${relative} references the video-url route`).not.toMatch(/video-url/);
    }
  });

  it('leaves TapToPlayVideo as the only file in the product that requests a video URL', () => {
    // The whole app tree, minus the route that serves the URL and the
    // tests that assert about it.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'tests') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        if (/fetch\(`\/api\/exercises\/\$\{[^}]+\}\/video-url`\)/.test(source)) {
          hits.push(path.relative(ROOT, full));
        }
      }
    };
    walk(ROOT);
    expect(hits).toEqual(['components/exercise-library/TapToPlayVideo.tsx']);
  });

  it('TapToPlayVideo still only fetches from its own tap handler', () => {
    const source = read('components/exercise-library/TapToPlayVideo.tsx');
    // The fetch lives inside handlePlay, and handlePlay is only reachable
    // from the button's onClick. No effect, no mount-time call.
    expect(source).not.toMatch(/useEffect/);
    expect(source).toMatch(/onClick=\{handlePlay\}/);
  });
});

// ---------------------------------------------------------------------------
// 2. By rendering
// ---------------------------------------------------------------------------

describe('opening the workout makes no video request', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the list view with posters and play buttons and zero requests', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={WORKOUT} media={MEDIA} />
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).not.toContain('<video');
    // Both exercises expand by default (status not_started), so both show
    // their poster and a play button.
    expect(html).toContain('https://example.test/posters/ext-1.jpg');
    expect(html).toContain('https://example.test/posters/ext-2.jpg');
    expect(html.match(/aria-label="Play exercise video"/g)).toHaveLength(2);
  });

  it('shows the full prescription, the cues and the reasoning for each exercise', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={WORKOUT} media={MEDIA} />
    );

    expect(html).toContain('1 set of 1 minute');
    expect(html).toContain('15 seconds rest');
    expect(html).toContain('2 sets of 10 reps');
    expect(html).toContain('Tempo 3-1-3');
    expect(html).toContain('45 seconds rest');
    expect(html).toContain('Keep the roll slow');
    expect(html).toContain('Why this exercise');
    expect(html).toContain('Stability work for glutes');
  });

  it('keeps the difficulty, comfort, notes and status controls exactly as they were', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={WORKOUT} media={MEDIA} />
    );
    expect(html).toContain('Difficulty');
    expect(html).toContain('Comfort');
    expect(html).toContain('Notes (optional)');
    for (const label of ['Completed', 'Partial', 'Skipped']) {
      expect(html).toContain(label);
    }
  });

  it('offers the walk-through as well as the list, and neither fetches anything', () => {
    const list = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={WORKOUT} media={MEDIA} />
    );
    expect(list).toContain('Walk me through it');

    const guided = renderToStaticMarkup(
      <AssignedWorkoutGuidedSession workout={WORKOUT} media={MEDIA} onExitToList={() => {}} />
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(guided).not.toContain('<video');
    expect(guided).toContain('Start the walk-through');
    expect(guided).toContain('Quadriceps Roll');
    expect(guided).toContain('Glute Bridge');
  });

  it('reaching any exercise in the walk-through shows a poster, not a video, and requests nothing', () => {
    const exercises = toGuidedWorkoutExercises(WORKOUT, MEDIA);
    expect(exercises).toHaveLength(2);

    exercises.forEach((walked, index) => {
      const html = renderToStaticMarkup(
        <GuidedExerciseStage
          exercise={walked}
          index={index}
          total={exercises.length}
          nextLabel="Mark done"
          finishLabel="Mark done and finish"
          skipLabel="Skip this one"
          onNext={() => {}}
          onSkip={() => {}}
          onLeave={() => {}}
        />
      );

      expect(fetchSpy, `exercise ${index + 1} triggered a fetch`).not.toHaveBeenCalled();
      expect(html).not.toContain('<video');
      expect(html).toContain('aria-label="Play exercise video"');
      expect(html).toContain(walked.name);
      expect(html).toContain(walked.prescription!);
      expect(html).toContain('Skip this one');
    });
  });

  it('walks every exercise the coach put in, in the coach’s order, with the rest stated once', () => {
    const exercises = toGuidedWorkoutExercises(WORKOUT, MEDIA);
    expect(exercises.map((e) => e.name)).toEqual(['Quadriceps Roll', 'Glute Bridge']);
    expect(exercises.map((e) => e.sectionName)).toEqual(['Release', 'Stability']);

    // The prescription line the stage shows carries no rest, because the
    // stage prints the rest as its own sentence underneath it.
    expect(exercises[0]!.prescription).toBe('1 set of 1 minute');
    expect(exercises[0]!.rest).toBe('15 seconds rest');
    expect(exercises[1]!.prescription).toBe('2 sets of 10 reps · Tempo 3-1-3');
    expect(exercises[1]!.rest).toBe('45 seconds rest');
  });
});
