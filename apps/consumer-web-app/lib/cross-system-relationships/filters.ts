/**
 * The list view's search and its two filters, as pure functions.
 *
 * WHY THEY ARE NOT INLINE IN THE COMPONENT. The category filter has to
 * agree with what a list row shows as the pattern's body systems, and the
 * two would drift the moment one of them was edited. Both read this file.
 *
 * THE CATEGORIES OF A PATTERN ARE DERIVED, NOT STORED. A component that
 * names a category IS one. A component that names a signal carries the
 * category that signal is filed under in the live library. A component
 * that names a body area carries none, because a body area is a place
 * rather than a system. Deriving it means a pattern can never be filed
 * under a category it does not actually name.
 *
 * THE LOOKUP IS A PLAIN MAP OF SLUG TO CATEGORY KEY rather than the whole
 * SignalLibrary, because this runs in the browser as the coach types and
 * a Map of six vocabularies does not cross the server boundary.
 */

import type { RelationshipSummary } from './types';

/** signal_slug to category_key, built once from the names the page was handed. */
export type SignalCategoryLookup = ReadonlyMap<string, string>;

/** Which of the Signal Library's categories a pattern names, in any role. */
export function categoriesOf(
  summary: RelationshipSummary,
  lookup: SignalCategoryLookup
): Set<string> {
  const keys = new Set<string>();
  for (const component of summary.current.components) {
    if (component.refKind === 'category') {
      keys.add(component.refKey);
      continue;
    }
    if (component.refKind === 'signal') {
      const categoryKey = lookup.get(component.refKey);
      if (categoryKey) keys.add(categoryKey);
    }
  }
  return keys;
}

export type RelationshipFilters = {
  /** Partial and case insensitive, over the pattern name and every input label. */
  query: string;
  /** 'all', 'active' or 'inactive'. */
  status: 'all' | 'active' | 'inactive';
  /** A category key, or null for every category. */
  categoryKey: string | null;
};

export const EMPTY_FILTERS: RelationshipFilters = {
  query: '',
  status: 'all',
  categoryKey: null,
};

/** Everything one pattern can be found by typing. */
function searchHaystack(summary: RelationshipSummary): string {
  return [
    summary.current.patternName,
    summary.head.patternKey,
    ...summary.current.components.map((component) => component.refLabel),
    ...summary.current.components.map((component) => component.note ?? ''),
    ...summary.current.considerations.map((item) => item.body),
    summary.current.possibleAssociationText ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * The list, filtered. Order is left exactly as it arrives, which is oldest
 * first, so a pattern does not move under the coach's hand while she types.
 */
export function filterRelationships(
  summaries: readonly RelationshipSummary[],
  filters: RelationshipFilters,
  lookup: SignalCategoryLookup
): RelationshipSummary[] {
  const needle = filters.query.trim().toLowerCase();
  return summaries.filter((summary) => {
    if (filters.status === 'active' && !summary.head.isActive) return false;
    if (filters.status === 'inactive' && summary.head.isActive) return false;
    if (filters.categoryKey && !categoriesOf(summary, lookup).has(filters.categoryKey)) {
      return false;
    }
    if (needle.length > 0 && !searchHaystack(summary).includes(needle)) return false;
    return true;
  });
}
