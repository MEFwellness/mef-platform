/**
 * THE COMPLAINT-DRIVEN LOOKUP, driven from literals with no database.
 *
 * WHAT THESE PROVE, and the reason each one is here rather than being
 * assumed: that a complaint alone starts the whole thing, that the areas
 * checked are the ones a coach's map named and never any others, that
 * current evidence and history stay apart, and that the coach never has to
 * build anything by hand for any of it to happen.
 */

import { describe, expect, it } from 'vitest';
import {
  complaintDrivenEntries,
  convergentAreas,
  lookupForComplaint,
  lookupOne,
} from '@/lib/cross-system-root/lookup';
import {
  daysBetween,
  evidenceStateOf,
  groupHistories,
  isLiveState,
} from '@/lib/cross-system-root/evidence';
import { matchMemberSignals } from '@/lib/cross-system-patterns/match';
import { head, signal, summary, version } from './cross-system-pattern-fixture';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type { RelationshipComponent } from '@/lib/cross-system-relationships/types';

const TODAY = '2026-09-15';

/** One component of a map entry. */
function component(
  role: RelationshipComponent['role'],
  refKind: RelationshipComponent['refKind'],
  refKey: string,
  overrides: Partial<RelationshipComponent> = {}
): RelationshipComponent {
  return {
    id: `c-${role}-${refKey}`,
    position: 0,
    role,
    refKind,
    refKey,
    refLabel: refKey,
    side: null,
    valueKey: null,
    valueLabel: null,
    minValueNumeric: null,
    sourceKey: null,
    sourceQuestionRef: null,
    sourceQuestionPrompt: null,
    note: null,
    ...overrides,
  };
}

/** A map entry: an entry Root consults when a complaint arrives. */
function mapEntry(components: RelationshipComponent[], overrides: Record<string, unknown> = {}) {
  return summary({
    head: head({ id: 'map-1', patternKey: 'starter-hip-pelvis', isActive: true, isSeeded: true }),
    current: version({
      patternName: 'Hip and pelvis signals, whole-body areas worth reviewing',
      surfacesOnComplaint: true,
      sourceTypeKey: 'chek_hlc',
      components,
      ...overrides,
    }),
  });
}

/** The hip complaint's own row, which is what triggers the lookup. */
function hipComplaintRow(): SignalRecord {
  return signal({
    id: 'trigger-1',
    signalSlug: 'hip-clicking',
    signalName: 'Hip clicking',
    categoryKey: 'joint_movement',
    bodyAreaKey: 'hip',
    side: 'right',
    valueKind: 'presence',
    valueLabel: 'Reported',
    valueNumeric: null,
    sourceKey: 'member_reported',
    sourceLabel: 'Reported by the member',
    capturedOn: TODAY,
    capturedAt: `${TODAY}T12:00:00.000Z`,
    note: 'hip has been clicking',
  });
}

const HIP_MAP = () =>
  mapEntry([
    component('primary', 'body_area', 'hip', { position: 0, refLabel: 'Hip' }),
    component('related', 'category', 'kidney_bladder', { position: 1, refLabel: 'Kidney/Bladder' }),
    component('related', 'category', 'stress', { position: 2, refLabel: 'Stress' }),
    component('related', 'body_area', 'low_back', { position: 3, refLabel: 'Low back' }),
  ]);

// ---------------------------------------------------------------------
// 13. A new complaint triggers the whole-body lookup on its own.
// ---------------------------------------------------------------------

describe('a complaint starts the lookup by itself', () => {
  it('13. a new complaint triggers a lookup with no coach action at all', () => {
    const trigger = hipComplaintRow();
    const findings = lookupForComplaint(
      [HIP_MAP()],
      new Set([trigger.id]),
      [trigger],
      TODAY
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.surfaced).toBe(true);
    expect(findings[0]!.triggerRecords.map((row) => row.id)).toContain('trigger-1');
  });

  it('13b. nothing at all happens without a complaint row', () => {
    const trigger = hipComplaintRow();
    expect(lookupForComplaint([HIP_MAP()], new Set(), [trigger], TODAY)).toHaveLength(0);
  });

  it('13c. a complaint the map says nothing about surfaces nothing', () => {
    const skin = signal({
      id: 'trigger-skin',
      signalSlug: 'skin-breakouts',
      categoryKey: 'skin_immune',
      bodyAreaKey: 'skin',
      capturedOn: TODAY,
    });
    expect(lookupForComplaint([HIP_MAP()], new Set([skin.id]), [skin], TODAY)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 14 to 19. Root reaches every source, and only through the map.
// ---------------------------------------------------------------------

describe('Root brings forward what is in her data under each area', () => {
  const bodySystems = signal({
    id: 'bss-1',
    signalSlug: 'bss-system-kidney',
    signalName: 'Kidney and bladder system signal',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    valueKind: 'band',
    valueLabel: 'Speaking loudly',
    valueNumeric: 8,
    sourceKey: 'body_systems_survey',
    sourceLabel: 'Body Systems Survey',
    sourceQuestionPrompt: 'Kidney and Bladder',
    capturedOn: '2026-09-11',
  });
  const individual = signal({
    id: 'bss-2',
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    valueKind: 'scale',
    valueLabel: 'Often',
    valueNumeric: 6,
    sourceKey: 'body_systems_survey',
    sourceLabel: 'Body Systems Survey',
    sourceQuestionPrompt: 'I need to urinate more often than feels normal.',
    capturedOn: '2026-09-11',
  });
  const breathing = signal({
    id: 'br-1',
    signalSlug: 'breathing-pattern-total',
    categoryKey: 'respiratory',
    bodyAreaKey: null,
    valueKind: 'score',
    valueLabel: '23 of 64',
    valueNumeric: 23,
    sourceKey: 'breathing_pattern_check_in',
    sourceLabel: 'Breathing Pattern Check-In',
    capturedOn: '2026-09-12',
  });
  const posture = signal({
    id: 'po-1',
    signalSlug: 'pelvic-tilt',
    categoryKey: 'posture_alignment',
    bodyAreaKey: 'pelvis',
    valueKind: 'severity',
    valueLabel: 'Moderate',
    valueNumeric: 2,
    sourceKey: 'body_assessment',
    sourceLabel: 'Posture and movement assessment',
    capturedOn: '2026-09-10',
  });
  const coachEntered = signal({
    id: 'co-1',
    signalSlug: 'low-back-ache',
    signalName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    bodyAreaKey: 'low_back',
    valueKind: 'coach_tap',
    valueLabel: 'Often',
    valueNumeric: 6,
    sourceKey: 'coach_entered',
    sourceLabel: 'Coach entered',
    entryMode: 'coach_entered',
    capturedOn: '2026-09-14',
  });

  const WIDE_MAP = () =>
    mapEntry([
      component('primary', 'body_area', 'hip', { position: 0, refLabel: 'Hip' }),
      component('related', 'category', 'kidney_bladder', { position: 1, refLabel: 'Kidney/Bladder' }),
      component('related', 'category', 'respiratory', { position: 2, refLabel: 'Breathing' }),
      component('related', 'category', 'posture_alignment', { position: 3, refLabel: 'Posture' }),
      component('related', 'body_area', 'low_back', { position: 4, refLabel: 'Low back' }),
    ]);

  function run(records: SignalRecord[]) {
    const trigger = hipComplaintRow();
    return lookupOne(
      WIDE_MAP(),
      new Set([trigger.id]),
      groupHistories([trigger, ...records]),
      [trigger, ...records],
      TODAY,
      new Set()
    );
  }

  it('14. checks the Body Systems section result the map names', () => {
    const finding = run([bodySystems]);
    const kidney = finding.areas.find((area) => area.refKey === 'kidney_bladder')!;
    expect(kidney.state).toBe('current');
    expect(kidney.rows[0]!.record.valueLabel).toBe('Speaking loudly');
  });

  it('15. retrieves the individual questionnaire responses under that section', () => {
    const finding = run([bodySystems, individual]);
    const kidney = finding.areas.find((area) => area.refKey === 'kidney_bladder')!;
    const prompts = kidney.rows.map((row) => row.record.sourceQuestionPrompt);
    expect(prompts).toContain('I need to urinate more often than feels normal.');
    // The section result AND the question under it, which is the whole
    // point: a coach needs to know WHY the system was brought forward.
    expect(kidney.rows).toHaveLength(2);
  });

  it('16. uses breathing findings where the map names them', () => {
    const finding = run([breathing]);
    const area = finding.areas.find((a) => a.refKey === 'respiratory')!;
    expect(area.rows[0]!.record.sourceLabel).toBe('Breathing Pattern Check-In');
  });

  it('17. uses posture findings where the map names them', () => {
    const finding = run([posture]);
    const area = finding.areas.find((a) => a.refKey === 'posture_alignment')!;
    expect(area.rows[0]!.record.sourceLabel).toBe('Posture and movement assessment');
  });

  it('18. uses pain and musculoskeletal findings where the map names them', () => {
    const finding = run([coachEntered]);
    const area = finding.areas.find((a) => a.refKey === 'low_back')!;
    expect(area.rows).toHaveLength(1);
  });

  it('19. uses coach-entered findings exactly as it uses ingested ones', () => {
    const finding = run([coachEntered]);
    const area = finding.areas.find((a) => a.refKey === 'low_back')!;
    expect(area.rows[0]!.record.entryMode).toBe('coach_entered');
  });

  it('every row it reports names its own source and its own day', () => {
    const finding = run([bodySystems, individual, breathing, posture, coachEntered]);
    for (const area of finding.areas) {
      for (const row of area.rows) {
        expect(row.record.sourceLabel.length).toBeGreaterThan(0);
        expect(row.record.capturedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 20 and 21. Current, recent, historical, resolved.
// ---------------------------------------------------------------------

describe('recency and resolution', () => {
  it('counts whole days between two bare local days', () => {
    expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
  });

  it('20. separates current evidence from historical evidence', () => {
    const current = signal({
      id: 'c1',
      signalSlug: 'frequent-urination',
      categoryKey: 'kidney_bladder',
      bodyAreaKey: null,
      valueNumeric: 6,
      capturedOn: '2026-09-10',
    });
    const old = signal({
      id: 'h1',
      signalSlug: 'waking-at-night-to-urinate',
      categoryKey: 'kidney_bladder',
      bodyAreaKey: null,
      valueNumeric: 6,
      capturedOn: '2026-01-01',
    });
    const trigger = hipComplaintRow();
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories([trigger, current, old]),
      [trigger, current, old],
      TODAY,
      new Set()
    );
    const kidney = finding.areas.find((a) => a.refKey === 'kidney_bladder')!;
    const states = new Map(kidney.rows.map((row) => [row.record.id, row.state]));
    expect(states.get('c1')).toBe('current');
    expect(states.get('h1')).toBe('historical');
  });

  it('21. a resolved symptom does not silently count as current', () => {
    // The brief's own case: bloating a year ago, Never on the last two
    // assessments. It is history, and it must never be support.
    const history = groupHistories([
      signal({
        id: 'b1',
        signalSlug: 'bloated-stomach',
        categoryKey: 'digestion',
        bodyAreaKey: null,
        valueNumeric: 6,
        capturedOn: '2025-09-01',
      }),
      signal({
        id: 'b2',
        signalSlug: 'bloated-stomach',
        categoryKey: 'digestion',
        bodyAreaKey: null,
        valueNumeric: 0,
        valueLabel: 'Never',
        capturedOn: '2026-06-01',
      }),
      signal({
        id: 'b3',
        signalSlug: 'bloated-stomach',
        categoryKey: 'digestion',
        bodyAreaKey: null,
        valueNumeric: 0,
        valueLabel: 'Never',
        capturedOn: '2026-09-01',
      }),
    ]);
    expect(history).toHaveLength(1);
    const state = evidenceStateOf(history[0]!, TODAY);
    expect(state).toBe('resolved');
    expect(isLiveState(state!)).toBe(false);
  });

  it('21b. a signal she has only ever answered Never is not evidence of anything', () => {
    const history = groupHistories([
      signal({
        id: 'n1',
        signalSlug: 'constipation',
        valueNumeric: 0,
        valueLabel: 'Never',
        capturedOn: '2026-09-01',
      }),
    ]);
    expect(evidenceStateOf(history[0]!, TODAY)).toBeNull();
  });

  it('21c. a resolved row is reported as resolved rather than vanishing', () => {
    const resolved = [
      signal({
        id: 'r1',
        signalSlug: 'frequent-urination',
        categoryKey: 'kidney_bladder',
        bodyAreaKey: null,
        valueNumeric: 6,
        capturedOn: '2026-01-01',
      }),
      signal({
        id: 'r2',
        signalSlug: 'frequent-urination',
        categoryKey: 'kidney_bladder',
        bodyAreaKey: null,
        valueNumeric: 0,
        valueLabel: 'Never',
        capturedOn: '2026-09-01',
      }),
    ];
    const trigger = hipComplaintRow();
    const all = [trigger, ...resolved];
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories(all),
      all,
      TODAY,
      new Set()
    );
    const kidney = finding.areas.find((a) => a.refKey === 'kidney_bladder')!;
    // Found, and correctly NOT counted as something currently reported.
    expect(kidney.rows).toHaveLength(1);
    expect(kidney.rows[0]!.state).toBe('resolved');
    expect(kidney.state).toBe('resolved');
    expect(finding.currentCount).toBe(0);
  });

  it('an area with nothing under it reads as not observed, which is information', () => {
    const trigger = hipComplaintRow();
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories([trigger]),
      [trigger],
      TODAY,
      new Set()
    );
    expect(finding.areas.every((area) => area.state === 'not_observed')).toBe(true);
    expect(finding.notObservedCount).toBe(3);
    // AND IT STILL SURFACES. A floor would have thrown this away, and
    // "the map says look here and there is nothing" is worth saying.
    expect(finding.surfaced).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 22 and 23. Many to one, and one to many.
// ---------------------------------------------------------------------

describe('convergence, in both directions', () => {
  it('23. one complaint leads Root to inspect several areas', () => {
    const trigger = hipComplaintRow();
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories([trigger]),
      [trigger],
      TODAY,
      new Set()
    );
    expect(finding.areas).toHaveLength(3);
    expect(finding.areas.map((a) => a.refKey)).toEqual([
      'kidney_bladder',
      'stress',
      'low_back',
    ]);
  });

  it('22. several complaints converge on one area', () => {
    const stressRow = signal({
      id: 's1',
      signalSlug: 'feeling-tense',
      categoryKey: 'stress',
      bodyAreaKey: null,
      valueNumeric: 6,
      capturedOn: TODAY,
    });
    const hip = hipComplaintRow();
    const sleepTrigger = signal({
      id: 'trigger-2',
      signalSlug: 'lighter-or-broken-sleep',
      categoryKey: 'sleep',
      bodyAreaKey: null,
      capturedOn: TODAY,
      valueNumeric: null,
      valueKind: 'presence',
    });

    const sleepMap = summary({
      head: head({ id: 'map-2', patternKey: 'starter-sleep', isActive: true, isSeeded: true }),
      current: version({
        patternName: 'Sleep signals, whole-body areas worth reviewing',
        surfacesOnComplaint: true,
        components: [
          component('primary', 'category', 'sleep', { position: 0, refLabel: 'Sleep' }),
          component('related', 'category', 'stress', { position: 1, refLabel: 'Stress' }),
        ],
      }),
    });

    const all = [hip, sleepTrigger, stressRow];
    const a = lookupForComplaint([HIP_MAP()], new Set([hip.id]), all, TODAY);
    const b = lookupForComplaint([sleepMap], new Set([sleepTrigger.id]), all, TODAY);

    const converged = convergentAreas([...a, ...b], (finding) =>
      finding.head.id === 'map-1' ? 'my hip clicks' : 'I have not been sleeping'
    );
    const stress = converged.find((area) => area.refKey === 'stress');
    expect(stress).toBeDefined();
    expect(stress!.findingCount).toBe(2);
    expect(stress!.fromComplaints).toHaveLength(2);
  });

  it('22b. an area where nothing was found is not a convergence', () => {
    // Three silences are not an overlap, and reporting them as one would
    // be the engine inventing significance out of absence.
    const hip = hipComplaintRow();
    const findings = lookupForComplaint([HIP_MAP()], new Set([hip.id]), [hip], TODAY);
    expect(convergentAreas(findings, () => 'x')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 24. Root cannot invent an association.
// ---------------------------------------------------------------------

describe('Root uses only what is in the map', () => {
  it('24. never reports an area the map entry does not name', () => {
    const unrelated = signal({
      id: 'u1',
      signalSlug: 'skin-breakouts',
      categoryKey: 'skin_immune',
      bodyAreaKey: 'skin',
      capturedOn: TODAY,
    });
    const trigger = hipComplaintRow();
    const all = [trigger, unrelated];
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories(all),
      all,
      TODAY,
      new Set()
    );
    const keys = finding.areas.map((area) => area.refKey);
    expect(keys).not.toContain('skin_immune');
    expect(keys).not.toContain('skin');
    for (const area of finding.areas) {
      for (const row of area.rows) {
        expect(row.record.id).not.toBe('u1');
      }
    }
  });

  it('24b. with an empty map it surfaces nothing at all', () => {
    const trigger = hipComplaintRow();
    expect(lookupForComplaint([], new Set([trigger.id]), [trigger], TODAY)).toHaveLength(0);
  });

  it('every area it reports carries the label the coach stored, not one it composed', () => {
    const trigger = hipComplaintRow();
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories([trigger]),
      [trigger],
      TODAY,
      new Set()
    );
    expect(finding.areas.map((a) => a.refLabel)).toEqual([
      'Kidney/Bladder',
      'Stress',
      'Low back',
    ]);
  });
});

// ---------------------------------------------------------------------
// 39. Deactivation, and the separation of the two engines.
// ---------------------------------------------------------------------

describe('active and inactive', () => {
  it('39. a deactivated entry immediately stops participating', () => {
    const trigger = hipComplaintRow();
    const off = summary({
      head: head({ id: 'map-1', isActive: false, isSeeded: true }),
      current: HIP_MAP().current,
    });
    expect(lookupForComplaint([off], new Set([trigger.id]), [trigger], TODAY)).toHaveLength(0);
    expect(complaintDrivenEntries([off])).toHaveLength(0);
  });

  it('the two engines never read the same entry', () => {
    const mapOnly = HIP_MAP();
    // The floor-based matcher must not see a map entry, or one relationship
    // would face the coach twice saying two different things.
    expect(matchMemberSignals([mapOnly], [hipComplaintRow()])).toHaveLength(0);
    expect(complaintDrivenEntries([mapOnly])).toHaveLength(1);
  });

  it('a floor-based definition is invisible to the complaint lookup', () => {
    const classic = summary({
      head: head({ id: 'rel-classic', isActive: true }),
      current: version({
        surfacesOnComplaint: false,
        components: [component('primary', 'body_area', 'hip', { position: 0 })],
      }),
    });
    const trigger = hipComplaintRow();
    expect(complaintDrivenEntries([classic])).toHaveLength(0);
    expect(lookupForComplaint([classic], new Set([trigger.id]), [trigger], TODAY)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 29. The red flag system always wins.
// ---------------------------------------------------------------------

describe('the safety override', () => {
  it('29. one flagged contributing row withholds the whole finding', () => {
    const flagged = signal({
      id: 'flagged-1',
      signalSlug: 'frequent-urination',
      categoryKey: 'kidney_bladder',
      bodyAreaKey: null,
      valueNumeric: 6,
      capturedOn: TODAY,
    });
    const trigger = hipComplaintRow();
    const all = [trigger, flagged];
    const finding = lookupOne(
      HIP_MAP(),
      new Set([trigger.id]),
      groupHistories(all),
      all,
      TODAY,
      new Set(['flagged-1'])
    );
    expect(finding.safetyWithheld).toBe(true);
    expect(finding.withheldSignalNames.length).toBeGreaterThan(0);
  });

  it('29b. a flagged finding contributes nothing to a convergence', () => {
    const flagged = signal({
      id: 'flagged-2',
      signalSlug: 'feeling-tense',
      categoryKey: 'stress',
      bodyAreaKey: null,
      valueNumeric: 6,
      capturedOn: TODAY,
    });
    const trigger = hipComplaintRow();
    const all = [trigger, flagged];
    const findings = lookupForComplaint(
      [HIP_MAP()],
      new Set([trigger.id]),
      all,
      TODAY,
      new Set(['flagged-2'])
    );
    expect(convergentAreas(findings, () => 'x')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// The frequency and severity floor the map may set.
// ---------------------------------------------------------------------

describe('a minimum the coach set is honoured', () => {
  it('a row below the floor does not count as support', () => {
    const rarely = signal({
      id: 'rare-1',
      signalSlug: 'frequent-urination',
      categoryKey: 'kidney_bladder',
      bodyAreaKey: null,
      valueNumeric: 1,
      valueLabel: 'Rarely',
      capturedOn: TODAY,
    });
    const entry = mapEntry([
      component('primary', 'body_area', 'hip', { position: 0, refLabel: 'Hip' }),
      component('related', 'category', 'kidney_bladder', {
        position: 1,
        refLabel: 'Kidney/Bladder',
        minValueNumeric: 6,
      }),
    ]);
    const trigger = hipComplaintRow();
    const all = [trigger, rarely];
    const finding = lookupOne(
      entry,
      new Set([trigger.id]),
      groupHistories(all),
      all,
      TODAY,
      new Set()
    );
    const kidney = finding.areas.find((a) => a.refKey === 'kidney_bladder')!;
    expect(kidney.rows).toHaveLength(0);
    expect(kidney.state).toBe('not_observed');
  });

  it('a row at or above the floor does count', () => {
    const often = signal({
      id: 'often-1',
      signalSlug: 'frequent-urination',
      categoryKey: 'kidney_bladder',
      bodyAreaKey: null,
      valueNumeric: 6,
      valueLabel: 'Often',
      capturedOn: TODAY,
    });
    const entry = mapEntry([
      component('primary', 'body_area', 'hip', { position: 0, refLabel: 'Hip' }),
      component('related', 'category', 'kidney_bladder', {
        position: 1,
        refLabel: 'Kidney/Bladder',
        minValueNumeric: 6,
      }),
    ]);
    const trigger = hipComplaintRow();
    const all = [trigger, often];
    const finding = lookupOne(
      entry,
      new Set([trigger.id]),
      groupHistories(all),
      all,
      TODAY,
      new Set()
    );
    expect(finding.areas[0]!.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// 34. No combined score exists anywhere in what it produces.
// ---------------------------------------------------------------------

describe('nothing is scored and nothing is combined', () => {
  it('34. a finding carries no key that could hold a score or a confidence', () => {
    const trigger = hipComplaintRow();
    const [finding] = lookupForComplaint([HIP_MAP()], new Set([trigger.id]), [trigger], TODAY);
    const forbidden = /score|total|index|percent|severity|confidence|grade|rating|risk/i;
    for (const key of Object.keys(finding!)) {
      expect(key, `${key} on a finding`).not.toMatch(forbidden);
    }
    for (const area of finding!.areas) {
      for (const key of Object.keys(area)) {
        expect(key, `${key} on an area`).not.toMatch(forbidden);
      }
    }
  });

  it('34b. the counts it does carry are counts of her rows, never added together', () => {
    const trigger = hipComplaintRow();
    const [finding] = lookupForComplaint([HIP_MAP()], new Set([trigger.id]), [trigger], TODAY);
    expect(finding!.currentCount + finding!.notObservedCount).toBeLessThanOrEqual(
      finding!.areas.length
    );
  });
});

// ---------------------------------------------------------------------
// 25 and 26. The coach builds nothing and searches for nothing.
// ---------------------------------------------------------------------

describe('the coach does no manual work for any of this', () => {
  it('25 and 26. the whole lookup runs from a complaint and a seeded map alone', () => {
    // No coach-authored pattern, no per-client configuration, and no
    // search: the only inputs are the row her sentence produced and the
    // entries the build seeded.
    const trigger = hipComplaintRow();
    const seededOnly = HIP_MAP();
    expect(seededOnly.head.isSeeded).toBe(true);
    const findings = lookupForComplaint(
      [seededOnly],
      new Set([trigger.id]),
      [trigger],
      TODAY
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.version.patternName).toContain('worth reviewing');
  });
});
