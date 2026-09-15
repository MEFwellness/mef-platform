/**
 * Pure helpers over a loaded SignalLibrary. No database, no clock, no
 * randomness, so every adapter test drives these with a literal.
 *
 * THE ONE RULE THIS FILE ENFORCES. An external key with no dictionary row
 * resolves to null, and an adapter that gets null writes nothing. There is
 * no string transform here that turns a question ref into a signal name,
 * because a transform would invent a signal out of a question nobody had
 * reviewed. See the header of migration 241.
 */

import type {
  SignalBodyArea,
  SignalCategory,
  SignalExternalKind,
  SignalLibrary,
  SignalSourceMapping,
  SignalSymptomType,
  StandardizedSignalName,
} from './types';

/** The composite key the mappings map is built on. One place, so a lookup and a build cannot disagree. */
export function mappingKey(
  sourceKey: string,
  externalKind: SignalExternalKind,
  externalKey: string
): string {
  return `${sourceKey}::${externalKind}::${externalKey}`;
}

/** The dictionary row for one of a source's own keys, or null when nobody has mapped it. */
export function findMapping(
  library: SignalLibrary,
  sourceKey: string,
  externalKind: SignalExternalKind,
  externalKey: string
): SignalSourceMapping | null {
  return library.mappings.get(mappingKey(sourceKey, externalKind, externalKey)) ?? null;
}

/** The standardized name a slug refers to, or null. */
export function findName(
  library: SignalLibrary,
  signalSlug: string
): StandardizedSignalName | null {
  return library.names.get(signalSlug) ?? null;
}

export function findCategory(library: SignalLibrary, key: string | null): SignalCategory | null {
  return key ? (library.categories.get(key) ?? null) : null;
}

export function findBodyArea(library: SignalLibrary, key: string | null): SignalBodyArea | null {
  return key ? (library.bodyAreas.get(key) ?? null) : null;
}

export function findSymptom(library: SignalLibrary, key: string | null): SignalSymptomType | null {
  return key ? (library.symptoms.get(key) ?? null) : null;
}

/**
 * Everything an adapter needs about a mapped key at once: the standardized
 * name, its category, and the body area this particular question is about.
 *
 * The AREA PRECEDENCE is the dictionary row first, then the name's own
 * default. "My lower back aches" is about the low back even though the
 * name it maps to could be used elsewhere, and that is a fact about the
 * question rather than about the name.
 */
export type ResolvedSignal = {
  signalSlug: string;
  signalName: string;
  categoryKey: string;
  bodyAreaKey: string | null;
  symptomKey: string | null;
};

export function resolveMapped(
  library: SignalLibrary,
  sourceKey: string,
  externalKind: SignalExternalKind,
  externalKey: string
): ResolvedSignal | null {
  const mapping = findMapping(library, sourceKey, externalKind, externalKey);
  if (!mapping) return null;
  const name = findName(library, mapping.signalSlug);
  if (!name) return null;
  if (!library.categories.has(name.categoryKey)) return null;
  return {
    signalSlug: name.signalSlug,
    signalName: name.displayName,
    categoryKey: name.categoryKey,
    bodyAreaKey: mapping.bodyAreaKey ?? name.defaultBodyAreaKey,
    symptomKey: name.defaultSymptomKey,
  };
}

/** The label a source is known by today. Copied onto a draft, never joined at read time. */
export function sourceLabel(library: SignalLibrary, sourceKey: string): string {
  return library.sources.get(sourceKey)?.displayName ?? sourceKey;
}

/**
 * The standardized names a coach's search field offers for a query.
 *
 * Matching is case insensitive and partial over the display name and the
 * stored search terms, which is the same thing "partial, case insensitive"
 * means everywhere else a coach types on this page.
 */
export function searchSignalNames(
  names: readonly StandardizedSignalName[],
  query: string,
  limit = 12
): StandardizedSignalName[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const hits = names.filter(
    (name) =>
      name.isCoachAddable &&
      (name.displayName.toLowerCase().includes(needle) ||
        name.searchTerms.toLowerCase().includes(needle))
  );
  // A name whose own title matches reads first, because a hit on a hidden
  // search term is a weaker answer to what the coach typed.
  hits.sort((a, b) => {
    const aTitle = a.displayName.toLowerCase().includes(needle) ? 0 : 1;
    const bTitle = b.displayName.toLowerCase().includes(needle) ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return a.displayName.localeCompare(b.displayName);
  });
  return hits.slice(0, limit);
}

/**
 * The standardized name a coach's area plus symptom tap composes.
 *
 * The PHRASE is the symptom row's own stored lowercase form rather than a
 * lowercased display name, because a display name is a label and a
 * composed phrase is grammar: lowercasing "Reduced range" by hand is how a
 * tool ends up writing "Hip Reduced Range".
 */
export function composeSignalName(
  area: SignalBodyArea | null,
  symptom: SignalSymptomType
): { slug: string; displayName: string } {
  const displayName = area ? `${area.displayName} ${symptom.phrase}` : symptom.displayName;
  return { slug: slugify(displayName), displayName };
}

/** Lowercase, words joined by single hyphens, nothing else. The primary key a composed name gets. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
