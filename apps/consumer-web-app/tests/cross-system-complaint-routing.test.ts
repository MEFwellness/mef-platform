/**
 * A SENTENCE, END TO END, THROUGH THE REAL LEXICON AND THE REAL MAP.
 *
 * WHAT THIS PROVES THAT NOTHING ELSE DOES. The classifier tests prove the
 * matcher. The map tests prove the map is well formed. Neither of them
 * answers the question a coach actually has: a member typed this sentence,
 * did Root send me anywhere sensible? So this file joins the two halves.
 * It reads the shipped lexicon out of the migrations, classifies a real
 * sentence with it, turns the result into the signal rows the pipeline
 * would write, builds the real map out of its own migrations, and runs the
 * real lookup over both.
 *
 * NOTHING HERE TOUCHES A DATABASE. Every input is parsed from the SQL that
 * deploys, which is what makes this a test of the shipped feature rather
 * than of a fixture written to agree with it.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyComplaint } from '@/lib/cross-system-complaints/classify';
import { signalDraftsFor } from '@/lib/cross-system-complaints/data';
import { lookupForComplaint } from '@/lib/cross-system-root/lookup';
import type { RelationshipSummary } from '@/lib/cross-system-relationships/types';
import type { SignalLibrary, SignalRecord } from '@/lib/cross-system-signals/types';
import { shippedLexicon } from './cross-system-complaint-fixture';
import { canonicalVocabulary, shippedMap, type MapEntry } from './cross-system-map-fixture';
import { head, signal, summary, version } from './cross-system-pattern-fixture';

const TODAY = '2026-09-16';
const LEXICON = shippedLexicon();
const VOCAB = canonicalVocabulary();
const MAP_ENTRIES = shippedMap();

/**
 * The category the Signal Library files a slug under, read out of the
 * content migrations rather than guessed, because the map routes on it.
 */
function categoryOfSignal(slug: string): string {
  return SIGNAL_CATEGORY.get(slug) ?? 'other';
}

const SIGNAL_CATEGORY: Map<string, string> = (() => {
  const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
  const out = new Map<string, string>();
  for (const file of [
    '00000000000241_cross_system_signal_content.sql',
    '00000000000251_cross_system_vocabulary_expansion.sql',
  ]) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const row of sql.matchAll(
      /\(\s*'([a-z0-9-]+)',\s*'(?:[^']|'')*',\s*'([a-z_]+)',/g
    )) {
      if (!out.has(row[1]!)) out.set(row[1]!, row[2]!);
    }
  }
  return out;
})();

/**
 * A library just wide enough to name everything the vocabulary holds.
 *
 * The display names are the slugs, on purpose: this file is about ROUTING,
 * and a routing test that depended on a label would fail the day somebody
 * improved one. The real labels are under test in the copy guard.
 */
const LIBRARY: SignalLibrary = {
  categories: new Map(
    [...VOCAB.categories].map((key) => [key, { categoryKey: key, position: 0, displayName: key }])
  ),
  bodyAreas: new Map(
    [...VOCAB.bodyAreas].map((key) => [
      key,
      {
        areaKey: key,
        position: 0,
        displayName: key,
        // Every area except the handful that genuinely have no sides.
        takesSide: !['head', 'abdomen', 'throat', 'skin', 'whole_body'].includes(key),
      },
    ])
  ),
  symptoms: new Map(),
  names: new Map(
    [...VOCAB.signals].map((slug) => [
      slug,
      {
        signalSlug: slug,
        displayName: slug,
        categoryKey: categoryOfSignal(slug),
        defaultBodyAreaKey: null,
        defaultSymptomKey: null,
        searchTerms: '',
        isCoachAddable: true,
      },
    ])
  ),
  sources: new Map([
    ['member_reported', { sourceKey: 'member_reported', position: 1, displayName: 'Reported by the member', assessmentDefinitionId: null, isActive: true }],
    ['coach_reported', { sourceKey: 'coach_reported', position: 2, displayName: 'Reported to the coach', assessmentDefinitionId: null, isActive: true }],
  ]),
  mappings: new Map(),
};

/** The shipped map, as the lookup's own type. */
function asSummaries(entries: readonly MapEntry[]): RelationshipSummary[] {
  return entries.map((entry, index) =>
    summary({
      head: head({
        id: `rel-${index}`,
        patternKey: entry.patternKey,
        isActive: true,
        isSeeded: true,
      }),
      current: version({
        id: `ver-${index}`,
        patternName: entry.patternName,
        surfacesOnComplaint: true,
        sourceTypeKey: entry.sourceTypeKey,
        possibleAssociationText: entry.association,
        components: [
          ...entry.primaries.map((component, position) => ({
            id: `${entry.patternKey}-p-${position}`,
            position,
            role: 'primary' as const,
            refKind: component.kind,
            refKey: component.key,
            refLabel: component.key,
            side: null,
            valueKey: null,
            valueLabel: null,
            minValueNumeric: component.min,
            sourceKey: null,
            sourceQuestionRef: null,
            sourceQuestionPrompt: null,
            note: null,
          })),
          ...entry.related.map((component, position) => ({
            id: `${entry.patternKey}-r-${position}`,
            position: entry.primaries.length + position,
            role: 'related' as const,
            refKind: component.kind,
            refKey: component.key,
            refLabel: component.key,
            side: null,
            valueKey: null,
            valueLabel: null,
            minValueNumeric: component.min,
            sourceKey: null,
            sourceQuestionRef: null,
            sourceQuestionPrompt: null,
            note: null,
          })),
        ],
      }),
    })
  );
}

const MAP = asSummaries(MAP_ENTRIES);

const REPORT = {
  id: 'report-1',
  rawText: '',
  fieldRef: 'optional_notes',
  fieldPrompt: 'Anything else worth noting?',
  surfaceKey: 'daily_checkin_notes',
  surfaceLabel: 'Daily check-in notes',
  reportedOn: TODAY,
  reportedAt: `${TODAY}T09:00:00.000Z`,
  authorRole: 'member' as const,
};

/**
 * One complaint, all the way through: her words, the canonical rows they
 * become, and every map entry those rows reach.
 */
function route(text: string, extraRows: SignalRecord[] = []) {
  const drafts = classifyComplaint(text, LEXICON);
  const signalDrafts = signalDraftsFor({ ...REPORT, rawText: text }, drafts, LIBRARY);
  const rows: SignalRecord[] = signalDrafts.map((draft, index) =>
    signal({
      id: `new-${index}`,
      signalSlug: draft.signalSlug,
      signalName: draft.signalName,
      categoryKey: draft.categoryKey,
      bodyAreaKey: draft.bodyAreaKey,
      side: draft.side,
      valueKind: draft.valueKind,
      valueLabel: draft.valueLabel,
      valueKey: draft.valueKey,
      valueNumeric: draft.valueNumeric,
      capturedOn: TODAY,
      capturedAt: `${TODAY}T09:00:00.000Z`,
      ingestFingerprint: draft.ingestFingerprint,
    })
  );
  const all = [...rows, ...extraRows];
  const triggerIds = new Set(rows.map((row) => row.id));
  const findings = lookupForComplaint(MAP, triggerIds, all, TODAY);
  return { drafts, rows, findings, keys: findings.map((finding) => finding.head.patternKey) };
}

/** Every area any triggered entry sent Root to look at. */
function areasReached(text: string): Set<string> {
  const out = new Set<string>();
  for (const finding of route(text).findings) {
    for (const area of finding.areas) out.add(`${area.refKind}::${area.refKey}`);
  }
  return out;
}

describe('the map really is loaded, and really is the shipped one', () => {
  it('is over two hundred entries and every one of them is complaint driven', () => {
    expect(MAP.length).toBeGreaterThan(200);
    expect(MAP.every((entry) => entry.current.surfacesOnComplaint)).toBe(true);
  });
});

describe('a complaint at every major joint routes somewhere sensible', () => {
  const JOINTS: Array<[string, string, string]> = [
    ['cervical spine', 'My neck has been aching all week.', 'neck'],
    ['thoracic spine', 'My upper back is tight.', 'upper_back'],
    ['mid back', 'My mid back has been sore.', 'mid_back'],
    ['lumbar spine', 'My lower back has been aching.', 'low_back'],
    ['sacroiliac joint', 'My sacroiliac joint has been aching.', 'si_joint'],
    ['shoulder', 'My right shoulder keeps clicking.', 'shoulder'],
    ['elbow', 'My elbow has been aching.', 'elbow'],
    ['wrist', 'My wrist has been aching.', 'wrist'],
    ['hand', 'My hands go numb at night.', 'hand'],
    ['hip', 'My right hip has been clicking when I walk.', 'hip'],
    ['knee', 'My left knee has been grinding on stairs.', 'knee'],
    ['ankle', 'My ankle keeps giving way.', 'ankle'],
    ['foot', 'My foot has been aching in the morning.', 'foot'],
    ['jaw', 'My jaw clicks when I chew.', 'jaw'],
  ];

  it.each(JOINTS)('%s: the complaint is classified at the right place', (_name, text, areaKey) => {
    const { drafts } = route(text);
    expect(drafts.length, text).toBeGreaterThan(0);
    expect(drafts.some((draft) => draft.bodyAreaKey === areaKey), text).toBe(true);
  });

  it.each(JOINTS)('%s: the complaint reaches at least one map entry', (_name, text) => {
    const { findings } = route(text);
    expect(findings.length, text).toBeGreaterThan(0);
  });

  it.each(JOINTS)('%s: Root is sent beyond the painful location', (_name, text, areaKey) => {
    const reached = areasReached(text);
    const elsewhere = [...reached].filter((key) => key !== `body_area::${areaKey}`);
    expect(elsewhere.length, `${text} reached ${[...reached].join(', ')}`).toBeGreaterThanOrEqual(4);
  });
});

describe('a complaint in every organ and gland system routes somewhere sensible', () => {
  const SYSTEMS: Array<[string, string, string]> = [
    ['kidney and bladder', 'I have been getting up twice in the night to pee.', 'kidney_bladder'],
    ['digestion and gut', 'I feel really bloated after meals.', 'digestion'],
    ['liver and gallbladder clearance', 'Greasy food makes me feel awful.', 'clearance_detox'],
    ['adrenals and stress', 'I am wired and tired every evening.', 'stress'],
    ['thyroid and metabolism', 'I feel the cold when nobody else does and my weight has changed.', 'metabolic'],
    ['reproductive and hormonal', 'My periods have been heavy and painful.', 'hormonal'],
    ['heart and circulation', 'My heart has been racing at rest.', 'circulation'],
    ['lungs and breathing', 'I cannot get a deep breath.', 'respiratory'],
    ['immune and lymph', 'My glands are up and I keep getting sick.', 'immune'],
    ['skin as elimination', 'My skin has been breaking out and it is so itchy.', 'skin_immune'],
  ];

  it.each(SYSTEMS)('%s: the complaint is classified into that system', (_name, text, categoryKey) => {
    const { rows } = route(text);
    expect(rows.length, text).toBeGreaterThan(0);
    expect(rows.some((row) => row.categoryKey === categoryKey), `${text} -> ${rows.map((r) => r.categoryKey).join(', ')}`).toBe(true);
  });

  it.each(SYSTEMS)('%s: it reaches the map and is sent to body areas as well', (_name, text) => {
    const { findings } = route(text);
    expect(findings.length, text).toBeGreaterThan(0);
    const reached = areasReached(text);
    const bodyAreas = [...reached].filter((key) => key.startsWith('body_area::'));
    expect(bodyAreas.length, `${text} reached ${[...reached].join(', ')}`).toBeGreaterThan(0);
  });
});

describe('a posture finding routes back to the complaint areas it belongs to', () => {
  const PATTERNS: Array<[string, string]> = [
    ['upper cross', 'upper-crossed-pattern'],
    ['lower cross', 'lower-crossed-pattern'],
    ['forward head', 'forward-head-posture'],
    ['flat back', 'flat-back-pattern'],
    ['sway back', 'sway-back-pattern'],
  ];

  it.each(PATTERNS)('%s reaches an entry and points at body areas', (_name, slug) => {
    // A posture finding is not something a member types, it is something an
    // assessment records, so this drives the row directly rather than a
    // sentence. It is the same lookup either way.
    const row = signal({
      id: 'posture-1',
      signalSlug: slug,
      signalName: slug,
      categoryKey: 'posture_alignment',
      bodyAreaKey: null,
      valueKind: 'presence',
      valueLabel: 'Observed',
      valueKey: null,
      valueNumeric: null,
      capturedOn: TODAY,
      capturedAt: `${TODAY}T09:00:00.000Z`,
    });
    const findings = lookupForComplaint(MAP, new Set(['posture-1']), [row], TODAY);
    expect(findings.length, slug).toBeGreaterThan(0);
    const areas = findings.flatMap((finding) => finding.areas);
    expect(areas.some((area) => area.refKind === 'body_area'), slug).toBe(true);
  });
});

describe('a lifestyle complaint routes somewhere sensible', () => {
  const LIFESTYLE: Array<[string, string]> = [
    ['nervous-system load', 'I cannot switch off in the evenings.'],
    ['stress physiology', 'Small things are setting me off at the moment.'],
    ['sleep', 'I have been lying awake for hours every night.'],
    ['mood', 'I have been so irritable and flat.'],
    ['blood sugar and energy', 'I crash every afternoon and crave sugar.'],
    ['hydration', 'I hardly drink water and my mouth is dry.'],
    ['elimination', 'I have been straining and not going every day.'],
  ];

  it.each(LIFESTYLE)('%s reaches the map', (_name, text) => {
    const { findings, drafts } = route(text);
    expect(drafts.length, text).toBeGreaterThan(0);
    expect(findings.length, text).toBeGreaterThan(0);
  });
});

describe('the links resolve in both directions', () => {
  it('a body complaint is sent to systems', () => {
    const reached = areasReached('My lower back has been aching.');
    const systems = [...reached].filter((key) => key.startsWith('category::'));
    expect(systems.length).toBeGreaterThan(0);
  });

  it('a system complaint is sent back to body areas', () => {
    const reached = areasReached('I have been getting up twice in the night to pee.');
    const areas = [...reached].filter((key) => key.startsWith('body_area::'));
    expect(areas.length).toBeGreaterThan(0);
  });

  it('the two directions really are different entries, not one read twice', () => {
    const outward = route('My lower back has been aching.').keys;
    const inward = route('I have been getting up twice in the night to pee.').keys;
    expect(outward.length).toBeGreaterThan(0);
    expect(inward.length).toBeGreaterThan(0);
    expect(outward.some((key) => !inward.includes(key))).toBe(true);
  });
});

describe('a resolution never surfaces as a current complaint', () => {
  it('a sentence closing something out triggers no finding at all', () => {
    const { rows, findings } = route('My headaches have stopped.');
    expect(rows.length).toBeGreaterThan(0);
    // The row exists, and it is at nought, which is what makes it settled.
    expect(rows.every((row) => row.valueNumeric === 0)).toBe(true);
    // And a settled row can never answer a map entry's primary, so nothing
    // surfaces claiming she is reporting it now.
    expect(findings).toHaveLength(0);
  });

  it('a reopened complaint DOES surface, because she is reporting it now', () => {
    const { findings } = route('My headaches had stopped but they have come back.');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('a live complaint beside a settled one still surfaces', () => {
    const { findings, rows } = route(
      'My headaches have stopped but my right hip is still clicking.'
    );
    expect(rows.some((row) => row.valueNumeric === 0)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    const hipReached = findings.some((finding) =>
      finding.triggerRecords.some((record) => record.bodyAreaKey === 'hip')
    );
    expect(hipReached).toBe(true);
  });
});

describe('deactivating an entry removes it from every lookup immediately', () => {
  it('the entry disappears the moment it is switched off', () => {
    const text = 'My left knee has been grinding on stairs.';
    const before = route(text).keys;
    expect(before.length).toBeGreaterThan(0);

    const target = before[0]!;
    const withoutIt = MAP.map((entry) =>
      entry.head.patternKey === target
        ? { ...entry, head: { ...entry.head, isActive: false } }
        : entry
    );
    const drafts = classifyComplaint(text, LEXICON);
    const signalDrafts = signalDraftsFor({ ...REPORT, rawText: text }, drafts, LIBRARY);
    const rows: SignalRecord[] = signalDrafts.map((draft, index) =>
      signal({
        id: `new-${index}`,
        signalSlug: draft.signalSlug,
        signalName: draft.signalName,
        categoryKey: draft.categoryKey,
        bodyAreaKey: draft.bodyAreaKey,
        side: draft.side,
        valueKind: draft.valueKind,
        valueLabel: draft.valueLabel,
        valueKey: draft.valueKey,
        valueNumeric: draft.valueNumeric,
        capturedOn: TODAY,
        capturedAt: `${TODAY}T09:00:00.000Z`,
      })
    );
    const after = lookupForComplaint(
      withoutIt,
      new Set(rows.map((row) => row.id)),
      rows,
      TODAY
    ).map((finding) => finding.head.patternKey);

    expect(after).not.toContain(target);
    // And nothing else moved: the rest of the map answered exactly as before.
    expect(after).toEqual(before.filter((key) => key !== target));
  });
});

describe('the lookup never reaches outside the canonical vocabulary', () => {
  it('every area of every finding names a real key', () => {
    for (const text of [
      'My right hip has been clicking when I walk.',
      'I feel bloated after meals and my skin is breaking out.',
      'Both knees grind and my lower back aches after sitting.',
    ]) {
      for (const finding of route(text).findings) {
        for (const area of finding.areas) {
          const known =
            area.refKind === 'signal'
              ? VOCAB.signals.has(area.refKey)
              : area.refKind === 'category'
                ? VOCAB.categories.has(area.refKey)
                : VOCAB.bodyAreas.has(area.refKey);
          expect(known, `${text}: ${area.refKind} ${area.refKey}`).toBe(true);
        }
      }
    }
  });
});
