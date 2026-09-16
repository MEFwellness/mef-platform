/**
 * Literal signals, literal definitions, and the helpers that build them.
 *
 * THE MATCHER IS PURE, so every case in the engine's own test file runs
 * with no database at all. Both builders below take overrides rather than
 * being shaped for one scenario, because a fixture that only supports the
 * happy path is how a test suite stops being able to describe a bug.
 */

import type {
  RelationshipComponent,
  RelationshipHead,
  RelationshipStrengthLevel,
  RelationshipSummary,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import type { SignalRecord } from '@/lib/cross-system-signals/types';

let nextId = 0;

/** A fresh id per row, so two signals in one case are never the same row. */
export function resetFixtureIds(): void {
  nextId = 0;
}

/**
 * One stored signal row.
 *
 * The defaults are a Body Systems Survey answer, because that is the
 * source most cases are about and the one the red flag override reaches.
 */
export function signal(overrides: Partial<SignalRecord> = {}): SignalRecord {
  nextId += 1;
  const slug = overrides.signalSlug ?? 'hip-clicking';
  return {
    id: `sig-${nextId}`,
    memberId: 'member-1',
    signalSlug: slug,
    signalName: 'Hip clicking',
    categoryKey: 'joint_movement',
    bodyAreaKey: 'hip',
    symptomKey: 'clicking',
    side: null,
    valueKind: 'scale',
    valueLabel: 'Often',
    valueKey: 'often',
    valueNumeric: 6,
    sourceKey: 'body_systems_survey',
    sourceLabel: 'Rooted Reset Body Systems Survey',
    sourceSessionId: 'sitting-1',
    sourceQuestionRef: 'M7',
    sourceQuestionPrompt: 'How often does your hip click or snap?',
    sourceRecordId: null,
    capturedOn: '2026-09-01',
    capturedAt: '2026-09-01T10:00:00.000Z',
    note: null,
    enteredBy: null,
    entryMode: 'ingested',
    ...overrides,
  };
}

/** One input of a definition. Position is assigned by `version` below. */
export function component(
  overrides: Partial<RelationshipComponent> & Pick<RelationshipComponent, 'role' | 'refKind' | 'refKey'>
): RelationshipComponent {
  nextId += 1;
  return {
    id: `cmp-${nextId}`,
    position: 0,
    refLabel: overrides.refKey,
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

/**
 * The two levels a new pattern starts with, as stored rows.
 *
 * Deliberately the shipped defaults rather than an invention, because the
 * engine's Emerging and Stronger cases have to be about the ladder a coach
 * really gets when she presses New.
 */
export function defaultLevels(): RelationshipStrengthLevel[] {
  return [
    {
      levelKey: 'emerging',
      position: 1,
      displayLabel: 'Emerging',
      minSupportingSignals: 2,
      minDistinctCategories: null,
      minRelatedSignals: null,
    },
    {
      levelKey: 'stronger',
      position: 2,
      displayLabel: 'Stronger',
      minSupportingSignals: 3,
      minDistinctCategories: 2,
      minRelatedSignals: null,
    },
  ];
}

export function version(overrides: Partial<RelationshipVersion> = {}): RelationshipVersion {
  const components = (overrides.components ?? []).map((entry, index) => ({
    ...entry,
    position: entry.position || index + 1,
  }));
  return {
    id: 'ver-1',
    relationshipId: 'rel-1',
    versionNumber: 1,
    patternName: 'Hip area signals observed alongside kidney and bladder signals',
    minSupportingSignals: 2,
    possibleAssociationText: 'These are observed together and may be worth exploring.',
    evidenceNotes: 'My own reading.',
    changeSummary: null,
    createdBy: 'coach-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    strengthLevels: defaultLevels(),
    considerations: [
      { id: 'con-1', position: 1, body: 'Ask what else she has noticed in the same week.' },
    ],
    ...overrides,
    components,
  };
}

export function head(overrides: Partial<RelationshipHead> = {}): RelationshipHead {
  return {
    id: 'rel-1',
    patternKey: 'hip-and-bladder',
    isActive: true,
    isExample: false,
    currentVersion: 1,
    createdBy: 'coach-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A whole definition: a hip primary, a kidney and bladder related input,
 * and two supporting signals. It is the shape the brief describes, and
 * every threshold case overrides one piece of it.
 */
export function summary(overrides: {
  head?: Partial<RelationshipHead>;
  current?: Partial<RelationshipVersion>;
} = {}): RelationshipSummary {
  return {
    head: head(overrides.head),
    current: version({
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
      ],
      ...overrides.current,
    }),
  };
}
