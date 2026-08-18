/**
 * THE LOAD RULES, as the coach's review revised them. Pure arithmetic over
 * the coach-editable tables, so every assertion here reads as a sentence
 * about coaching rather than about code.
 *
 * FOUR RULES THE WHOLE FEATURE RESTS ON, and each has its own describe block
 * at the top of this file. If any of them goes red, the app has started
 * prescribing:
 *
 *   no logged weight, no suggestion;
 *   no load ever changes because the program reached another week;
 *   an increase needs two completed sessions at the weight she is on;
 *   an unreviewed pain report removes the suggestion instead of holding it.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSERVATIVE_INCREMENTS_KG,
  CONSERVATIVE_INCREMENTS_LBS,
  MIN_PROGRAM_COMPLETION_FOR_INCREASE,
  MIN_SUCCESSFUL_LOGS_AT_LOAD,
  MIN_SUGGESTED_LOAD,
  NO_SUGGESTION_PENDING_PAIN_REVIEW,
  PRACTICAL_INCREMENT,
  REPEATED_SKIP_THRESHOLD_FOR_LOAD,
  STANDARD_INCREMENTS_KG,
  STANDARD_INCREMENTS_LBS,
  SUGGESTIONS_BEGIN_AFTER_TWO_LOGS,
  TOO_DIFFICULT_REDUCTION_PERCENT,
  UNDULATING_MODEL_PARKED,
  gateForSignals,
  incrementFor,
  landsOnPracticalIncrement,
  loadRuleRows,
  practicalIncrementFor,
  resolveModel,
  roundDownToPracticalStep,
  suggestLoad,
  type ExerciseLoadSignals,
} from '../lib/programs/progression/loadRules';
import type { BlueprintBlock } from '@mef/shared-types-contracts';
import type { LoggedLoadUnit } from '../lib/programs/weightLogging';

/** A member who has earned the next step: two completions at this weight, nothing flagged, a phase she actually did. */
const EARNED: ExerciseLoadSignals = {
  reportedPain: false,
  hasUnreviewedPain: false,
  reportedTooDifficult: false,
  reportedTooEasy: false,
  completedOccurrences: 4,
  missedOccurrences: 0,
  successfulLogsAtCurrentLoad: 2,
  programCompletionPercent: 83,
};

function signals(overrides: Partial<ExerciseLoadSignals> = {}): ExerciseLoadSignals {
  return { ...EARNED, ...overrides };
}

const LOADABLE_BLOCKS: BlueprintBlock[] = ['stability', 'strength', 'core'];
const ALL_BLOCKS: BlueprintBlock[] = ['release', 'mobility', 'stability', 'strength', 'core'];
const UNITS: LoggedLoadUnit[] = ['lbs', 'kg'];

// ---------------------------------------------------------------------

describe('no logged weight, no suggestion, ever', () => {
  const everySignalState: ExerciseLoadSignals[] = [
    EARNED,
    signals({ reportedTooEasy: true }),
    signals({ reportedTooDifficult: true }),
    signals({ reportedPain: true }),
    signals({ reportedPain: true, hasUnreviewedPain: true }),
    signals({ completedOccurrences: 0, missedOccurrences: 4, successfulLogsAtCurrentLoad: 0 }),
  ];

  it('returns null for every block, every model and every signal state', () => {
    for (const block of ALL_BLOCKS) {
      for (const model of ['linear', 'undulating'] as const) {
        for (const state of everySignalState) {
          expect(
            suggestLoad({
              block,
              lastLoggedLoad: null,
              lastLoggedUnit: 'lbs',
              lastLoggedPerSide: false,
              model,
              pace: 'standard',
              signals: state,
            }),
            `${block} / ${model}`
          ).toBeNull();
        }
      }
    }
  });

  it('treats a zero or negative logged weight as no logged weight', () => {
    for (const load of [0, -5]) {
      expect(
        suggestLoad({
          block: 'strength',
          lastLoggedLoad: load,
          lastLoggedUnit: 'lbs',
          lastLoggedPerSide: false,
          model: 'linear',
          pace: 'standard',
          signals: EARNED,
        })
      ).toBeNull();
    }
  });
});

describe('no load ever changes because the program entered another week', () => {
  it('produces an identical suggestion for every week of a phase, in both models', () => {
    for (const model of ['linear', 'undulating'] as const) {
      for (const state of [EARNED, signals({ successfulLogsAtCurrentLoad: 1 }), signals({ reportedTooDifficult: true })]) {
        const forWeek = (week: number) =>
          suggestLoad({
            block: 'strength',
            lastLoggedLoad: 50,
            lastLoggedUnit: 'lbs',
            lastLoggedPerSide: false,
            model,
            pace: 'standard',
            signals: state,
            weekOfNextPhase: week,
          })!;

        const baseline = forWeek(1);
        for (const week of [2, 3, 4, 5, 8, 13]) {
          const later = forWeek(week);
          expect(later.suggestedLoad, `${model} week ${week}`).toBe(baseline.suggestedLoad);
          expect(later.direction, `${model} week ${week}`).toBe(baseline.direction);
          expect(later.reason, `${model} week ${week}`).toBe(baseline.reason);
        }
      }
    }
  });

  it('no reason a coach reads mentions a week, a wave or a percentage of a wave', () => {
    for (const week of [1, 2, 3, 4]) {
      const suggestion = suggestLoad({
        block: 'strength',
        lastLoggedLoad: 50,
        lastLoggedUnit: 'lbs',
        lastLoggedPerSide: false,
        model: 'undulating',
        pace: 'standard',
        signals: EARNED,
        weekOfNextPhase: week,
      })!;
      expect(suggestion.reason.toLowerCase()).not.toContain('week');
      expect(suggestion.reason.toLowerCase()).not.toContain('wave');
    }
  });

  it('the undulating model is parked, and an undulating blueprint is applied as linear', () => {
    expect(UNDULATING_MODEL_PARKED).toBe(true);
    const resolved = resolveModel({
      periodization: 'undulating',
      isCorrectiveProgram: false,
      hasOpenPainReport: false,
    });
    expect(resolved.model).toBe('linear');
    // The blueprint's own field is not lost, only not applied.
    expect(resolved.blueprintModel).toBe('undulating');
    expect(resolved.why).toContain('parked');
  });
});

describe('an increase is earned, gate by gate', () => {
  it('needs two completed sessions at the weight she is on', () => {
    expect(MIN_SUCCESSFUL_LOGS_AT_LOAD).toBe(2);
    expect(gateForSignals(signals({ successfulLogsAtCurrentLoad: 0 })).direction).toBe('hold');
    expect(gateForSignals(signals({ successfulLogsAtCurrentLoad: 1 })).direction).toBe('hold');
    expect(gateForSignals(signals({ successfulLogsAtCurrentLoad: 2 })).direction).toBe('increase');
  });

  it('says so warmly when one log is all she has, and holds her at that weight', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 22.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: signals({ successfulLogsAtCurrentLoad: 1 }),
    })!;
    expect(suggestion.direction).toBe('hold');
    expect(suggestion.suggestedLoad).toBe(22.5);
    expect(suggestion.reason).toBe(SUGGESTIONS_BEGIN_AFTER_TWO_LOGS);
    expect(suggestion.reason).not.toContain('—');
  });

  it('every blocker suppresses the increase, one at a time', () => {
    const blockers: [string, Partial<ExerciseLoadSignals>, string][] = [
      ['unreviewed pain', { hasUnreviewedPain: true, reportedPain: true }, 'needs_review'],
      ['too difficult', { reportedTooDifficult: true }, 'reduce'],
      ['a resolved pain report', { reportedPain: true }, 'hold'],
      ['nothing completed', { completedOccurrences: 0, successfulLogsAtCurrentLoad: 0 }, 'hold'],
      ['repeated skipping', { missedOccurrences: REPEATED_SKIP_THRESHOLD_FOR_LOAD }, 'hold'],
      [
        'low program completion',
        { programCompletionPercent: MIN_PROGRAM_COMPLETION_FOR_INCREASE - 1 },
        'hold',
      ],
      ['one log at this weight', { successfulLogsAtCurrentLoad: 1 }, 'hold'],
    ];
    for (const [label, overrides, expected] of blockers) {
      expect(gateForSignals(signals(overrides)).direction, label).toBe(expected);
      expect(gateForSignals(signals(overrides)).direction, label).not.toBe('increase');
    }
  });

  it('one skip is a Tuesday and does not block, two is a pattern and does', () => {
    expect(gateForSignals(signals({ missedOccurrences: 1 })).direction).toBe('increase');
    expect(gateForSignals(signals({ missedOccurrences: 2 })).direction).toBe('hold');
  });

  it('completion right on the threshold is enough, one point below is not', () => {
    expect(
      gateForSignals(signals({ programCompletionPercent: MIN_PROGRAM_COMPLETION_FOR_INCREASE }))
        .direction
    ).toBe('increase');
    expect(
      gateForSignals(signals({ programCompletionPercent: MIN_PROGRAM_COMPLETION_FOR_INCREASE - 1 }))
        .direction
    ).toBe('hold');
  });

  it('"too easy" never moves a number by itself, it only earns a mention', () => {
    // She said it, but she has only done the weight once. No increase.
    expect(
      gateForSignals(signals({ reportedTooEasy: true, successfulLogsAtCurrentLoad: 1 })).direction
    ).toBe('hold');
    // She said it and she has earned it. The reason says both.
    const earned = gateForSignals(signals({ reportedTooEasy: true }));
    expect(earned.direction).toBe('increase');
    expect(earned.reason).toContain('too easy');
  });

  it('too difficult beats a resolved pain report, because a step back beats a hold', () => {
    expect(gateForSignals(signals({ reportedPain: true, reportedTooDifficult: true })).direction).toBe(
      'reduce'
    );
  });
});

describe('an unreviewed pain report removes the suggestion', () => {
  it('produces no number at all, in every block, at every pace', () => {
    for (const block of LOADABLE_BLOCKS) {
      for (const pace of ['standard', 'conservative'] as const) {
        const suggestion = suggestLoad({
          block,
          lastLoggedLoad: 30,
          lastLoggedUnit: 'lbs',
          lastLoggedPerSide: false,
          model: 'linear',
          pace,
          signals: signals({ reportedPain: true, hasUnreviewedPain: true }),
        })!;
        expect(suggestion.direction, `${block} / ${pace}`).toBe('needs_review');
        expect(suggestion.suggestedLoad, `${block} / ${pace}`).toBeNull();
      }
    }
  });

  it('says exactly the intent, and never "hold at current weight"', () => {
    expect(NO_SUGGESTION_PENDING_PAIN_REVIEW).toBe(
      'No load suggestion. Pain feedback needs coach review first.'
    );
    expect(NO_SUGGESTION_PENDING_PAIN_REVIEW.toLowerCase()).not.toContain('hold');
    expect(gateForSignals(signals({ hasUnreviewedPain: true })).reason).toBe(
      NO_SUGGESTION_PENDING_PAIN_REVIEW
    );
  });

  it('beats every other signal, including a perfect history', () => {
    expect(
      gateForSignals(
        signals({
          hasUnreviewedPain: true,
          reportedTooEasy: true,
          reportedTooDifficult: true,
          successfulLogsAtCurrentLoad: 10,
          programCompletionPercent: 100,
        })
      ).direction
    ).toBe('needs_review');
  });

  it('re-enters normal gating the moment the coach resolves it', () => {
    const before = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 30,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'conservative',
      signals: signals({ reportedPain: true, hasUnreviewedPain: true }),
    })!;
    expect(before.suggestedLoad).toBeNull();

    // Resolved. The pain is still history the coach weighs, so it holds
    // rather than jumping straight to an increase.
    const after = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 30,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'conservative',
      signals: signals({ reportedPain: true, hasUnreviewedPain: false }),
    })!;
    expect(after.direction).toBe('hold');
    expect(after.suggestedLoad).toBe(30);

    // And an exercise whose only pain report was resolved and which has no
    // pain of its own is back to ordinary gating.
    const clean = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 30,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: EARNED,
    })!;
    expect(clean.direction).toBe('increase');
    expect(clean.suggestedLoad).toBe(32.5);
  });
});

describe('the rounding law: practical increments, never above the safe value', () => {
  it('rounds pounds to 2.5 and kilos to 1', () => {
    expect(PRACTICAL_INCREMENT.lbs).toBe(2.5);
    expect(PRACTICAL_INCREMENT.kg).toBe(1);
    expect(practicalIncrementFor('lbs')).toBe(2.5);
    expect(practicalIncrementFor('kg')).toBe(1);
  });

  it('rounds DOWN, never up', () => {
    expect(roundDownToPracticalStep(26, 'lbs')).toBe(25);
    expect(roundDownToPracticalStep(24.9, 'lbs')).toBe(22.5);
    expect(roundDownToPracticalStep(25, 'lbs')).toBe(25);
    expect(roundDownToPracticalStep(12.9, 'kg')).toBe(12);
    expect(roundDownToPracticalStep(13, 'kg')).toBe(13);
  });

  it('every producible suggestion lands on a practical increment and never exceeds the safe value', () => {
    // Every combination the engine can actually reach: both units, both
    // paces, every loadable block, weights on and off the grid, and every
    // signal state that produces a number.
    const states: [string, ExerciseLoadSignals][] = [
      ['earned', EARNED],
      ['one log', signals({ successfulLogsAtCurrentLoad: 1 })],
      ['too difficult', signals({ reportedTooDifficult: true })],
      ['resolved pain', signals({ reportedPain: true })],
      ['nothing completed', signals({ completedOccurrences: 0, successfulLogsAtCurrentLoad: 0 })],
    ];
    const loads = [2.5, 7, 12.5, 15, 22.5, 23.5, 30, 45, 47, 60, 100, 133, 185];

    for (const unit of UNITS) {
      for (const pace of ['standard', 'conservative'] as const) {
        for (const block of LOADABLE_BLOCKS) {
          for (const [label, state] of states) {
            for (const last of loads) {
              const suggestion = suggestLoad({
                block,
                lastLoggedLoad: last,
                lastLoggedUnit: unit,
                lastLoggedPerSide: false,
                model: 'linear',
                pace,
                signals: state,
                weekOfNextPhase: 3,
              })!;
              const where = `${unit}/${pace}/${block}/${label}/${last}`;
              if (suggestion.suggestedLoad === null) {
                expect(suggestion.direction, where).toBe('needs_review');
                continue;
              }

              if (suggestion.direction === 'hold') {
                // A hold is her own number, echoed exactly. It is not
                // rounded, because rounding a hold down would quietly take
                // weight off her.
                expect(suggestion.suggestedLoad, where).toBe(last);
                continue;
              }

              // Everything this file CALCULATES lands on the grid.
              expect(landsOnPracticalIncrement(suggestion.suggestedLoad, unit), where).toBe(true);

              const increment = incrementFor({ block, lastLoggedLoad: last, unit, pace })!;
              const safe =
                suggestion.direction === 'increase'
                  ? last + increment
                  : Math.min((last * TOO_DIFFICULT_REDUCTION_PERCENT) / 100, last - increment);
              // Never above the safe value, except at the floor, where the
              // smallest weight that exists wins.
              if (suggestion.suggestedLoad > MIN_SUGGESTED_LOAD[unit]) {
                expect(suggestion.suggestedLoad, `${where} must not exceed ${safe}`).toBeLessThanOrEqual(
                  safe + 1e-9
                );
              }
              expect(suggestion.suggestedLoad, where).toBeGreaterThanOrEqual(MIN_SUGGESTED_LOAD[unit]);
            }
          }
        }
      }
    }
  });

  it('a suggestion like 23.5 lbs can never render, whatever she logged', () => {
    // She typed an off-grid weight into her own field. The next suggestion
    // is still a weight that exists.
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 23.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: EARNED,
    })!;
    expect(suggestion.suggestedLoad).toBe(25);
    expect(landsOnPracticalIncrement(suggestion.suggestedLoad!, 'lbs')).toBe(true);
  });

  it('an increase always actually increases, even off the grid', () => {
    for (const last of [2.5, 7, 12.5, 23.5, 24, 46, 133]) {
      const suggestion = suggestLoad({
        block: 'strength',
        lastLoggedLoad: last,
        lastLoggedUnit: 'lbs',
        lastLoggedPerSide: false,
        model: 'linear',
        pace: 'conservative',
        signals: EARNED,
      })!;
      expect(suggestion.suggestedLoad, `from ${last}`).toBeGreaterThan(last);
    }
  });
});

describe('linear increments', () => {
  it('adds one step out of the band the member is actually working in', () => {
    const at = (load: number) =>
      suggestLoad({
        block: 'strength',
        lastLoggedLoad: load,
        lastLoggedUnit: 'lbs',
        lastLoggedPerSide: false,
        model: 'linear',
        pace: 'standard',
        signals: EARNED,
      })!.suggestedLoad;

    expect(at(15)).toBe(17.5);
    expect(at(45)).toBe(50);
    expect(at(185)).toBe(195);
  });

  it('the worked example: 22.5 lbs done twice becomes 25 lbs', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 22.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: signals({ reportedTooEasy: true }),
    })!;
    expect(suggestion.direction).toBe('increase');
    expect(suggestion.suggestedLoad).toBe(25);
    expect(suggestion.lastLoggedLoad).toBe(22.5);
  });

  it('conservative is never bigger than standard at the same weight, on every loadable block', () => {
    for (const unit of UNITS) {
      for (const block of LOADABLE_BLOCKS) {
        for (const load of [8, 25, 60, 150]) {
          const standard = incrementFor({ block, lastLoggedLoad: load, unit, pace: 'standard' })!;
          const conservative = incrementFor({
            block,
            lastLoggedLoad: load,
            unit,
            pace: 'conservative',
          })!;
          expect(conservative, `${unit} ${block} at ${load}`).toBeLessThanOrEqual(standard);
        }
      }
    }
  });

  it('a block that is never loaded has no increment and never moves a number', () => {
    for (const block of ['release', 'mobility'] as BlueprintBlock[]) {
      expect(incrementFor({ block, lastLoggedLoad: 20, unit: 'lbs', pace: 'standard' })).toBeNull();
      const suggestion = suggestLoad({
        block,
        lastLoggedLoad: 20,
        lastLoggedUnit: 'lbs',
        lastLoggedPerSide: false,
        model: 'linear',
        pace: 'standard',
        signals: EARNED,
      })!;
      expect(suggestion.direction).toBe('hold');
      expect(suggestion.suggestedLoad).toBe(20);
    }
  });
});

describe('hold and reduce', () => {
  it('a reduction is a real step down onto the grid, never a rounding up', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 40,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: signals({ reportedTooDifficult: true }),
    })!;
    expect(suggestion.direction).toBe('reduce');
    // 90% of 40 is 36; one full increment down is 35; the grid takes the
    // lower of the two, rounded down.
    expect(suggestion.suggestedLoad).toBe(35);
  });

  it('never reduces below the smallest thing a person can pick up', () => {
    const suggestion = suggestLoad({
      block: 'stability',
      lastLoggedLoad: 2.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'conservative',
      signals: signals({ reportedTooDifficult: true }),
    })!;
    expect(suggestion.suggestedLoad).toBeGreaterThanOrEqual(MIN_SUGGESTED_LOAD.lbs);
  });

  it('holds exactly at the last logged number, never near it', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 37.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: true,
      model: 'linear',
      pace: 'standard',
      signals: signals({ reportedPain: true }),
    })!;
    expect(suggestion.direction).toBe('hold');
    expect(suggestion.suggestedLoad).toBe(37.5);
    expect(suggestion.perSide).toBe(true);
  });
});

describe('which model applies', () => {
  it('a corrective program is always linear and always conservative', () => {
    const resolved = resolveModel({
      periodization: 'undulating',
      isCorrectiveProgram: true,
      hasOpenPainReport: false,
    });
    expect(resolved.model).toBe('linear');
    expect(resolved.pace).toBe('conservative');
  });

  it('an unreviewed pain report makes any program conservative', () => {
    const resolved = resolveModel({
      periodization: 'undulating',
      isCorrectiveProgram: false,
      hasOpenPainReport: true,
    });
    expect(resolved.pace).toBe('conservative');
  });

  it('silence reads as linear, and records no blueprint model', () => {
    const resolved = resolveModel({
      periodization: null,
      isCorrectiveProgram: false,
      hasOpenPainReport: false,
    });
    expect(resolved.model).toBe('linear');
    expect(resolved.blueprintModel).toBeNull();
  });

  it('no sentence a coach reads here contains an em dash', () => {
    const texts = [
      resolveModel({ periodization: 'undulating', isCorrectiveProgram: true, hasOpenPainReport: false }).why,
      resolveModel({ periodization: 'undulating', isCorrectiveProgram: false, hasOpenPainReport: true }).why,
      resolveModel({ periodization: null, isCorrectiveProgram: false, hasOpenPainReport: false }).why,
      NO_SUGGESTION_PENDING_PAIN_REVIEW,
      SUGGESTIONS_BEGIN_AFTER_TWO_LOGS,
      ...['increase', 'hold', 'reduce', 'needs_review'].map(
        (_, i) =>
          gateForSignals(
            [
              EARNED,
              signals({ successfulLogsAtCurrentLoad: 1 }),
              signals({ reportedTooDifficult: true }),
              signals({ hasUnreviewedPain: true }),
            ][i]!
          ).reason
      ),
    ];
    for (const text of texts) {
      expect(text).not.toContain('—');
      expect(text).not.toContain('–');
    }
  });
});

describe('the tables themselves', () => {
  const ALL_TABLES: [string, Record<BlueprintBlock, { throughUnits: number; incrementUnits: number }[]>, LoggedLoadUnit][] =
    [
      ['standard lbs', STANDARD_INCREMENTS_LBS, 'lbs'],
      ['standard kg', STANDARD_INCREMENTS_KG, 'kg'],
      ['conservative lbs', CONSERVATIVE_INCREMENTS_LBS, 'lbs'],
      ['conservative kg', CONSERVATIVE_INCREMENTS_KG, 'kg'],
    ];

  it('every increment is a whole number of practical steps, so nothing can stall', () => {
    for (const [label, table, unit] of ALL_TABLES) {
      for (const [block, rules] of Object.entries(table)) {
        for (const rule of rules) {
          expect(
            landsOnPracticalIncrement(rule.incrementUnits, unit),
            `${label} ${block} increment ${rule.incrementUnits}`
          ).toBe(true);
          expect(
            rule.incrementUnits,
            `${label} ${block} increment must be at least one practical step`
          ).toBeGreaterThanOrEqual(PRACTICAL_INCREMENT[unit]);
        }
      }
    }
  });

  it('every increment table ends in an open-ended band', () => {
    for (const [label, table] of ALL_TABLES) {
      for (const [block, rules] of Object.entries(table)) {
        if (rules.length === 0) continue;
        expect(
          Number.isFinite(rules[rules.length - 1]!.throughUnits),
          `${label} ${block} must end open ended`
        ).toBe(false);
      }
    }
  });

  it('bands ascend and increments never shrink as the weight grows', () => {
    for (const [label, table] of ALL_TABLES) {
      for (const [block, rules] of Object.entries(table)) {
        for (let i = 1; i < rules.length; i++) {
          expect(rules[i]!.throughUnits, `${label} ${block}`).toBeGreaterThan(
            rules[i - 1]!.throughUnits
          );
          expect(rules[i]!.incrementUnits, `${label} ${block}`).toBeGreaterThanOrEqual(
            rules[i - 1]!.incrementUnits
          );
        }
      }
    }
  });

  it('prints as a table a coach can read, covering both paces and both units', () => {
    const rows = loadRuleRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.pace))).toEqual(new Set(['standard', 'conservative']));
    expect(new Set(rows.map((r) => r.unit))).toEqual(new Set(['lbs', 'kg']));
    // Release and mobility have no rows at all, because they are never loaded.
    expect(rows.some((r) => r.block === 'release')).toBe(false);
    expect(rows.some((r) => r.block === 'mobility')).toBe(false);
  });
});
