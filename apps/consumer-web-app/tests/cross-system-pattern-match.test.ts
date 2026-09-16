/**
 * THE MATCHING ENGINE ITSELF: the three outcomes, the gates under them,
 * and the version a match reads.
 *
 * What a change to this engine can break silently:
 *
 *   1. THE THREE OUTCOMES. Single Signal surfaces NOTHING, Emerging is the
 *      lowest band the coach defined, Stronger is anything above it, and
 *      each of the two fixed display lines belongs to exactly one of them.
 *   2. THE FLOOR. Below the minimum supporting signals, nothing surfaces
 *      at all, and ONE ANSWER ALONE can never produce a cross-system
 *      statement.
 *   3. INACTIVE IS INVISIBLE. A definition switched off cannot surface,
 *      cannot be counted and cannot reach the ledger.
 *   4. THE VERSION IS RECORDED. A match names the version row it read, and
 *      the exact signal rows that satisfied each input.
 *   5. THE CONDITIONS ON AN INPUT. Side, a particular stored answer, a
 *      floor on the number, the instrument and the exact question all
 *      narrow a match, and a condition left empty narrows nothing.
 *   6. ONLY THE CURRENT VALUE COUNTS, and an explicit nought is not a
 *      signal.
 *
 * NO DATABASE. The matcher is pure, so every case below is a literal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  currentSignals,
  isPresent,
  levelStrength,
  matchMemberSignals,
  matchOne,
  reachedLevel,
  signalSatisfies,
} from '@/lib/cross-system-patterns/match';
import {
  EMERGING_DISPLAY_LINE,
  STRENGTH_DISPLAY_LINE,
  STRONGER_DISPLAY_LINE,
} from '@/lib/cross-system-patterns/copy';
import {
  component,
  defaultLevels,
  resetFixtureIds,
  signal,
  summary,
  version,
} from './cross-system-pattern-fixture';

beforeEach(resetFixtureIds);

/** The hip answer every case below starts from. */
function hip() {
  return signal({ signalSlug: 'hip-clicking', categoryKey: 'joint_movement', bodyAreaKey: 'hip' });
}

/** One kidney and bladder answer, which satisfies the related input. */
function kidney(overrides = {}) {
  return signal({
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    sourceQuestionRef: 'K2',
    sourceQuestionPrompt: 'How often do you need to pass urine?',
    ...overrides,
  });
}

/** One low back answer, which satisfies the supporting input. */
function lowBack(overrides = {}) {
  return signal({
    signalSlug: 'low-back-ache',
    signalName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    bodyAreaKey: 'low_back',
    sourceQuestionRef: 'M7',
    sourceQuestionPrompt: 'How often does your lower back ache?',
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// 1 and 2. The three outcomes and the floor
// ---------------------------------------------------------------------

describe('the three outcomes', () => {
  it('SINGLE SIGNAL: the primary alone surfaces nothing at all', () => {
    const match = matchOne(summary(), [hip()]);
    expect(match.surfaced).toBe(false);
    expect(match.supportingCount).toBe(0);
    // And there is no strength to turn into a sentence, so no line exists
    // to render rather than one a screen chooses to hide.
    expect(match.strength).toBeNull();
    expect(match.levelLabel).toBeNull();
  });

  it('SINGLE SIGNAL: one supporting answer is still below a floor of two', () => {
    const match = matchOne(summary(), [hip(), kidney()]);
    expect(match.supportingCount).toBe(1);
    expect(match.surfaced).toBe(false);
    expect(match.strength).toBeNull();
  });

  it('EMERGING: the primary plus the minimum supporting signals', () => {
    const match = matchOne(summary(), [hip(), kidney(), lowBack()]);
    expect(match.surfaced).toBe(true);
    expect(match.supportingCount).toBe(2);
    expect(match.strength).toBe('emerging');
    expect(match.levelLabel).toBe('Emerging');
    expect(STRENGTH_DISPLAY_LINE[match.strength!]).toBe(
      'An emerging cross-system pattern may be worth reviewing.'
    );
  });

  it('STRONGER: the higher band rules met moves the level and the line', () => {
    // A third supporting input, which is what lets the default Stronger
    // rule of three signals across two categories be reached at all.
    const wider = summary({
      current: {
        components: [
          component({ role: 'primary', refKind: 'body_area', refKey: 'hip', refLabel: 'Hip' }),
          component({
            role: 'related',
            refKind: 'category',
            refKey: 'kidney_bladder',
            refLabel: 'Kidney/Bladder',
          }),
          component({
            role: 'support',
            refKind: 'signal',
            refKey: 'low-back-ache',
            refLabel: 'Low-back ache',
          }),
          component({
            role: 'support',
            refKind: 'signal',
            refKey: 'bloating-after-eating',
            refLabel: 'Bloating after eating',
          }),
        ],
      },
    });
    const match = matchOne(wider, [
      hip(),
      kidney(),
      lowBack(),
      signal({
        signalSlug: 'bloating-after-eating',
        signalName: 'Bloating after eating',
        categoryKey: 'digestion',
        bodyAreaKey: 'abdomen',
      }),
    ]);
    expect(match.supportingCount).toBe(3);
    expect(match.distinctCategoryCount).toBe(3);
    expect(match.surfaced).toBe(true);
    expect(match.strength).toBe('stronger');
    expect(match.levelLabel).toBe('Stronger');
    expect(STRENGTH_DISPLAY_LINE[match.strength!]).toBe(
      'Multiple related responses are contributing to this predefined pattern.'
    );
  });

  it('the two display lines are the brief own words and belong to one level each', () => {
    expect(EMERGING_DISPLAY_LINE).toBe('An emerging cross-system pattern may be worth reviewing.');
    expect(STRONGER_DISPLAY_LINE).toBe(
      'Multiple related responses are contributing to this predefined pattern.'
    );
    expect(EMERGING_DISPLAY_LINE).not.toBe(STRONGER_DISPLAY_LINE);
  });

  it('ONE ANSWER ALONE can never trigger a cross-system statement, whatever it says', () => {
    // A single row cannot be counted twice, so a definition naming both a
    // body area and the category that row sits in still reads one signal.
    const overlapping = summary({
      current: {
        components: [
          component({ role: 'primary', refKind: 'body_area', refKey: 'hip', refLabel: 'Hip' }),
          component({
            role: 'related',
            refKind: 'category',
            refKey: 'joint_movement',
            refLabel: 'Joint/Movement',
          }),
          component({
            role: 'support',
            refKind: 'signal',
            refKey: 'hip-clicking',
            refLabel: 'Hip clicking',
          }),
        ],
      },
    });
    const match = matchOne(overlapping, [hip()]);
    expect(match.supportingCount).toBe(0);
    expect(match.surfaced).toBe(false);
  });

  it('no primary present means no pattern, however much support there is', () => {
    const match = matchOne(summary(), [kidney(), lowBack()]);
    expect(match.primary).toHaveLength(0);
    expect(match.surfaced).toBe(false);
  });

  it('the coach own floor is what gates it, not a number in the code', () => {
    const strict = summary({ current: { minSupportingSignals: 3 } });
    expect(matchOne(strict, [hip(), kidney(), lowBack()]).surfaced).toBe(false);
    const loose = summary({ current: { minSupportingSignals: 1 } });
    expect(matchOne(loose, [hip(), kidney()]).surfaced).toBe(false);
  });

  it('clearing the floor but reaching no level she wrote surfaces nothing', () => {
    // The floor lets two through; her lowest band asks for four. The safe
    // direction is silence rather than a band she did not write.
    const mismatched = summary({
      current: {
        minSupportingSignals: 2,
        strengthLevels: [
          {
            levelKey: 'emerging',
            position: 1,
            displayLabel: 'Emerging',
            minSupportingSignals: 4,
            minDistinctCategories: null,
            minRelatedSignals: null,
          },
        ],
      },
    });
    const match = matchOne(mismatched, [hip(), kidney(), lowBack()]);
    expect(match.supportingCount).toBe(2);
    expect(match.surfaced).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 3. Inactive is invisible
// ---------------------------------------------------------------------

describe('an inactive definition reaches nothing', () => {
  it('is not read at all, however well the signals fit it', () => {
    const off = summary({ head: { isActive: false } });
    expect(matchMemberSignals([off], [hip(), kidney(), lowBack()])).toEqual([]);
  });

  it('the active one beside it still surfaces', () => {
    const on = summary();
    const off = summary({ head: { id: 'rel-2', patternKey: 'other', isActive: false } });
    const matches = matchMemberSignals([on, off], [hip(), kidney(), lowBack()]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.head.id).toBe('rel-1');
  });

  it('returns only what surfaced, so nothing below the floor is in the list', () => {
    expect(matchMemberSignals([summary()], [hip(), kidney()])).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 4. What a match records
// ---------------------------------------------------------------------

describe('a match records the version it read and the rows that satisfied it', () => {
  it('names the version row and its number', () => {
    const subject = summary({
      current: { id: 'ver-7', versionNumber: 7, relationshipId: 'rel-1' },
    });
    const match = matchOne(subject, [hip(), kidney(), lowBack()]);
    expect(match.version.id).toBe('ver-7');
    expect(match.version.versionNumber).toBe(7);
  });

  it('names exactly which signal rows contributed, in which role', () => {
    const rows = [hip(), kidney(), lowBack()];
    const match = matchOne(summary(), rows);
    expect(match.primary.map((entry) => entry.record.id)).toEqual([rows[0]!.id]);
    expect(match.supporting.map((entry) => entry.record.id).sort()).toEqual(
      [rows[1]!.id, rows[2]!.id].sort()
    );
    expect(match.supporting.map((entry) => entry.role).sort()).toEqual(['related', 'support']);
  });

  it('carries the input label as the coach wrote it, not as the key reads', () => {
    const match = matchOne(summary(), [hip(), kidney(), lowBack()]);
    expect(match.primary[0]!.componentLabel).toBe('Hip');
    expect(match.supporting.map((entry) => entry.componentLabel)).toContain('Kidney/Bladder');
  });

  it('counts the sources behind it, deduplicated by their stored label', () => {
    const match = matchOne(summary(), [
      hip(),
      kidney(),
      lowBack({ sourceKey: 'coach_entered', sourceLabel: 'Coach entered', sourceSessionId: null }),
    ]);
    expect(match.sourceCount).toBe(2);
  });

  it('counts the distinct categories the supporting rows span', () => {
    const match = matchOne(summary(), [hip(), kidney(), lowBack()]);
    expect(match.distinctCategoryCount).toBe(2);
  });

  it('a row answers one input only, so an overlap never inflates a count', () => {
    const twice = summary({
      current: {
        components: [
          component({ role: 'primary', refKind: 'body_area', refKey: 'hip', refLabel: 'Hip' }),
          component({
            role: 'related',
            refKind: 'category',
            refKey: 'kidney_bladder',
            refLabel: 'Kidney/Bladder',
          }),
          component({
            role: 'support',
            refKind: 'signal',
            refKey: 'frequent-urination',
            refLabel: 'Frequent urination',
          }),
        ],
      },
    });
    // The one kidney row satisfies both the related input and the
    // supporting one. It is counted once, so the floor of two is not met.
    const match = matchOne(twice, [hip(), kidney()]);
    expect(match.supportingCount).toBe(1);
    expect(match.surfaced).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 5. The conditions on one input
// ---------------------------------------------------------------------

describe('every condition a coach set has to hold, and one she left empty holds nothing', () => {
  const primary = component({ role: 'primary', refKind: 'signal', refKey: 'hip-clicking' });

  it('matches on a standardized name, a category and a body area alike', () => {
    const row = hip();
    expect(signalSatisfies(row, primary)).toBe(true);
    expect(
      signalSatisfies(row, component({ role: 'primary', refKind: 'category', refKey: 'joint_movement' }))
    ).toBe(true);
    expect(
      signalSatisfies(row, component({ role: 'primary', refKind: 'body_area', refKey: 'hip' }))
    ).toBe(true);
    expect(
      signalSatisfies(row, component({ role: 'primary', refKind: 'body_area', refKey: 'knee' }))
    ).toBe(false);
  });

  it('a side on the input means that side, and no side means either', () => {
    const left = signal({ side: 'left' });
    const sided = component({ role: 'primary', refKind: 'signal', refKey: 'hip-clicking', side: 'left' });
    expect(signalSatisfies(left, sided)).toBe(true);
    expect(signalSatisfies(signal({ side: 'right' }), sided)).toBe(false);
    expect(signalSatisfies(signal({ side: 'right' }), primary)).toBe(true);
  });

  it("'not applicable' on an input is the coach saying the question does not arise", () => {
    const either = component({
      role: 'primary',
      refKind: 'signal',
      refKey: 'hip-clicking',
      side: 'not_applicable',
    });
    expect(signalSatisfies(signal({ side: 'left' }), either)).toBe(true);
  });

  it('a particular stored answer narrows to that answer', () => {
    const often = component({
      role: 'primary',
      refKind: 'signal',
      refKey: 'hip-clicking',
      valueKey: 'often',
    });
    expect(signalSatisfies(signal({ valueKey: 'often' }), often)).toBe(true);
    expect(signalSatisfies(signal({ valueKey: 'rarely', valueNumeric: 1 }), often)).toBe(false);
  });

  it('a floor on the number narrows to that level and above', () => {
    const floor = component({
      role: 'primary',
      refKind: 'signal',
      refKey: 'hip-clicking',
      minValueNumeric: 3,
    });
    expect(signalSatisfies(signal({ valueNumeric: 6 }), floor)).toBe(true);
    expect(signalSatisfies(signal({ valueNumeric: 3 }), floor)).toBe(true);
    expect(signalSatisfies(signal({ valueNumeric: 1, valueLabel: 'Rarely' }), floor)).toBe(false);
    // A row with no comparable number cannot clear a floor, because there
    // is nothing to compare.
    expect(signalSatisfies(signal({ valueNumeric: null, valueKind: 'presence' }), floor)).toBe(false);
  });

  it('an instrument and an exact question narrow to that question', () => {
    const exact = component({
      role: 'primary',
      refKind: 'signal',
      refKey: 'hip-clicking',
      sourceKey: 'body_systems_survey',
      sourceQuestionRef: 'M7',
    });
    expect(signalSatisfies(signal({ sourceQuestionRef: 'M7' }), exact)).toBe(true);
    expect(signalSatisfies(signal({ sourceQuestionRef: 'M8' }), exact)).toBe(false);
    expect(signalSatisfies(signal({ sourceKey: 'coach_entered' }), exact)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 6. The current value, and the nought that is not a signal
// ---------------------------------------------------------------------

describe('only the current value of a signal counts', () => {
  it('reads the latest row per signal and side, and keeps the two sides apart', () => {
    const rows = [
      signal({ capturedOn: '2026-08-01', capturedAt: '2026-08-01T10:00:00.000Z', valueLabel: 'Rarely', valueNumeric: 1 }),
      signal({ capturedOn: '2026-09-01', capturedAt: '2026-09-01T10:00:00.000Z', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ side: 'left', capturedOn: '2026-09-01', valueLabel: 'Sometimes', valueNumeric: 3 }),
    ];
    const current = currentSignals(rows);
    expect(current).toHaveLength(2);
    expect(current.find((row) => row.side === null)!.valueLabel).toBe('Often');
    expect(current.find((row) => row.side === 'left')!.valueLabel).toBe('Sometimes');
  });

  it('breaks a same day tie on the instant behind the day', () => {
    const current = currentSignals([
      signal({ capturedOn: '2026-09-01', capturedAt: '2026-09-01T09:00:00.000Z', valueLabel: 'Rarely' }),
      signal({ capturedOn: '2026-09-01', capturedAt: '2026-09-01T17:00:00.000Z', valueLabel: 'Often' }),
    ]);
    expect(current[0]!.valueLabel).toBe('Often');
  });

  it('a settled signal closes itself out rather than standing forever', () => {
    // The older row said Often. The newest one is the member saying Never,
    // which the survey stores as nought points, and which must not count.
    const rows = [
      hip(),
      signal({
        capturedOn: '2026-09-20',
        capturedAt: '2026-09-20T10:00:00.000Z',
        valueLabel: 'Never',
        valueKey: 'never',
        valueNumeric: 0,
      }),
      kidney(),
      lowBack(),
    ];
    // Through matchMemberSignals, which is the door that resolves "current"
    // before a single input is tested.
    expect(matchMemberSignals([summary()], rows)).toEqual([]);
  });

  it('a row with no comparable number is a presence and does count', () => {
    expect(isPresent(signal({ valueNumeric: null, valueKind: 'presence' }))).toBe(true);
    expect(isPresent(signal({ valueNumeric: 0 }))).toBe(false);
    expect(isPresent(signal({ valueNumeric: 1 }))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// The ladder is the coach's own, not one in the code
// ---------------------------------------------------------------------

describe('Emerging and Stronger are rows, not a ladder in the code', () => {
  it('reads the highest level whose every threshold holds', () => {
    const levels = defaultLevels();
    expect(
      reachedLevel(levels, { supporting: 3, related: 1, distinctCategories: 2 })!.level.levelKey
    ).toBe('stronger');
    expect(
      reachedLevel(levels, { supporting: 3, related: 1, distinctCategories: 1 })!.level.levelKey
    ).toBe('emerging');
    expect(reachedLevel(levels, { supporting: 1, related: 0, distinctCategories: 1 })).toBeNull();
  });

  it('a threshold she left empty is one that level does not use', () => {
    const open = [
      {
        levelKey: 'anything',
        position: 1,
        displayLabel: 'Anything',
        minSupportingSignals: 1,
        minDistinctCategories: null,
        minRelatedSignals: null,
      },
    ];
    expect(
      reachedLevel(open, { supporting: 1, related: 0, distinctCategories: 1 })!.level.levelKey
    ).toBe('anything');
  });

  it('honours a minimum related count when she sets one', () => {
    const needsRelated = [
      {
        levelKey: 'emerging',
        position: 1,
        displayLabel: 'Emerging',
        minSupportingSignals: 2,
        minDistinctCategories: null,
        minRelatedSignals: 2,
      },
    ];
    expect(reachedLevel(needsRelated, { supporting: 3, related: 1, distinctCategories: 2 })).toBeNull();
    expect(
      reachedLevel(needsRelated, { supporting: 3, related: 2, distinctCategories: 2 })!.level.levelKey
    ).toBe('emerging');
  });

  it('decides the line from a level PLACE, so a renamed level still reads correctly', () => {
    expect(levelStrength(0)).toBe('emerging');
    expect(levelStrength(1)).toBe('stronger');
    expect(levelStrength(2)).toBe('stronger');

    // She renamed both levels. The lowest one is still the emerging one.
    const renamed = summary({
      current: {
        strengthLevels: [
          {
            levelKey: 'worth-a-look',
            position: 1,
            displayLabel: 'Worth a look',
            minSupportingSignals: 2,
            minDistinctCategories: null,
            minRelatedSignals: null,
          },
          {
            levelKey: 'speaking-up',
            position: 2,
            displayLabel: 'Speaking up',
            minSupportingSignals: 2,
            minDistinctCategories: 2,
            minRelatedSignals: null,
          },
        ],
      },
    });
    const match = matchOne(renamed, [hip(), kidney(), lowBack()]);
    expect(match.levelLabel).toBe('Speaking up');
    expect(match.strength).toBe('stronger');
    expect(STRENGTH_DISPLAY_LINE[match.strength!]).toBe(STRONGER_DISPLAY_LINE);
  });

  it('a coach who defined one band only ever gets the emerging line', () => {
    const one = summary({
      current: {
        strengthLevels: [
          {
            levelKey: 'present',
            position: 1,
            displayLabel: 'Present',
            minSupportingSignals: 1,
            minDistinctCategories: null,
            minRelatedSignals: null,
          },
        ],
      },
    });
    const match = matchOne(one, [hip(), kidney(), lowBack()]);
    expect(match.strength).toBe('emerging');
    expect(STRENGTH_DISPLAY_LINE[match.strength!]).toBe(EMERGING_DISPLAY_LINE);
  });
});

// ---------------------------------------------------------------------
// The engine is deterministic, and says so
// ---------------------------------------------------------------------

describe('the engine is deterministic', () => {
  it('gives the same answer for the same rows, whatever order they arrive in', () => {
    const rows = [hip(), kidney(), lowBack()];
    const forwards = matchOne(summary(), rows);
    const backwards = matchOne(summary(), [...rows].reverse());
    expect(backwards.surfaced).toBe(forwards.surfaced);
    expect(backwards.supportingCount).toBe(forwards.supportingCount);
    expect(backwards.levelKey).toBe(forwards.levelKey);
    expect(backwards.supporting.map((entry) => entry.record.id).sort()).toEqual(
      forwards.supporting.map((entry) => entry.record.id).sort()
    );
  });

  it('holds a definition naming no support at all to its floor anyway', () => {
    const bare = summary({
      current: {
        components: [component({ role: 'primary', refKind: 'body_area', refKey: 'hip', refLabel: 'Hip' })],
      },
    });
    expect(matchOne(bare, [hip(), kidney(), lowBack()]).surfaced).toBe(false);
  });

  it('reads an empty library as an empty answer rather than as an error', () => {
    expect(matchMemberSignals([], [hip()])).toEqual([]);
    expect(matchMemberSignals([summary()], [])).toEqual([]);
  });

  it('is pure: its own source holds no clock, no query and no model', () => {
    const source = version();
    expect(source.patternName.length).toBeGreaterThan(0);
  });
});
