/**
 * THE LOAD RULES. Pure arithmetic over the coach-editable tables, so every
 * assertion here reads as a sentence about coaching rather than about code.
 *
 * The rule the whole feature rests on is the first describe block: no
 * logged weight means no suggestion, in every model, in every signal state,
 * on every block. If that one ever goes red, the app has started
 * prescribing.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSERVATIVE_INCREMENTS_LBS,
  LOAD_ROUNDING_STEP,
  MIN_SUGGESTED_LOAD,
  STANDARD_INCREMENTS_KG,
  STANDARD_INCREMENTS_LBS,
  TOO_DIFFICULT_REDUCTION_PERCENT,
  UNDULATING_WAVE_PERCENT,
  directionForSignals,
  incrementFor,
  loadRuleRows,
  resolveModel,
  roundToLoadStep,
  suggestLoad,
  wavePercentForWeek,
  type ExerciseLoadSignals,
} from '../lib/programs/progression/loadRules';
import type { BlueprintBlock } from '@mef/shared-types-contracts';

const CLEAN: ExerciseLoadSignals = {
  reportedPain: false,
  reportedTooDifficult: false,
  reportedTooEasy: false,
  completedOccurrences: 4,
  missedOccurrences: 0,
};

function signals(overrides: Partial<ExerciseLoadSignals> = {}): ExerciseLoadSignals {
  return { ...CLEAN, ...overrides };
}

describe('no logged weight, no suggestion, ever', () => {
  const everySignalState: ExerciseLoadSignals[] = [
    CLEAN,
    signals({ reportedTooEasy: true }),
    signals({ reportedTooDifficult: true }),
    signals({ reportedPain: true }),
    signals({ completedOccurrences: 0, missedOccurrences: 4 }),
  ];
  const blocks: BlueprintBlock[] = ['release', 'mobility', 'stability', 'strength', 'core'];

  it('returns null for every block, every model and every signal state', () => {
    for (const block of blocks) {
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
          signals: CLEAN,
        })
      ).toBeNull();
    }
  });
});

describe('the signal ladder', () => {
  it('pain holds, and pain beats everything below it', () => {
    expect(directionForSignals(signals({ reportedPain: true }))).toBe('hold');
    expect(
      directionForSignals(signals({ reportedPain: true, reportedTooEasy: true }))
    ).toBe('hold');
    expect(
      directionForSignals(
        signals({ reportedPain: true, reportedTooEasy: true, completedOccurrences: 8 })
      )
    ).toBe('hold');
  });

  it('too difficult reduces, and beats too easy', () => {
    expect(directionForSignals(signals({ reportedTooDifficult: true }))).toBe('reduce');
    expect(
      directionForSignals(signals({ reportedTooDifficult: true, reportedTooEasy: true }))
    ).toBe('reduce');
  });

  it('nothing completed holds, whatever she said', () => {
    expect(
      directionForSignals(signals({ completedOccurrences: 0, reportedTooEasy: true }))
    ).toBe('hold');
  });

  it('too easy increases, which is the coach-approved answer to her flag', () => {
    expect(directionForSignals(signals({ reportedTooEasy: true }))).toBe('increase');
  });

  it('a clean phase increases, and a mostly-missed one holds', () => {
    expect(directionForSignals(signals({ completedOccurrences: 3, missedOccurrences: 1 }))).toBe(
      'increase'
    );
    expect(directionForSignals(signals({ completedOccurrences: 1, missedOccurrences: 3 }))).toBe(
      'hold'
    );
  });
});

describe('linear increments', () => {
  it('adds one step out of the band the member is actually working in', () => {
    const small = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 15,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: CLEAN,
    });
    expect(small?.suggestedLoad).toBe(17.5);

    const mid = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 45,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: CLEAN,
    });
    expect(mid?.suggestedLoad).toBe(50);

    const heavy = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 185,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: CLEAN,
    });
    expect(heavy?.suggestedLoad).toBe(195);
  });

  it('the worked example from the report: 22.5 lbs becomes 25 lbs', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 22.5,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: signals({ reportedTooEasy: true }),
    });
    expect(suggestion?.direction).toBe('increase');
    expect(suggestion?.suggestedLoad).toBe(25);
    expect(suggestion?.lastLoggedLoad).toBe(22.5);
  });

  it('conservative is smaller than standard at the same weight, on every loadable block', () => {
    for (const block of ['stability', 'strength', 'core'] as BlueprintBlock[]) {
      for (const load of [8, 25, 60, 150]) {
        const standard = incrementFor({ block, lastLoggedLoad: load, unit: 'lbs', pace: 'standard' })!;
        const conservative = incrementFor({
          block,
          lastLoggedLoad: load,
          unit: 'lbs',
          pace: 'conservative',
        })!;
        expect(conservative, `${block} at ${load}`).toBeLessThanOrEqual(standard);
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
        signals: CLEAN,
      });
      expect(suggestion?.direction).toBe('hold');
      expect(suggestion?.suggestedLoad).toBe(20);
    }
  });
});

describe('the undulating wave', () => {
  it('runs heavier and lighter across a phase rather than climbing', () => {
    const week = (n: number) =>
      suggestLoad({
        block: 'strength',
        lastLoggedLoad: 50,
        lastLoggedUnit: 'lbs',
        lastLoggedPerSide: false,
        model: 'undulating',
        pace: 'standard',
        signals: CLEAN,
        weekOfNextPhase: n,
      })!.suggestedLoad!;

    const one = week(1);
    const two = week(2);
    const three = week(3);
    const four = week(4);

    expect(two).toBeGreaterThan(one);
    expect(three).toBeLessThan(two);
    expect(four).toBeGreaterThan(two);
  });

  it('wraps rather than running off the end of the table', () => {
    expect(wavePercentForWeek(5)).toBe(UNDULATING_WAVE_PERCENT[0]);
    expect(wavePercentForWeek(8)).toBe(UNDULATING_WAVE_PERCENT[3]);
    expect(wavePercentForWeek(0)).toBe(UNDULATING_WAVE_PERCENT[0]);
  });

  it('never waves over pain or over too difficult', () => {
    const painful = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 50,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'undulating',
      pace: 'standard',
      signals: signals({ reportedPain: true }),
      weekOfNextPhase: 4,
    })!;
    expect(painful.direction).toBe('hold');
    expect(painful.suggestedLoad).toBe(50);

    const hard = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 50,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'undulating',
      pace: 'standard',
      signals: signals({ reportedTooDifficult: true }),
      weekOfNextPhase: 4,
    })!;
    expect(hard.direction).toBe('reduce');
    expect(hard.suggestedLoad).toBeLessThan(50);
  });
});

describe('hold and reduce', () => {
  it('a reduction is a real step down, never a rounding up', () => {
    const suggestion = suggestLoad({
      block: 'strength',
      lastLoggedLoad: 40,
      lastLoggedUnit: 'lbs',
      lastLoggedPerSide: false,
      model: 'linear',
      pace: 'standard',
      signals: signals({ reportedTooDifficult: true }),
    })!;
    expect(suggestion.suggestedLoad).toBeLessThan(40);
    expect(suggestion.suggestedLoad).toBe(
      roundToLoadStep((40 * TOO_DIFFICULT_REDUCTION_PERCENT) / 100, 'down')
    );
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

  it('silence reads as linear', () => {
    expect(
      resolveModel({ periodization: null, isCorrectiveProgram: false, hasOpenPainReport: false })
        .model
    ).toBe('linear');
  });

  it('an undulating blueprint with clean signals gets the wave', () => {
    const resolved = resolveModel({
      periodization: 'undulating',
      isCorrectiveProgram: false,
      hasOpenPainReport: false,
    });
    expect(resolved.model).toBe('undulating');
    expect(resolved.pace).toBe('standard');
  });
});

describe('the tables themselves', () => {
  it('every increment table ends in an open-ended band', () => {
    for (const table of [
      STANDARD_INCREMENTS_LBS,
      STANDARD_INCREMENTS_KG,
      CONSERVATIVE_INCREMENTS_LBS,
    ]) {
      for (const [block, rules] of Object.entries(table)) {
        if (rules.length === 0) continue;
        expect(
          Number.isFinite(rules[rules.length - 1]!.throughUnits),
          `${block} must end open ended`
        ).toBe(false);
      }
    }
  });

  it('bands ascend and increments never shrink as the weight grows', () => {
    for (const table of [STANDARD_INCREMENTS_LBS, STANDARD_INCREMENTS_KG]) {
      for (const [block, rules] of Object.entries(table)) {
        for (let i = 1; i < rules.length; i++) {
          expect(rules[i]!.throughUnits, block).toBeGreaterThan(rules[i - 1]!.throughUnits);
          expect(rules[i]!.incrementUnits, block).toBeGreaterThanOrEqual(
            rules[i - 1]!.incrementUnits
          );
        }
      }
    }
  });

  it('every suggestion lands on a half unit', () => {
    for (const load of [7, 12.5, 22.5, 47, 133]) {
      for (const model of ['linear', 'undulating'] as const) {
        for (const week of [1, 2, 3, 4]) {
          const suggestion = suggestLoad({
            block: 'strength',
            lastLoggedLoad: load,
            lastLoggedUnit: 'lbs',
            lastLoggedPerSide: false,
            model,
            pace: 'standard',
            signals: CLEAN,
            weekOfNextPhase: week,
          })!;
          const steps = suggestion.suggestedLoad! / LOAD_ROUNDING_STEP;
          expect(Number.isInteger(Math.round(steps * 1e6) / 1e6), `${load} ${model} w${week}`).toBe(
            true
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
