/**
 * THE RELATIONSHIP LIBRARY AT THE NEW SCALE.
 *
 * WHY THIS FILE EXISTS. The library held nineteen entries and a flat list
 * with a search box was the right shape for nineteen. It holds over two
 * hundred now. A flat list of two hundred is a scroll, not a map, and the
 * brief's requirement is explicit: grouped by body area and by system,
 * searchable, with active and inactive filtering, and reviewable without
 * scrolling through one list.
 *
 * WHAT IS UNDER TEST. The grouping is a pure function, so most of this is
 * the function driven with real shapes. The rest MOUNTS the panel and
 * reads its HTML, because "opens folded" and "a search opens what it
 * matched" are claims about what is drawn and a source scan cannot tell a
 * fold that unmounts from one that hides.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The panel is a client component and reads the app router to refresh
// after a save. Same stand-in the editor's own test file uses.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import {
  NO_AREA_GROUP,
  NO_AREA_LABEL,
  NO_SYSTEM_GROUP,
  groupRelationships,
  primaryAreaKeyOf,
  primarySystemKeyOf,
  type SignalPlacementLookup,
} from '@/lib/cross-system-relationships/grouping';
import { filterRelationships, EMPTY_FILTERS } from '@/lib/cross-system-relationships/filters';
import { RelationshipLibraryPanel } from '@/components/coach-relationships/RelationshipLibraryPanel';
import type { RelationshipSummary } from '@/lib/cross-system-relationships/types';
import { head, summary, version } from './cross-system-pattern-fixture';
import { TEST_BODY_AREAS, TEST_CATEGORIES, TEST_NAMES } from './cross-system-signal-library-fixture';

const PLACEMENT: SignalPlacementLookup = new Map(
  TEST_NAMES.map((name) => [
    name.signalSlug,
    { categoryKey: name.categoryKey, bodyAreaKey: name.defaultBodyAreaKey },
  ])
);

const AREA_VOCABULARY = TEST_BODY_AREAS.map((area) => ({
  key: area.areaKey,
  label: area.displayName,
  position: area.position,
}));
const SYSTEM_VOCABULARY = TEST_CATEGORIES.map((category) => ({
  key: category.categoryKey,
  label: category.displayName,
  position: category.position,
}));

function component(
  role: 'primary' | 'related' | 'support',
  refKind: 'signal' | 'category' | 'body_area',
  refKey: string,
  position = 0
) {
  return {
    id: `c-${role}-${refKey}-${position}`,
    position,
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
  };
}

function entry(
  key: string,
  components: ReturnType<typeof component>[],
  isActive = true
): RelationshipSummary {
  return summary({
    head: head({ id: key, patternKey: key, isActive, isSeeded: true }),
    current: version({
      patternName: `Pattern ${key}`,
      surfacesOnComplaint: true,
      components,
    }),
  });
}

const HIP_AREA = entry('map-area-hip', [component('primary', 'body_area', 'hip')]);
const KNEE_AREA = entry('map-area-knee', [component('primary', 'body_area', 'knee')]);
const DIGESTION = entry('map-reverse-digestion', [component('primary', 'category', 'digestion')]);
const SIGNAL_ENTRY = entry('map-signal-hip-clicking', [
  component('primary', 'signal', TEST_NAMES[0]!.signalSlug),
]);
const INACTIVE_HIP = entry('map-area-hip-old', [component('primary', 'body_area', 'hip')], false);

const ALL = [HIP_AREA, KNEE_AREA, DIGESTION, SIGNAL_ENTRY, INACTIVE_HIP];

describe('an entry has exactly one home in each view', () => {
  it('a body area primary files under that area', () => {
    expect(primaryAreaKeyOf(HIP_AREA, PLACEMENT)).toBe('hip');
    expect(primaryAreaKeyOf(KNEE_AREA, PLACEMENT)).toBe('knee');
  });

  it('a signal primary files under the area the Signal Library gives it', () => {
    const name = TEST_NAMES[0]!;
    expect(primaryAreaKeyOf(SIGNAL_ENTRY, PLACEMENT)).toBe(name.defaultBodyAreaKey);
    expect(primarySystemKeyOf(SIGNAL_ENTRY, PLACEMENT)).toBe(name.categoryKey);
  });

  it('a system primary has no body area, and says so rather than guessing one', () => {
    expect(primaryAreaKeyOf(DIGESTION, PLACEMENT)).toBeNull();
    expect(primarySystemKeyOf(DIGESTION, PLACEMENT)).toBe('digestion');
  });

  it('the related areas are never read, because they are what it points AT', () => {
    // Two entries with the same primary and wildly different related lists
    // land in the same group, which is what stops one entry appearing in
    // five groups and being edited in the wrong one.
    const a = entry('a', [
      component('primary', 'body_area', 'hip'),
      component('related', 'category', 'digestion', 1),
    ]);
    const b = entry('b', [
      component('primary', 'body_area', 'hip'),
      component('related', 'category', 'sleep', 1),
    ]);
    expect(primaryAreaKeyOf(a, PLACEMENT)).toBe(primaryAreaKeyOf(b, PLACEMENT));
  });
});

describe('grouping by body area and by body system', () => {
  it('puts every entry in exactly one group, in both views', () => {
    for (const mode of ['body_area', 'system'] as const) {
      const vocabulary = mode === 'body_area' ? AREA_VOCABULARY : SYSTEM_VOCABULARY;
      const groups = groupRelationships(ALL, mode, PLACEMENT, vocabulary);
      const total = groups.reduce((sum, group) => sum + group.summaries.length, 0);
      expect(total, mode).toBe(ALL.length);
      const keys = groups.flatMap((group) => group.summaries.map((item) => item.head.patternKey));
      expect(new Set(keys).size, mode).toBe(ALL.length);
    }
  });

  it('counts how many of each group are switched on', () => {
    const groups = groupRelationships(ALL, 'body_area', PLACEMENT, AREA_VOCABULARY);
    const hip = groups.find((group) => group.key === 'hip')!;
    expect(hip.summaries.length).toBe(2);
    expect(hip.activeCount).toBe(1);
  });

  it('gives the entries that are not about a place a group with a real name', () => {
    const groups = groupRelationships([DIGESTION], 'body_area', PLACEMENT, AREA_VOCABULARY);
    expect(groups[0]!.key).toBe(NO_AREA_GROUP);
    expect(groups[0]!.label).toBe(NO_AREA_LABEL);
  });

  it('orders groups by the vocabulary rather than alphabetically, and puts the fallback last', () => {
    const groups = groupRelationships(ALL, 'body_area', PLACEMENT, AREA_VOCABULARY);
    const positions = groups
      .filter((group) => group.key !== NO_AREA_GROUP)
      .map((group) => AREA_VOCABULARY.find((area) => area.key === group.key)!.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(groups[groups.length - 1]!.key).toBe(NO_AREA_GROUP);
  });

  it('never labels a group with a raw key it cannot resolve', () => {
    const orphan = entry('orphan', [component('primary', 'body_area', 'not_a_real_area')]);
    const groups = groupRelationships([orphan], 'body_area', PLACEMENT, AREA_VOCABULARY);
    expect(groups[0]!.key).toBe(NO_AREA_GROUP);
    expect(groups[0]!.label).not.toContain('not_a_real_area');
  });

  it('holds up at the real scale: two hundred entries, no group lost', () => {
    const many: RelationshipSummary[] = [];
    for (let index = 0; index < 220; index += 1) {
      const area = TEST_BODY_AREAS[index % TEST_BODY_AREAS.length]!;
      many.push(entry(`bulk-${index}`, [component('primary', 'body_area', area.areaKey)]));
    }
    const groups = groupRelationships(many, 'body_area', PLACEMENT, AREA_VOCABULARY);
    expect(groups.length).toBe(TEST_BODY_AREAS.length);
    expect(groups.reduce((sum, group) => sum + group.summaries.length, 0)).toBe(220);
  });

  it('grouping and filtering compose: a filter narrows the groups, it does not break them', () => {
    const active = filterRelationships(ALL, { ...EMPTY_FILTERS, status: 'active' }, new Map());
    const groups = groupRelationships(active, 'body_area', PLACEMENT, AREA_VOCABULARY);
    const hip = groups.find((group) => group.key === 'hip')!;
    expect(hip.summaries.length).toBe(1);
    expect(hip.activeCount).toBe(1);
  });

  it('and by system, an inactive entry still shows in the All view', () => {
    const groups = groupRelationships(ALL, 'system', PLACEMENT, SYSTEM_VOCABULARY);
    const total = groups.reduce((sum, group) => sum + group.summaries.length, 0);
    expect(total).toBe(ALL.length);
    expect(groups.some((group) => group.key === NO_SYSTEM_GROUP || group.key === 'digestion')).toBe(
      true
    );
  });
});

describe('the screen a coach actually opens', () => {
  const PICKERS = {
    categories: TEST_CATEGORIES,
    bodyAreas: TEST_BODY_AREAS,
    signalNames: TEST_NAMES,
  };

  /** Enough entries to be past the small library threshold. */
  function bulk(count: number): RelationshipSummary[] {
    const out: RelationshipSummary[] = [];
    for (let index = 0; index < count; index += 1) {
      const area = TEST_BODY_AREAS[index % TEST_BODY_AREAS.length]!;
      out.push(entry(`bulk-${index}`, [component('primary', 'body_area', area.areaKey)]));
    }
    return out;
  }

  it('offers both groupings, plus the search and both filters', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(40)} {...PICKERS} />
    );
    expect(html).toContain('Group by');
    expect(html).toContain('Body area');
    expect(html).toContain('Body system');
    expect(html).toContain('Search patterns');
    expect(html).toContain('Active');
    expect(html).toContain('Inactive');
  });

  it('opens as an index rather than a scroll: the groups are folded and their rows unmounted', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(40)} {...PICKERS} />
    );
    // Every group header is there, closed.
    expect(html).toContain('aria-expanded="false"');
    // And not one row is drawn, so it is a fold that unmounts rather than
    // one that hides two hundred rows behind a class.
    expect(html).not.toContain('Version history');
    expect(html).not.toContain('Pattern bulk-0');
  });

  it('says how many patterns and how many groups', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(40)} {...PICKERS} />
    );
    expect(html).toContain('40 of 40 patterns');
    expect(html).toMatch(/in \d+ groups/);
  });

  it('counts each group, and says how many of it are active', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(40)} {...PICKERS} />
    );
    expect(html).toMatch(/\d+ patterns?,\s*\d+ active/);
  });

  it('a small library needs no index and opens its rows straight away', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(3)} {...PICKERS} />
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Version history');
  });

  it('every row still reaches the editor, the history, the duplicate and the toggle', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={bulk(3)} {...PICKERS} />
    );
    for (const action of ['Edit', 'Version history', 'Duplicate', 'Deactivate', 'Delete']) {
      expect(html, action).toContain(action);
    }
  });
});
