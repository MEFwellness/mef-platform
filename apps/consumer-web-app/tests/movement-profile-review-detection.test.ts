import { describe, it, expect } from 'vitest';
import { detectMovementProfileReviewSignals } from '../lib/movement-profile/reviewDetection';
import type {
  ExerciseComfortRating,
  ExerciseCompletionStatus,
  ExerciseDifficultyRating,
} from '@mef/shared-types-contracts';

type HistoryEntry = {
  status: ExerciseCompletionStatus;
  comfort_rating: ExerciseComfortRating | null;
  difficulty_rating: ExerciseDifficultyRating | null;
};

function completion(overrides: {
  status?: ExerciseCompletionStatus;
  comfort_rating?: ExerciseComfortRating | null;
  difficulty_rating?: ExerciseDifficultyRating | null;
}): HistoryEntry {
  return {
    status: overrides.status ?? 'completed',
    comfort_rating: overrides.comfort_rating ?? null,
    difficulty_rating: overrides.difficulty_rating ?? null,
  };
}

const EXERCISE_NAME = 'Bird Dog';

describe('detectMovementProfileReviewSignals', () => {
  it('raises no signals for an uneventful completion with no history', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ comfort_rating: 'comfortable', difficulty_rating: 'appropriate' }) },
      []
    );
    expect(signals).toEqual([]);
  });

  it('flags a new_pain_report the first time pain is rated for an exercise', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ comfort_rating: 'pain' }) },
      [completion({ comfort_rating: 'comfortable' })]
    );
    expect(signals.map((s) => s.reviewType)).toContain('new_pain_report');
  });

  it('does not re-flag new_pain_report when pain was already reported before', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ comfort_rating: 'pain' }) },
      [completion({ comfort_rating: 'pain' })]
    );
    expect(signals.map((s) => s.reviewType)).not.toContain('new_pain_report');
  });

  it('flags increased_discomfort when comfort worsens to moderate_discomfort or worse from a better prior rating', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ comfort_rating: 'moderate_discomfort' }) },
      [completion({ comfort_rating: 'comfortable' })]
    );
    expect(signals.map((s) => s.reviewType)).toContain('increased_discomfort');
  });

  it('does not flag increased_discomfort when comfort stays the same or improves', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ comfort_rating: 'slight_discomfort' }) },
      [completion({ comfort_rating: 'moderate_discomfort' })]
    );
    expect(signals.map((s) => s.reviewType)).not.toContain('increased_discomfort');
  });

  it('flags repeated_inability after 3 consecutive skips of the same exercise', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ status: 'skipped' }) },
      [completion({ status: 'skipped' }), completion({ status: 'skipped' })]
    );
    expect(signals.map((s) => s.reviewType)).toContain('repeated_inability');
  });

  it('does not flag repeated_inability when only 2 of the last 3 were skipped', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ status: 'skipped' }) },
      [completion({ status: 'completed' }), completion({ status: 'skipped' })]
    );
    expect(signals.map((s) => s.reviewType)).not.toContain('repeated_inability');
  });

  it('flags possible_progression after 3 consecutive easy/very_easy difficulty ratings', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ difficulty_rating: 'very_easy' }) },
      [completion({ difficulty_rating: 'easy' }), completion({ difficulty_rating: 'very_easy' })]
    );
    expect(signals.map((s) => s.reviewType)).toContain('possible_progression');
  });

  it('flags possible_regression after 2 consecutive very_difficult ratings', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ difficulty_rating: 'very_difficult' }) },
      [completion({ difficulty_rating: 'very_difficult' })]
    );
    expect(signals.map((s) => s.reviewType)).toContain('possible_regression');
  });

  it('does not flag possible_regression from a single very_difficult rating', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ difficulty_rating: 'very_difficult' }) },
      [completion({ difficulty_rating: 'appropriate' })]
    );
    expect(signals.map((s) => s.reviewType)).not.toContain('possible_regression');
  });

  it('can raise more than one signal from a single completion', () => {
    const signals = detectMovementProfileReviewSignals(
      { exercise_name: EXERCISE_NAME, ...completion({ status: 'skipped', comfort_rating: 'pain' }) },
      [completion({ status: 'skipped' }), completion({ status: 'skipped' })]
    );
    const types = signals.map((s) => s.reviewType);
    expect(types).toContain('new_pain_report');
    expect(types).toContain('repeated_inability');
  });
});
