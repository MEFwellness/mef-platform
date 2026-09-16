/**
 * THE WHOLE-BODY ASSOCIATION MAP, HELD TO WHAT IT CLAIMS TO COVER.
 *
 * WHAT THIS FILE IS FOR, and what it deliberately is not. It is not a
 * second opinion about whether a given association is good coaching: that
 * is authored content, reviewed as content, and the coach owns every row.
 * It is a guard over the things a map can be WRONG about structurally:
 * a joint nobody can reach, a system that points outward and never back, a
 * key that does not exist, a claim with no basis on it, two entries with
 * the same name, or a card that would fire on every complaint at once.
 *
 * IT READS THE SHIPPED SQL. Every assertion below is about the five
 * migrations that actually deploy, not about a fixture written to agree
 * with them.
 */

import { describe, it, expect } from 'vitest';
import { canonicalVocabulary, keysOf, shippedMap, type MapEntry } from './cross-system-map-fixture';
import { findBannedLanguage } from '@/lib/cross-system-relationships/language';

const MAP = shippedMap();
const VOCAB = canonicalVocabulary();

/** The seven bases migration 246 registered, and nothing else. */
const SOURCE_TYPES = [
  'chek_hlc',
  'referred_pain',
  'biomechanics',
  'lifestyle',
  'mef_internal',
  'coach_added',
  'other',
];

function entriesPrimaryOn(kind: string, key: string): MapEntry[] {
  return MAP.filter((entry) =>
    entry.primaries.some((component) => component.kind === kind && component.key === key)
  );
}

describe('the map is big enough to be a map', () => {
  it('holds hundreds of entries rather than the eighteen it started with', () => {
    expect(MAP.length).toBeGreaterThan(200);
  });

  it('is not vacuous: the eighteen starter entries are still in it', () => {
    // A rewrite that replaced the starters rather than adding to them would
    // pass every count below and throw away the coach's own edits.
    expect(MAP.some((entry) => entry.patternKey === 'starter-hip-pelvis')).toBe(true);
    expect(MAP.some((entry) => entry.patternKey === 'starter-musculoskeletal-general')).toBe(true);
    expect(MAP.filter((entry) => entry.patternKey.startsWith('starter-')).length).toBe(18);
  });

  it('gives every entry a unique key and a unique name', () => {
    const keys = MAP.map((entry) => entry.patternKey);
    expect(new Set(keys).size, 'duplicate pattern_key').toBe(keys.length);
    const names = MAP.map((entry) => entry.patternName);
    expect(new Set(names).size, 'duplicate pattern name').toBe(names.length);
  });
});

describe('every major joint has an entry of its own', () => {
  /**
   * THE BRIEF'S OWN LIST, mapped onto the vocabulary that holds it. The
   * cervical, thoracic and lumbar spine are the neck, the upper and mid
   * back, and the low back; the sacroiliac joint had nowhere to go at all
   * before migration 251 added it.
   */
  const JOINTS: Array<[string, string]> = [
    ['cervical spine', 'neck'],
    ['thoracic spine', 'upper_back'],
    ['thoracic spine, lower half', 'mid_back'],
    ['lumbar spine', 'low_back'],
    ['sacroiliac joint', 'si_joint'],
    ['shoulder', 'shoulder'],
    ['elbow', 'elbow'],
    ['wrist', 'wrist'],
    ['hand', 'hand'],
    ['hip', 'hip'],
    ['knee', 'knee'],
    ['ankle', 'ankle'],
    ['foot', 'foot'],
    ['jaw', 'jaw'],
  ];

  it.each(JOINTS)('%s reaches an entry keyed on it', (_name, areaKey) => {
    const found = entriesPrimaryOn('body_area', areaKey);
    expect(found.length, areaKey).toBeGreaterThan(0);
  });

  it.each(JOINTS)('%s is sent beyond the painful location', (_name, areaKey) => {
    // The whole point of the map: a joint entry has to point AWAY from the
    // joint as well as at it, or it is a label rather than an association.
    for (const entry of entriesPrimaryOn('body_area', areaKey)) {
      const elsewhere = entry.related.filter(
        (component) => !(component.kind === 'body_area' && component.key === areaKey)
      );
      expect(elsewhere.length, entry.patternKey).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('the major muscle regions are named', () => {
  const REGIONS = ['glute', 'hamstring', 'calf', 'groin', 'thigh', 'ribs', 'upper_back', 'mid_back'];
  it.each(REGIONS)('%s reaches an entry', (areaKey) => {
    expect(entriesPrimaryOn('body_area', areaKey).length, areaKey).toBeGreaterThan(0);
  });
});

describe('the organ and gland groupings a holistic framework works in', () => {
  /**
   * Every one of these is a CATEGORY in the Signal Library, which is how
   * this app names a body system, and every one has to be reachable both
   * as a thing she reported and as a thing worth reviewing.
   */
  const SYSTEMS = [
    'kidney_bladder',
    'clearance_detox',
    'digestion',
    'nutrition',
    'metabolic',
    'stress',
    'hormonal',
    'circulation',
    'respiratory',
    'immune',
    'skin_immune',
    'neurological',
    'sleep',
    'energy',
    'mood',
    'musculoskeletal',
    'joint_movement',
    'posture_alignment',
    'pain_discomfort',
  ];

  it.each(SYSTEMS)('%s is a thing an entry can be ABOUT', (categoryKey) => {
    expect(entriesPrimaryOn('category', categoryKey).length, categoryKey).toBeGreaterThan(0);
  });

  it.each(SYSTEMS)('%s is a thing an entry can point AT', (categoryKey) => {
    const pointed = MAP.filter((entry) =>
      entry.related.some(
        (component) => component.kind === 'category' && component.key === categoryKey
      )
    );
    expect(pointed.length, categoryKey).toBeGreaterThan(0);
  });
});

describe('the links are bidirectional, in both directions, for every system', () => {
  /**
   * WHAT BIDIRECTIONAL MEANS HERE, said precisely so the test can check it.
   * A complaint points at systems: an entry keyed on a BODY AREA names
   * categories among the areas worth reviewing. A system points back at the
   * body: an entry keyed on a CATEGORY names body areas among them. Both
   * halves have to exist for the same system, or the map is a one way list
   * that happens to be long.
   */
  const SYSTEMS = [
    'kidney_bladder',
    'digestion',
    'hormonal',
    'stress',
    'sleep',
    'respiratory',
    'skin_immune',
    'energy',
    'mood',
    'musculoskeletal',
    'clearance_detox',
    'neurological',
    'circulation',
    'metabolic',
    'immune',
  ];

  it.each(SYSTEMS)('a body complaint can reach %s', (categoryKey) => {
    const reached = MAP.filter(
      (entry) =>
        entry.primaries.some((component) => component.kind === 'body_area') &&
        entry.related.some(
          (component) => component.kind === 'category' && component.key === categoryKey
        )
    );
    expect(reached.length, categoryKey).toBeGreaterThan(0);
  });

  it.each(SYSTEMS)('%s can reach a body area in return', (categoryKey) => {
    const returned = MAP.filter(
      (entry) =>
        entry.primaries.some(
          (component) => component.kind === 'category' && component.key === categoryKey
        ) && entry.related.some((component) => component.kind === 'body_area')
    );
    expect(returned.length, categoryKey).toBeGreaterThan(0);
  });
});

describe('the posture patterns the brief names', () => {
  const PATTERNS: Array<[string, string]> = [
    ['upper cross', 'upper-crossed-pattern'],
    ['lower cross', 'lower-crossed-pattern'],
    ['forward head', 'forward-head-posture'],
    ['flat back', 'flat-back-pattern'],
    ['sway back', 'sway-back-pattern'],
  ];

  it.each(PATTERNS)('%s has its own entry', (_name, slug) => {
    expect(entriesPrimaryOn('signal', slug).length, slug).toBeGreaterThan(0);
  });

  it.each(PATTERNS)('%s is linked to the complaint areas it belongs to', (_name, slug) => {
    for (const entry of entriesPrimaryOn('signal', slug)) {
      const areas = entry.related.filter((component) => component.kind === 'body_area');
      expect(areas.length, entry.patternKey).toBeGreaterThanOrEqual(3);
    }
  });

  it('every posture signal in the library is reachable, not only the famous five', () => {
    const postureEntries = keysOf(MAP, 'primaries', 'signal');
    for (const slug of [
      'rounded-shoulders',
      'elevated-shoulder',
      'pelvic-tilt',
      'pelvic-drop',
      'uneven-hips',
      'inward-knee-drift',
      'foot-turnout',
      'rib-flare',
      'lumbar-posture-outside-neutral',
      'increased-upper-back-curve',
    ]) {
      expect(postureEntries.has(slug), slug).toBe(true);
    }
  });
});

describe('nervous-system load, sleep, mood, blood sugar, hydration and elimination', () => {
  const LIFESTYLE: Array<[string, string]> = [
    ['nervous-system load', 'difficulty-switching-off'],
    ['stress physiology', 'wired-and-tired'],
    ['sleep', 'trouble-falling-asleep'],
    ['mood', 'irritability'],
    ['blood sugar', 'irritable-when-hungry'],
    ['energy', 'energy-dip-mid-afternoon'],
    ['hydration', 'drinking-little-water'],
    ['elimination', 'infrequent-bowel-rhythm'],
    ['skin as elimination', 'excessive-sweating'],
  ];

  it.each(LIFESTYLE)('%s reaches an entry of its own', (_name, slug) => {
    expect(entriesPrimaryOn('signal', slug).length, slug).toBeGreaterThan(0);
  });
});

describe('every entry is well formed', () => {
  it('names only keys the Signal Library really holds', () => {
    const bad: string[] = [];
    for (const entry of MAP) {
      for (const component of [...entry.primaries, ...entry.related, ...entry.support]) {
        const known =
          component.kind === 'signal'
            ? VOCAB.signals.has(component.key)
            : component.kind === 'category'
              ? VOCAB.categories.has(component.key)
              : VOCAB.bodyAreas.has(component.key);
        if (!known) bad.push(`${entry.patternKey}: ${component.kind} ${component.key}`);
      }
    }
    expect(bad, bad.join('\n')).toHaveLength(0);
  });

  it('carries a registered source type, so the basis is stated and never implied', () => {
    for (const entry of MAP) {
      expect(SOURCE_TYPES, entry.patternKey).toContain(entry.sourceTypeKey);
    }
  });

  it('uses more than one basis, because these are not all the same kind of claim', () => {
    const used = new Set(MAP.map((entry) => entry.sourceTypeKey));
    expect(used.size).toBeGreaterThanOrEqual(4);
    expect(used.has('chek_hlc')).toBe(true);
    expect(used.has('referred_pain')).toBe(true);
    expect(used.has('biomechanics')).toBe(true);
    expect(used.has('lifestyle')).toBe(true);
  });

  it('has at least one primary, several related areas and real coaching considerations', () => {
    for (const entry of MAP) {
      expect(entry.primaries.length, entry.patternKey).toBeGreaterThan(0);
      expect(entry.related.length, entry.patternKey).toBeGreaterThanOrEqual(4);
      expect(entry.considerations.length, entry.patternKey).toBeGreaterThanOrEqual(4);
      expect(entry.association.length, entry.patternKey).toBeGreaterThan(80);
    }
  });

  it('never points an entry at nothing but itself', () => {
    for (const entry of MAP) {
      const primaryKeys = new Set(entry.primaries.map((c) => `${c.kind}::${c.key}`));
      const outward = entry.related.filter((c) => !primaryKeys.has(`${c.kind}::${c.key}`));
      expect(outward.length, entry.patternKey).toBeGreaterThan(0);
    }
  });

  it('closes every entry with the referral line, because coaching has a scope', () => {
    for (const entry of MAP) {
      const last = entry.considerations[entry.considerations.length - 1] ?? '';
      expect(last.toLowerCase(), entry.patternKey).toContain('medical referral');
    }
  });
});

describe('support components carry a floor, and related ones deliberately do not', () => {
  it('a support component names a minimum before the section counts as speaking up', () => {
    const withSupport = MAP.filter((entry) => entry.support.length > 0);
    expect(withSupport.length).toBeGreaterThan(100);
    for (const entry of withSupport) {
      for (const component of entry.support) {
        expect(component.min, entry.patternKey).not.toBeNull();
        expect(component.min!, entry.patternKey).toBeGreaterThan(0);
      }
    }
  });

  it('a related area has NO floor, on purpose', () => {
    // "The map says look at Kidney and Bladder, and there is nothing there"
    // is information a coach wants, and a floor would have thrown it away.
    for (const entry of MAP) {
      for (const component of entry.related) {
        expect(component.min, entry.patternKey).toBeNull();
      }
    }
  });
});

describe('the language guard, over the whole map at once', () => {
  it('every association text and every consideration writes in association language', () => {
    const bad: string[] = [];
    for (const entry of MAP) {
      for (const text of [entry.patternName, entry.association, ...entry.considerations]) {
        for (const hit of findBannedLanguage(text)) {
          bad.push(`${entry.patternKey}: "${hit.found}" in "${text.slice(0, 90)}"`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0);
  });

  it('no em dash and no percent sign anywhere a coach reads', () => {
    const bad: string[] = [];
    for (const entry of MAP) {
      for (const text of [entry.patternName, entry.association, ...entry.considerations]) {
        if (text.includes('—')) bad.push(`${entry.patternKey}: em dash`);
        if (text.includes('%')) bad.push(`${entry.patternKey}: percent sign`);
      }
    }
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0);
  });

  it('is non vacuous: the guard really reads this content and can fail on it', () => {
    expect(findBannedLanguage(MAP[0]!.association)).toEqual([]);
    expect(
      findBannedLanguage(`${MAP[0]!.association} This causes the problem.`).length
    ).toBeGreaterThan(0);
  });
});
