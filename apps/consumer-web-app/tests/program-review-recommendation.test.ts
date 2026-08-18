/**
 * THE LADDER. What the end-of-phase review recommends, against seeded
 * histories, rung by rung.
 *
 * Every test here is written as "given this phase, a coach should be
 * offered this". The order of the rungs is the coaching, so the tests that
 * matter most are the ones proving a rung BEATS the one below it: pain
 * beats a good completion rate, a blocked readiness gate beats a bad one.
 */
import { describe, it, expect } from 'vitest';
import type { ProgramSignals } from '../lib/programs/signals/aggregate';
import {
  COACH_REVIEW_REQUIRED,
  COACH_REVIEW_REQUIRED_HEADLINE,
  ROTATE_FRICTION_THRESHOLD,
  STRONG_COMPLETION_PERCENT,
  frictionExerciseCount,
  recommendNextPhase,
} from '../lib/programs/review/recommend';
import { REVIEW_OUTCOMES, REVIEW_OUTCOME_KEYS } from '../lib/programs/review/outcomes';
import type { ReadinessGateResult } from '../lib/programs/readiness/gate';

function signals(overrides: Partial<ProgramSignals> = {}): ProgramSignals {
  const base: ProgramSignals = {
    groupKey: 'group-1',
    programName: 'Test Program',
    isCorrectiveProgram: false,
    totalSessions: 12,
    completedSessions: 10,
    skippedSessions: 1,
    completionPercent: 83,
    weeks: [],
    skippedExercises: [],
    stoppedExercises: [],
    swaps: [],
    painReports: [],
    tooEasyFlags: [],
    tooDifficultFlags: [],
    otherReports: [],
    difficultyTrend: [],
    comfortTrend: [],
    loadTrends: [],
    avoidance: [],
    hasOpenPainReport: false,
  };
  return { ...base, ...overrides };
}

function painReport(exerciseName: string, resolvedAt: string | null = null) {
  return {
    feedbackId: `f-${exerciseName}`,
    exerciseName,
    externalId: `ex-${exerciseName}`,
    otherText: null,
    programWeek: 2,
    at: '2026-08-05T00:00:00Z',
    resolvedAt,
    resolutionNote: null,
  };
}

function flag(exerciseName: string) {
  return {
    feedbackId: `f-${exerciseName}`,
    exerciseName,
    externalId: `ex-${exerciseName}`,
    programWeek: 1,
    at: '2026-08-05T00:00:00Z',
    resolvedAt: null,
  };
}

const NOT_BLOCKED: ReadinessGateResult = { blocked: false };
const BLOCKED: ReadinessGateResult = {
  blocked: true,
  blockReason: 'extremely_poor_readiness',
  recommendedAlternative: 'recovery_session',
};

describe('rung 1: safety leads by recommending nothing', () => {
  it('an unreviewed pain report recommends NO outcome, whatever the completion rate says', () => {
    const result = recommendNextPhase({
      signals: signals({
        completionPercent: 100,
        completedSessions: 12,
        painReports: [painReport('Bird Dog')],
        hasOpenPainReport: true,
      }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBeNull();
    expect(result.headline).toBe(COACH_REVIEW_REQUIRED_HEADLINE);
    expect(result.headline).toBe('Coach review required');
    expect(result.requiresCoachReview).toBe(true);
    expect(result.reasoning).toContain('Bird Dog');
  });

  it('never recommends rotate, progress or repeat while pain is unreviewed', () => {
    // The old behaviour rotated a whole phase because one movement hurt.
    // Every one of the three is now off the table until a person has read it.
    for (const state of [
      signals({ completionPercent: 100, completedSessions: 12 }),
      signals({ completionPercent: 20, completedSessions: 2 }),
      signals({ completionPercent: 60, completedSessions: 7, tooDifficultFlags: [flag('A'), flag('B')] }),
      signals({
        completionPercent: 60,
        completedSessions: 7,
        skippedExercises: [
          { provider: 'your_move', externalId: 'ex-1', exerciseName: 'Dead Bug', count: 3 },
          { provider: 'your_move', externalId: 'ex-2', exerciseName: 'Plank', count: 2 },
        ],
      }),
    ]) {
      const result = recommendNextPhase({
        signals: { ...state, painReports: [painReport('Bird Dog')], hasOpenPainReport: true },
        readiness: NOT_BLOCKED,
        phaseIsOver: true,
      });
      expect(result.outcome).toBeNull();
      expect(result.reasoning.toLowerCase()).not.toContain('rotating keeps');
    }
  });

  it('lists the pain reports first, so the coach reads them before the paragraph', () => {
    const result = recommendNextPhase({
      signals: signals({
        painReports: [painReport('Bird Dog'), painReport('Split Squat')],
        hasOpenPainReport: true,
      }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.painFirst.map((r) => r.exerciseName)).toEqual(['Bird Dog', 'Split Squat']);
    expect(result.painFirst[0]!.feedbackId).toBe('f-Bird Dog');
    expect(result.basis.openPainReports).toBe(2);
  });

  it('beats a blocked readiness gate too', () => {
    const result = recommendNextPhase({
      signals: signals({ painReports: [painReport('Bird Dog')], hasOpenPainReport: true }),
      readiness: BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBeNull();
  });

  it('a RESOLVED pain report no longer drives the recommendation, and gating resumes', () => {
    const result = recommendNextPhase({
      signals: signals({
        painReports: [painReport('Bird Dog', '2026-08-10T00:00:00Z')],
        hasOpenPainReport: false,
      }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('progress_next_phase');
    expect(result.requiresCoachReview).toBe(false);
    expect(result.painFirst).toEqual([]);
  });

  it('every other rung recommends a real outcome and lists no pain', () => {
    const everyOtherRung = [
      recommendNextPhase({ signals: signals(), readiness: NOT_BLOCKED, phaseIsOver: true }),
      recommendNextPhase({ signals: signals(), readiness: BLOCKED, phaseIsOver: true }),
      recommendNextPhase({
        signals: signals({ completedSessions: 0, completionPercent: 0 }),
        readiness: NOT_BLOCKED,
        phaseIsOver: true,
      }),
    ];
    for (const result of everyOtherRung) {
      expect(result.outcome).not.toBeNull();
      expect(result.requiresCoachReview).toBe(false);
      expect(result.painFirst).toEqual([]);
      expect(result.headline).not.toBe(COACH_REVIEW_REQUIRED_HEADLINE);
    }
  });
});

describe('rung 2: a phase nothing happened in', () => {
  it('recommends closing it out, but only once the phase is actually over', () => {
    const over = recommendNextPhase({
      signals: signals({ completedSessions: 0, completionPercent: 0, totalSessions: 12 }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(over.outcome).toBe('complete_and_archive');

    const midPhase = recommendNextPhase({
      signals: signals({ completedSessions: 0, completionPercent: 0, totalSessions: 12 }),
      readiness: NOT_BLOCKED,
      phaseIsOver: false,
    });
    expect(midPhase.outcome).toBe('repeat_phase');
  });
});

describe('rung 3: readiness', () => {
  it('a blocked gate recommends a recovery week, in the gate’s own words', () => {
    const result = recommendNextPhase({
      signals: signals(),
      readiness: BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('recovery_week');
    expect(result.reasoning).toContain('sleep, stress and energy');
    expect(result.basis.readinessBlocked).toBe(true);
  });

  it('a member with no readiness data at all simply skips the rung', () => {
    const result = recommendNextPhase({
      signals: signals(),
      readiness: null,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('progress_next_phase');
    expect(result.basis.readinessBlocked).toBe(false);
  });
});

describe('rung 4: she missed too much of it', () => {
  it('recommends repeating, and says the numbers rather than judging her', () => {
    const result = recommendNextPhase({
      signals: signals({ completedSessions: 4, totalSessions: 12, completionPercent: 33 }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('repeat_phase');
    expect(result.reasoning).toContain('4 of 12 sessions');
    expect(result.reasoning).toContain('without treating the gap as failure');
  });
});

describe('rung 5: it was too hard', () => {
  it('two too-difficult reports recommend repeating', () => {
    const result = recommendNextPhase({
      signals: signals({ tooDifficultFlags: [flag('Split Squat'), flag('Push Up')] }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('repeat_phase');
    expect(result.reasoning).toContain('Split Squat and Push Up');
  });

  it('one is not enough to stop a good phase progressing', () => {
    const result = recommendNextPhase({
      signals: signals({ tooDifficultFlags: [flag('Split Squat')] }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('progress_next_phase');
  });
});

describe('rung 6: she keeps working around specific movements', () => {
  it('recommends rotating once enough exercises have friction on them', () => {
    const result = recommendNextPhase({
      signals: signals({
        completionPercent: 60,
        completedSessions: 7,
        skippedExercises: [
          { provider: 'your_move', externalId: 'ex-1', exerciseName: 'Dead Bug', count: 3 },
          { provider: 'your_move', externalId: 'ex-2', exerciseName: 'Plank', count: 2 },
        ],
      }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('rotate_exercises');
    expect(result.basis.frictionExercises).toBe(ROTATE_FRICTION_THRESHOLD);
  });

  it('counts a skipped-twice, a report and a swap as friction, and an unrepeated skip as none', () => {
    const count = frictionExerciseCount(
      signals({
        skippedExercises: [
          { provider: 'your_move', externalId: 'ex-1', exerciseName: 'Dead Bug', count: 2 },
          { provider: 'your_move', externalId: 'ex-9', exerciseName: 'Once Only', count: 1 },
        ],
        otherReports: [flag('Plank')],
        swaps: [
          {
            fromExerciseName: 'Goblet Squat',
            toExerciseName: 'Bodyweight Squat',
            reasonLabel: 'no equipment',
            otherText: null,
            occurrencesUpdated: 4,
            at: '2026-08-05T00:00:00Z',
          },
        ],
      })
    );
    expect(count).toBe(3);
  });
});

describe('rung 7: the green path', () => {
  it('recommends progressing, and names the too-easy exercise as her asking for more', () => {
    const result = recommendNextPhase({
      signals: signals({
        completionPercent: 92,
        completedSessions: 11,
        tooEasyFlags: [flag('Goblet Squat')],
      }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('progress_next_phase');
    expect(result.reasoning).toContain('Goblet Squat');
    expect(result.reasoning).toContain('which is her asking for more');
  });

  it('needs a real completion rate for it', () => {
    const justUnder = recommendNextPhase({
      signals: signals({ completionPercent: STRONG_COMPLETION_PERCENT - 5, completedSessions: 8 }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(justUnder.outcome).toBe('repeat_phase');
  });
});

describe('rung 8: mixed', () => {
  it('repeats, and says out loud that a coach may know better', () => {
    const result = recommendNextPhase({
      signals: signals({ completionPercent: 58, completedSessions: 7 }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBe('repeat_phase');
    expect(result.reasoning).toContain('any of the other options is one tap away');
  });
});

describe('the vocabulary', () => {
  it('is exactly the six locked outcomes, and no seventh', () => {
    expect(REVIEW_OUTCOME_KEYS).toEqual([
      'progress_next_phase',
      'rotate_exercises',
      'repeat_phase',
      'recovery_week',
      'different_program',
      'complete_and_archive',
    ]);
  });

  it('"coach review required" is not one of the six a coach may choose', () => {
    // It is what the ENGINE stored when it recommended nothing. It is not an
    // outcome: no button offers it, and no draft is built from it.
    expect(REVIEW_OUTCOME_KEYS).not.toContain(COACH_REVIEW_REQUIRED);
    expect(REVIEW_OUTCOMES.some((o) => o.key === (COACH_REVIEW_REQUIRED as never))).toBe(false);
  });

  it('all six stay available even while pain is unreviewed', () => {
    // The engine recommends nothing, and blocks nothing. A coach who has
    // read the report can still take any of the six in one tap.
    const result = recommendNextPhase({
      signals: signals({ painReports: [painReport('Bird Dog')], hasOpenPainReport: true }),
      readiness: NOT_BLOCKED,
      phaseIsOver: true,
    });
    expect(result.outcome).toBeNull();
    expect(REVIEW_OUTCOMES).toHaveLength(6);
    expect(result.reasoning).toContain('which stay available whatever this says');
  });

  it('states as data that no outcome publishes', () => {
    for (const outcome of REVIEW_OUTCOMES) {
      expect(outcome.publishes, outcome.key).toBe(false);
    }
  });

  it('every outcome that builds a program says "draft" in its confirm', () => {
    for (const outcome of REVIEW_OUTCOMES) {
      if (!outcome.producesProgramDraft) continue;
      expect(outcome.confirm.toLowerCase(), outcome.key).toContain('draft');
      expect(outcome.confirm.toLowerCase(), outcome.key).toContain('until you approve it');
    }
  });

  it('no recommendation and no outcome copy contains an em dash', () => {
    const texts = [
      ...REVIEW_OUTCOMES.flatMap((o) => [o.label, o.description, o.confirm]),
      recommendNextPhase({ signals: signals(), readiness: NOT_BLOCKED, phaseIsOver: true }).reasoning,
      recommendNextPhase({
        signals: signals({ painReports: [painReport('Bird Dog')], hasOpenPainReport: true }),
        readiness: NOT_BLOCKED,
        phaseIsOver: true,
      }).reasoning,
      recommendNextPhase({ signals: signals(), readiness: BLOCKED, phaseIsOver: true }).reasoning,
    ];
    for (const text of texts) {
      expect(text).not.toContain('—');
      expect(text).not.toContain('–');
    }
  });
});
