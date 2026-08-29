/**
 * The interpretation: two sides, five states, and a precedence order that
 * is the coaching decision rather than a tie-break convenience.
 *
 * WHAT THIS FILE IS REALLY GUARDING. The one rule the whole experience
 * exists to hold is that the load side and the recovery side never collapse
 * into a single number. That rule is easy to break by accident later (a
 * "total", a "stress score", one severity computed from both), so it is
 * asserted here in the strongest form available: the same load answers with
 * opposite recovery answers must produce the same load side, and the same
 * recovery answers with opposite load answers must produce the same
 * recovery side. A blend fails both.
 *
 * The precedence is asserted by building fixtures that satisfy MORE THAN
 * ONE rule at once and checking the higher one wins. A test that only ever
 * hits one rule at a time cannot tell an ordered chain from an unordered
 * one.
 */

import { describe, it, expect } from 'vitest';
import {
  BODY_SIGNALS_FOR_LOUD,
  LOAD_POINTS_FOR_HIGH,
  RECOVERY_POINTS_FOR_SOLID,
  breadthPointsFor,
  buildStressLoadReading,
  computeLoadSide,
  computeRecoverySide,
  loadBandFor,
  recoveryBandFor,
  sanitizeReading,
  selectPattern,
} from '@/lib/stress-load/patterns';
import { buildKeyInsight, PATTERN_NAME } from '@/lib/stress-load/copy';
import { fullAnswers } from './stress-load-questions.test';

const ALL_EIGHT_SIGNALS = {
  selected: ['sleep', 'tension', 'energy', 'digestion', 'mood', 'cravings', 'mind', 'illness'],
  otherText: null,
};

describe('the thresholds, exactly as documented', () => {
  it('breadth earns its first point at two sources and its second at four', () => {
    expect(breadthPointsFor(1)).toBe(0);
    expect(breadthPointsFor(2)).toBe(1);
    expect(breadthPointsFor(3)).toBe(1);
    expect(breadthPointsFor(4)).toBe(2);
    expect(breadthPointsFor(8)).toBe(2);
  });

  it('the load band turns over at 3 and at 5', () => {
    expect(loadBandFor(2)).toBe('light');
    expect(loadBandFor(3)).toBe('moderate');
    expect(loadBandFor(4)).toBe('moderate');
    expect(loadBandFor(LOAD_POINTS_FOR_HIGH)).toBe('high');
    expect(loadBandFor(7)).toBe('high');
  });

  it('the recovery band turns over at 2 and at 4', () => {
    expect(recoveryBandFor(0)).toBe('thin');
    expect(recoveryBandFor(1)).toBe('thin');
    expect(recoveryBandFor(2)).toBe('partial');
    expect(recoveryBandFor(3)).toBe('partial');
    expect(recoveryBandFor(RECOVERY_POINTS_FOR_SOLID)).toBe('solid');
    expect(recoveryBandFor(5)).toBe('solid');
  });

  it('"Crushing" alone reaches high load, and "Full" needs four sources to get there', () => {
    const crushingAlone = computeLoadSide(
      fullAnswers({ load_weight: 5, load_sources: { selected: ['work'], otherText: null } })
    );
    expect(crushingAlone.loadPoints).toBe(5);
    expect(crushingAlone.band).toBe('high');

    const fullAndBroad = computeLoadSide(
      fullAnswers({
        load_weight: 3,
        load_sources: { selected: ['work', 'money', 'health', 'home'], otherText: null },
      })
    );
    expect(fullAndBroad.loadPoints).toBe(5);
    expect(fullAndBroad.band).toBe('high');

    const fullAndNarrow = computeLoadSide(
      fullAnswers({
        load_weight: 3,
        load_sources: { selected: ['work', 'money'], otherText: null },
      })
    );
    expect(fullAndNarrow.band).toBe('moderate');
  });

  it('naming somebody is worth exactly one step of the amount scale', () => {
    const withSupport = computeRecoverySide(
      fullAnswers({ recovery_amount: 'not_enough', lean_on: { selected: ['friend'], otherText: null } })
    );
    const alone = computeRecoverySide(
      fullAnswers({ recovery_amount: 'fair_amount', lean_on: { selected: ['no_one'], otherText: null } })
    );
    expect(withSupport.recoveryPoints).toBe(3);
    expect(alone.recoveryPoints).toBe(3);
    expect(withSupport.band).toBe(alone.band);
  });

  it('"No one right now" beside a real answer still counts as naming somebody', () => {
    const both = computeRecoverySide(
      fullAnswers({ lean_on: { selected: ['no_one', 'coach'], otherText: null } })
    );
    expect(both.namesSupport).toBe(true);
  });
});

// ---------------------------------------------------------------------
// THE RULE: two sides, never one.
// ---------------------------------------------------------------------

describe('the two sides never see each other', () => {
  it('the load side is identical under opposite recovery answers', () => {
    const base = { load_weight: 5, load_sources: { selected: ['work', 'money'], otherText: null } };
    const thin = computeLoadSide(
      fullAnswers({
        ...base,
        recovery_amount: 'none',
        lean_on: { selected: ['no_one'], otherText: null },
      })
    );
    const solid = computeLoadSide(
      fullAnswers({
        ...base,
        recovery_amount: 'plenty',
        lean_on: { selected: ['partner', 'friend'], otherText: null },
      })
    );
    expect(thin).toEqual(solid);
  });

  it('the recovery side is identical under opposite load answers', () => {
    const base = {
      recovery_amount: 'taste' as const,
      lean_on: { selected: ['friend'], otherText: null },
    };
    const light = computeRecoverySide(
      fullAnswers({ ...base, load_weight: 1, load_sources: { selected: ['work'], otherText: null } })
    );
    const crushing = computeRecoverySide(
      fullAnswers({
        ...base,
        load_weight: 5,
        load_sources: {
          selected: ['work', 'money', 'health', 'home', 'family'],
          otherText: null,
        },
      })
    );
    expect(light).toEqual(crushing);
  });

  it('a heavy load with strong recovery and a light load with no recovery are told apart', () => {
    const heavyBuffered = buildStressLoadReading(
      fullAnswers({
        load_weight: 5,
        load_sources: { selected: ['work', 'money'], otherText: null },
        recovery_amount: 'plenty',
        lean_on: { selected: ['partner'], otherText: null },
      })
    );
    const lightAndEmpty = buildStressLoadReading(
      fullAnswers({
        load_weight: 1,
        load_sources: { selected: ['work'], otherText: null },
        body_signals: { selected: ['sleep'], otherText: null },
        recovery_amount: 'none',
        lean_on: { selected: ['friend'], otherText: null },
      })
    );

    expect(heavyBuffered.load.band).toBe('high');
    expect(heavyBuffered.recovery.band).toBe('solid');
    expect(lightAndEmpty.load.band).toBe('light');
    expect(lightAndEmpty.recovery.band).toBe('thin');
  });
});

// ---------------------------------------------------------------------
// The five states, and the order.
// ---------------------------------------------------------------------

/** A member each rule was built for. Each one is a real, complete answer set. */
const FIXTURES = {
  carryingItAlone: fullAnswers({
    load_weight: 5,
    load_sources: { selected: ['work', 'money'], otherText: null },
    load_follows_home: 'money',
    body_signals: { selected: ['sleep'], otherText: null },
    recovery_amount: 'not_enough',
    lean_on: { selected: ['no_one'], otherText: null },
  }),
  bodySpeakingFirst: fullAnswers({
    load_weight: 2,
    load_sources: { selected: ['work'], otherText: null },
    load_follows_home: 'work',
    body_signals: ALL_EIGHT_SIGNALS,
    recovery_amount: 'fair_amount',
    lean_on: { selected: ['partner'], otherText: null },
  }),
  heavyLoadThinRecovery: fullAnswers({
    load_weight: 5,
    load_sources: { selected: ['work', 'money', 'health'], otherText: null },
    load_follows_home: 'money',
    body_signals: { selected: ['sleep', 'energy'], otherText: null },
    recovery_amount: 'none',
    lean_on: { selected: ['friend'], otherText: null },
  }),
  loadedButBuffered: fullAnswers({
    load_weight: 5,
    load_sources: { selected: ['work', 'family'], otherText: null },
    load_follows_home: 'work',
    body_signals: { selected: ['sleep'], otherText: null },
    recovery_amount: 'plenty',
    lean_on: { selected: ['partner', 'friend'], otherText: null },
  }),
  balance: fullAnswers({
    load_weight: 2,
    load_sources: { selected: ['work', 'money'], otherText: null },
    load_follows_home: 'work',
    body_signals: { selected: ['sleep'], otherText: null },
    recovery_amount: 'not_enough',
    lean_on: { selected: ['partner'], otherText: null },
  }),
};

describe('the five states', () => {
  it('Carrying It Alone: high load, nobody named', () => {
    expect(buildStressLoadReading(FIXTURES.carryingItAlone).patternKey).toBe('carrying_it_alone');
  });

  it('Body Speaking First: a loud body under a load she calls Full or lighter', () => {
    const reading = buildStressLoadReading(FIXTURES.bodySpeakingFirst);
    expect(reading.body.signalCount).toBeGreaterThanOrEqual(BODY_SIGNALS_FOR_LOUD);
    expect(reading.load.weight).toBeLessThanOrEqual(3);
    expect(reading.patternKey).toBe('body_speaking_first');
  });

  it('Heavy Load, Thin Recovery', () => {
    expect(buildStressLoadReading(FIXTURES.heavyLoadThinRecovery).patternKey).toBe(
      'heavy_load_thin_recovery'
    );
  });

  it('Loaded but Buffered', () => {
    expect(buildStressLoadReading(FIXTURES.loadedButBuffered).patternKey).toBe(
      'loaded_but_buffered'
    );
  });

  it('moderate everything gets the honest plain state, and it has no dramatic name', () => {
    const reading = buildStressLoadReading(FIXTURES.balance);
    expect(reading.patternKey).toBe('balance_as_it_is');
    expect(PATTERN_NAME.balance_as_it_is).toBeNull();
    expect(buildKeyInsight(reading, FIXTURES.balance).patternName).toBeNull();
  });
});

describe('the precedence, proved on fixtures that satisfy more than one rule at once', () => {
  it('alone with weight outranks a loud body', () => {
    const answers = fullAnswers({
      load_weight: 5,
      load_sources: { selected: ['work', 'money'], otherText: null },
      load_follows_home: 'money',
      body_signals: ALL_EIGHT_SIGNALS,
      recovery_amount: 'none',
      lean_on: { selected: ['no_one'], otherText: null },
    });
    const reading = buildStressLoadReading(answers);
    // It qualifies for three rules at once, and the first one wins.
    expect(reading.load.band).toBe('high');
    expect(reading.recovery.band).toBe('thin');
    expect(reading.body.signalsLoud).toBe(true);
    expect(reading.patternKey).toBe('carrying_it_alone');
  });

  it('a loud body outranks both recovery comparisons when the reported load is Full or below', () => {
    const answers = fullAnswers({
      load_weight: 3,
      load_sources: { selected: ['work', 'money', 'health', 'home'], otherText: null },
      load_follows_home: 'money',
      body_signals: ALL_EIGHT_SIGNALS,
      recovery_amount: 'none',
      lean_on: { selected: ['friend'], otherText: null },
    });
    const reading = buildStressLoadReading(answers);
    expect(reading.load.band).toBe('high');
    expect(reading.recovery.band).toBe('thin');
    expect(reading.patternKey).toBe('body_speaking_first');
  });

  it('a loud body does NOT outrank the load once she calls it Heavy, because then the two agree', () => {
    const answers = fullAnswers({
      load_weight: 4,
      load_sources: { selected: ['work', 'money'], otherText: null },
      load_follows_home: 'money',
      body_signals: ALL_EIGHT_SIGNALS,
      recovery_amount: 'none',
      lean_on: { selected: ['friend'], otherText: null },
    });
    expect(buildStressLoadReading(answers).patternKey).toBe('heavy_load_thin_recovery');
  });

  it('the order is a property of selectPattern itself, over the same three sides', () => {
    const load = { weight: 5, breadth: 2, breadthPoints: 1, loadPoints: 6, band: 'high' as const };
    const recoveryThinAlone = {
      amountPoints: 0,
      namesSupport: false,
      recoveryPoints: 0,
      band: 'thin' as const,
    };
    const recoveryThinNamed = {
      amountPoints: 1,
      namesSupport: true,
      recoveryPoints: 2,
      band: 'thin' as const,
    };
    const loudBody = { signalCount: 6, signalsLoud: true };
    const quietBody = { signalCount: 1, signalsLoud: false };

    expect(selectPattern(load, recoveryThinAlone, quietBody)).toBe('carrying_it_alone');
    expect(selectPattern(load, recoveryThinNamed, loudBody)).toBe('heavy_load_thin_recovery');
    expect(selectPattern(load, recoveryThinNamed, quietBody)).toBe('heavy_load_thin_recovery');
  });
});

describe('the reading, in words', () => {
  it('names the four patterns and adapts to her own answers', () => {
    for (const [name, answers] of Object.entries(FIXTURES)) {
      const reading = buildStressLoadReading(answers);
      const insight = buildKeyInsight(reading, answers);
      expect(insight.headline.length).toBeGreaterThan(10);
      expect(insight.body.length).toBeGreaterThan(40);
      expect(insight.headline).not.toContain('—');
      expect(insight.body).not.toContain('—');
      expect(insight.patternName).toBe(PATTERN_NAME[reading.patternKey]);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('Heavy Load, Thin Recovery reads the gap back as the finding, in her own words', () => {
    const answers = FIXTURES.heavyLoadThinRecovery;
    const insight = buildKeyInsight(buildStressLoadReading(answers), answers);
    expect(insight.headline).toContain('almost nothing on your recovery side belongs to you');
    expect(insight.body).toContain('money follows you home');
    expect(insight.body).toContain('music and being outside');
    expect(insight.body).toContain('none of it');
    expect(insight.body).toContain('The gap between those two is the finding, not the load.');
  });
});

describe('reading a stored reading back', () => {
  it('round trips', () => {
    const reading = buildStressLoadReading(FIXTURES.loadedButBuffered);
    expect(sanitizeReading(JSON.parse(JSON.stringify(reading)))).toEqual(reading);
  });

  it('refuses a pattern key that is not one of the five, rather than rendering half a reading', () => {
    const reading = buildStressLoadReading(FIXTURES.balance);
    expect(sanitizeReading({ ...reading, patternKey: 'catastrophising' })).toBeNull();
  });

  it('refuses a band that is not one of the three', () => {
    const reading = buildStressLoadReading(FIXTURES.balance);
    expect(sanitizeReading({ ...reading, recovery: { ...reading.recovery, band: 'great' } })).toBeNull();
  });
});
