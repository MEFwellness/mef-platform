/**
 * The Root Map feed, and the check-in cross reference.
 *
 * TWO DIMENSIONS, NEVER ONE. One completion publishes two registry rows
 * that land on two different Coaching Domains, and this file asserts the
 * separation at every place it could quietly stop being true:
 *
 *   1. Two drafts, two codes, two units, two numeric values.
 *   2. Two DIFFERENT primary domains, through the real domainMap.
 *   3. Neither carries the other as a cross reference (empty alsoRelevant),
 *      because a cross reference is exactly how one sitting's load answer
 *      would end up rendered on the recovery card.
 *   4. Each severity is a function of ITS OWN side only, proved by holding
 *      one side fixed and swinging the other from end to end.
 *   5. Two different check-in columns tier them, so they cannot rise
 *      together on the same evidence.
 *
 * THE CROSS REFERENCE SAYS AT MOST ONE THING, AND SAYS NOTHING ON THIN
 * DATA. That is the standing accuracy rule, and the failure it prevents is
 * a hedged sentence over almost no evidence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LOAD_FINDING_CODE,
  RECOVERY_FINDING_CODE,
  buildStressLoadRegistryDrafts,
  loadSeverity,
  recoverySeverity,
} from '@/lib/stress-load/rootMap';
import { buildStressLoadReading } from '@/lib/stress-load/patterns';
import { assignDomains } from '@/lib/member-interpretation/domainMap';
import { isTrackableInCheckins } from '@/lib/member-interpretation/evidence';
import { findingDisplayName } from '@/lib/naming/findingNames';
import {
  CROSS_REFERENCE_MIN_DAYS,
  buildCrossReference,
  crossReferenceDirection,
  renderCrossReference,
  sanitizeInterpretation,
} from '@/lib/stress-load/crossReference';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';
import { fullAnswers } from './stress-load-questions.test';

const RECORDED_AT = '2026-08-29T10:04:00.000Z';

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::stress',
    signalKind: 'checkin_metric',
    signalLabel: 'stress',
    state: 'worsening',
    tier: 3,
    occurrenceCount: 5,
    confidence: 0.8,
    firstObservedAt: '2026-08-01',
    lastObservedAt: '2026-08-28',
    evidenceSummary: {},
    ...overrides,
  };
}

const HEAVY_AND_THIN = fullAnswers({
  load_weight: 5,
  load_sources: { selected: ['work', 'money', 'health'], otherText: null },
  load_follows_home: 'money',
  recovery_amount: 'none',
  lean_on: { selected: ['friend'], otherText: null },
});

const LIGHT_AND_SOLID = fullAnswers({
  load_weight: 1,
  load_sources: { selected: ['work'], otherText: null },
  load_follows_home: 'work',
  body_signals: { selected: ['sleep'], otherText: null },
  recovery_amount: 'plenty',
  lean_on: { selected: ['partner'], otherText: null },
});

describe('one completion writes two rows', () => {
  const drafts = buildStressLoadRegistryDrafts({
    reading: buildStressLoadReading(HEAVY_AND_THIN),
    sessionId: 'session-1',
    recordedAt: RECORDED_AT,
  });

  it('exactly two, in a fixed order, load first', () => {
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.code)).toEqual([LOAD_FINDING_CODE, RECOVERY_FINDING_CODE]);
  });

  it('carrying two different numbers under two different units, never one total', () => {
    expect(drafts[0]!.unit).toBe('load_points');
    expect(drafts[1]!.unit).toBe('recovery_points');
    expect(drafts[0]!.numeric_value).not.toBe(drafts[1]!.numeric_value);
  });

  it('both trace back to the same sitting, so a coach can read them as one event', () => {
    for (const draft of drafts) {
      expect(draft.source_record_id).toBe('session-1');
      expect(draft.evidence_refs).toEqual([{ type: 'stress_load_session', id: 'session-1' }]);
      expect(draft.recorded_at).toBe(RECORDED_AT);
      expect(draft.source_feature).toBe('stress_load_deep_dive_finding');
      expect(draft.member_visible).toBe(true);
    }
  });

  it('neither narrative is prose, because the Interpretation Layer authors what she reads', () => {
    for (const draft of drafts) expect(draft.narrative).toBeNull();
  });
});

describe('the two rows land on two different Root Map dimensions', () => {
  const drafts = buildStressLoadRegistryDrafts({
    reading: buildStressLoadReading(HEAVY_AND_THIN),
    sessionId: 'session-1',
    recordedAt: RECORDED_AT,
  });

  it('load goes to Stress & Nervous System, recovery to Recovery & Energy Regulation', () => {
    const load = assignDomains(drafts[0]!.domain, drafts[0]!.code);
    const recovery = assignDomains(drafts[1]!.domain, drafts[1]!.code);
    expect(load.primary).toBe('stress_nervous_system');
    expect(recovery.primary).toBe('recovery_energy_regulation');
    expect(load.primary).not.toBe(recovery.primary);
  });

  it('and NEITHER cross references the other, so one answer cannot render on both cards', () => {
    const load = assignDomains(drafts[0]!.domain, drafts[0]!.code);
    const recovery = assignDomains(drafts[1]!.domain, drafts[1]!.code);
    expect(load.alsoRelevant).toEqual([]);
    expect(recovery.alsoRelevant).toEqual([]);
    expect(load.alsoRelevant).not.toContain('recovery_energy_regulation');
    expect(recovery.alsoRelevant).not.toContain('stress_nervous_system');
  });

  it('each has its own member-facing name', () => {
    expect(findingDisplayName('stress', LOAD_FINDING_CODE, 'x')).toBe(
      'What your life has been asking of you'
    );
    expect(findingDisplayName('stress', RECOVERY_FINDING_CODE, 'x')).toBe(
      'What has been giving back to you'
    );
  });

  it('and its own daily check-in column, so they cannot tier on the same evidence', () => {
    expect(isTrackableInCheckins(LOAD_FINDING_CODE)).toBe(true);
    expect(isTrackableInCheckins(RECOVERY_FINDING_CODE)).toBe(true);
    const evidence = readFileSyncSource();
    expect(evidence).toContain('stress_load_burden: { read: (c) => stressStatus(c.stress_level) }');
    expect(evidence).toContain('recovery_capacity: { read: (c) => energyStatus(c.energy_level) }');
  });
});

/** The probe table itself, so "two different columns" is asserted against the real source rather than against a copy of it. */
function readFileSyncSource(): string {
  return readFileSync(
    path.join(path.resolve(__dirname, '..'), 'lib/member-interpretation/evidence.ts'),
    'utf8'
  );
}

describe('each severity reads one side and one side only', () => {
  it('swinging recovery from end to end never moves the load row', () => {
    const heavyThin = buildStressLoadRegistryDrafts({
      reading: buildStressLoadReading(HEAVY_AND_THIN),
      sessionId: 's',
      recordedAt: RECORDED_AT,
    });
    const heavySolid = buildStressLoadRegistryDrafts({
      reading: buildStressLoadReading(
        fullAnswers({
          ...HEAVY_AND_THIN,
          recovery_amount: 'plenty',
          lean_on: { selected: ['partner', 'friend'], otherText: null },
        })
      ),
      sessionId: 's',
      recordedAt: RECORDED_AT,
    });

    expect(heavyThin[0]!.severity).toBe(heavySolid[0]!.severity);
    expect(heavyThin[0]!.numeric_value).toBe(heavySolid[0]!.numeric_value);
    // The recovery row DID move, so this is not a test that nothing changed.
    expect(heavyThin[1]!.severity).not.toBe(heavySolid[1]!.severity);
  });

  it('swinging the load from end to end never moves the recovery row', () => {
    const lightSolid = buildStressLoadRegistryDrafts({
      reading: buildStressLoadReading(LIGHT_AND_SOLID),
      sessionId: 's',
      recordedAt: RECORDED_AT,
    });
    const crushingSolid = buildStressLoadRegistryDrafts({
      reading: buildStressLoadReading(
        fullAnswers({
          ...LIGHT_AND_SOLID,
          load_weight: 5,
          load_sources: { selected: ['work', 'money', 'health', 'home'], otherText: null },
        })
      ),
      sessionId: 's',
      recordedAt: RECORDED_AT,
    });

    expect(lightSolid[1]!.severity).toBe(crushingSolid[1]!.severity);
    expect(lightSolid[1]!.numeric_value).toBe(crushingSolid[1]!.numeric_value);
    expect(lightSolid[0]!.severity).not.toBe(crushingSolid[0]!.severity);
  });

  it('solid recovery is noted rather than resolved, so it never reads as "settled down"', () => {
    expect(recoverySeverity('solid')).toBe('mild');
    expect(recoverySeverity('partial')).toBe('moderate');
    expect(recoverySeverity('thin')).toBe('significant');
    expect(loadSeverity('light')).toBe('mild');
    expect(loadSeverity('moderate')).toBe('moderate');
    expect(loadSeverity('high')).toBe('significant');
  });
});

describe('the check-in cross reference', () => {
  const reading = buildStressLoadReading(HEAVY_AND_THIN);

  it('says nothing at all below three logged days', () => {
    for (let days = 0; days < CROSS_REFERENCE_MIN_DAYS; days += 1) {
      expect(
        buildCrossReference({
          reading,
          answers: HEAVY_AND_THIN,
          patternStates: [signal()],
          checkinDayCount: days,
          windowDays: 21,
        })
      ).toBeNull();
    }
  });

  it('says nothing when the engine has qualified nothing, however many days she logged', () => {
    expect(
      buildCrossReference({
        reading,
        answers: HEAVY_AND_THIN,
        patternStates: [],
        checkinDayCount: 14,
        windowDays: 21,
      })
    ).toBeNull();
    expect(
      buildCrossReference({
        reading,
        answers: HEAVY_AND_THIN,
        patternStates: [signal({ tier: null, state: 'insufficient_data' })],
        checkinDayCount: 14,
        windowDays: 21,
      })
    ).toBeNull();
    expect(
      buildCrossReference({
        reading,
        answers: HEAVY_AND_THIN,
        patternStates: [signal({ state: 'stale', tier: 2 })],
        checkinDayCount: 14,
        windowDays: 21,
      })
    ).toBeNull();
  });

  it('says exactly one thing when there is real data, and names the window it counted', () => {
    const reference = buildCrossReference({
      reading,
      answers: HEAVY_AND_THIN,
      patternStates: [signal(), signal({ signalKey: 'checkin_metric::sleep', signalLabel: 'sleep' })],
      checkinDayCount: 9,
      windowDays: 21,
    });
    expect(reference).not.toBeNull();
    expect(reference!.signalKey).toBe('checkin_metric::stress');

    const sentence = renderCrossReference(reference!);
    expect(sentence).toContain('over the 9 days you checked in during the last 21 days');
    expect(sentence).not.toContain('—');
    expect(sentence.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('ignores a metric she never named and that is not stress', () => {
    const reference = buildCrossReference({
      reading,
      answers: fullAnswers({
        ...HEAVY_AND_THIN,
        body_signals: { selected: ['cravings'], otherText: null },
      }),
      patternStates: [signal({ signalKey: 'checkin_metric::digestion', signalLabel: 'digestion' })],
      checkinDayCount: 9,
      windowDays: 21,
    });
    expect(reference).toBeNull();
  });

  it('confirms when a heavy sitting meets a tougher trend, and contrasts when it does not', () => {
    expect(crossReferenceDirection(reading, 'worsening')).toBe('confirm');
    expect(crossReferenceDirection(reading, 'improving')).toBe('contrast');

    const lightReading = buildStressLoadReading(LIGHT_AND_SOLID);
    expect(crossReferenceDirection(lightReading, 'worsening')).toBe('contrast');
    expect(crossReferenceDirection(lightReading, 'stable')).toBe('confirm');
  });

  it('renders the two directions as two genuinely different sentences', () => {
    const base = {
      reading,
      answers: HEAVY_AND_THIN,
      checkinDayCount: 9,
      windowDays: 21,
    };
    const confirm = buildCrossReference({ ...base, patternStates: [signal()] })!;
    const contrast = buildCrossReference({
      ...base,
      patternStates: [signal({ state: 'improving' })],
    })!;
    expect(renderCrossReference(confirm)).toContain('point the same way');
    expect(renderCrossReference(contrast)).toContain('a little differently');
  });
});

describe('the stored interpretation round trips', () => {
  it('keeps both sides and the cross reference', () => {
    const reading = buildStressLoadReading(HEAVY_AND_THIN);
    const interpretation = {
      ...reading,
      crossReference: buildCrossReference({
        reading,
        answers: HEAVY_AND_THIN,
        patternStates: [signal()],
        checkinDayCount: 9,
        windowDays: 21,
      }),
    };
    expect(sanitizeInterpretation(JSON.parse(JSON.stringify(interpretation)))).toEqual(
      interpretation
    );
  });

  it('drops an unreadable cross reference without losing the reading', () => {
    const reading = buildStressLoadReading(HEAVY_AND_THIN);
    const stored = { ...reading, crossReference: { signalKey: 'nonsense' } };
    const back = sanitizeInterpretation(stored);
    expect(back?.patternKey).toBe(reading.patternKey);
    expect(back?.crossReference).toBeNull();
  });
});
