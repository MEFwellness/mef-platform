/**
 * THE LIBRARY, GROUPED, so a map of two hundred entries is still a thing a
 * coach can read.
 *
 * WHY THIS EXISTS NOW AND DID NOT BEFORE. The library held nineteen
 * entries: one example and the eighteen starter map entries. A flat list
 * with a search box was the right shape for nineteen. The Whole-Body
 * Association Map is now over two hundred, covering every body area, every
 * system in both directions, every posture pattern and one entry per
 * standardized signal. A flat list of two hundred is a scroll, not a map,
 * and a coach who wants to see what Root knows about the knee should not
 * have to find it by typing.
 *
 * ONE ENTRY HAS ONE HOME IN EACH VIEW, deliberately. A pattern could
 * legitimately be filed under several body areas at once, and filing it
 * under all of them would mean a coach editing "the knee entry" in one
 * group and finding the same row changed in four others. So the grouping
 * asks one question of the PRIMARY inputs, which are the thing the entry is
 * about, and never of the related areas, which are the things it points at.
 *
 * PURE, AND IT RUNS IN THE BROWSER, over the list the page already loaded,
 * exactly as the filters beside it do. The library is a few hundred
 * definitions rather than a feed.
 */

import type { RelationshipSummary } from './types';

/** How the coach is looking at the library right now. */
export type GroupingMode = 'body_area' | 'system';

/** signal_slug to the area and category the Signal Library files it under. */
export type SignalPlacementLookup = ReadonlyMap<
  string,
  { categoryKey: string; bodyAreaKey: string | null }
>;

/**
 * The bucket every entry falls into when its primaries name no place, or no
 * system. It is a real group with a real name rather than an "Other",
 * because what lands in it is a real thing: an entry about the whole body,
 * or about a system rather than a place.
 */
export const NO_AREA_GROUP = 'no_area';
export const NO_SYSTEM_GROUP = 'no_system';
export const NO_AREA_LABEL = 'Not tied to one body area';
export const NO_SYSTEM_LABEL = 'Not tied to one body system';

/**
 * Which body area an entry is ABOUT.
 *
 * The first primary that names a place wins: a body area component names
 * one outright, and a signal component carries the one the Signal Library
 * files it under. A category primary names no place at all, which is
 * correct and is what the no-area group is for.
 */
export function primaryAreaKeyOf(
  summary: RelationshipSummary,
  placement: SignalPlacementLookup
): string | null {
  const primaries = summary.current.components
    .filter((component) => component.role === 'primary')
    .sort((a, b) => a.position - b.position);

  for (const component of primaries) {
    if (component.refKind === 'body_area') return component.refKey;
    if (component.refKind === 'signal') {
      const area = placement.get(component.refKey)?.bodyAreaKey ?? null;
      // 'whole_body' is a place in the vocabulary and is not a place a
      // coach browses to, so it falls through to the no-area group with
      // everything else that is about the whole person.
      if (area && area !== 'whole_body') return area;
    }
  }
  return null;
}

/** Which body system an entry is ABOUT, by the same rule. */
export function primarySystemKeyOf(
  summary: RelationshipSummary,
  placement: SignalPlacementLookup
): string | null {
  const primaries = summary.current.components
    .filter((component) => component.role === 'primary')
    .sort((a, b) => a.position - b.position);

  for (const component of primaries) {
    if (component.refKind === 'category') return component.refKey;
    if (component.refKind === 'signal') {
      const category = placement.get(component.refKey)?.categoryKey;
      if (category) return category;
    }
  }
  return null;
}

export type RelationshipGroup = {
  key: string;
  label: string;
  /** Where this group sits in the vocabulary's own order. */
  position: number;
  summaries: RelationshipSummary[];
  /** How many of them are switched on, which is what a coach scans for. */
  activeCount: number;
};

/**
 * The visible entries, grouped and ordered.
 *
 * ORDER IS THE VOCABULARY'S OWN, head to foot for body areas and the
 * library's own order for systems, so the groups read the same way every
 * time rather than rearranging themselves as she edits. The no-area and
 * no-system buckets sit last, because they are the entries that are not
 * about a place at all.
 */
export function groupRelationships(
  summaries: readonly RelationshipSummary[],
  mode: GroupingMode,
  placement: SignalPlacementLookup,
  vocabulary: ReadonlyArray<{ key: string; label: string; position: number }>
): RelationshipGroup[] {
  const order = new Map(vocabulary.map((entry) => [entry.key, entry]));
  const fallbackKey = mode === 'body_area' ? NO_AREA_GROUP : NO_SYSTEM_GROUP;
  const fallbackLabel = mode === 'body_area' ? NO_AREA_LABEL : NO_SYSTEM_LABEL;

  const groups = new Map<string, RelationshipGroup>();
  for (const summary of summaries) {
    const resolved =
      mode === 'body_area'
        ? primaryAreaKeyOf(summary, placement)
        : primarySystemKeyOf(summary, placement);
    // A key the vocabulary does not hold cannot be labelled honestly, so it
    // falls into the same bucket as no key at all rather than being drawn
    // with its own slug.
    const known = resolved !== null && order.has(resolved) ? resolved : null;
    const key = known ?? fallbackKey;
    const held = groups.get(key);
    if (held) {
      held.summaries.push(summary);
      if (summary.head.isActive) held.activeCount += 1;
      continue;
    }
    groups.set(key, {
      key,
      label: known ? order.get(known)!.label : fallbackLabel,
      position: known ? order.get(known)!.position : Number.MAX_SAFE_INTEGER,
      summaries: [summary],
      activeCount: summary.head.isActive ? 1 : 0,
    });
  }

  return [...groups.values()].sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label)
  );
}
