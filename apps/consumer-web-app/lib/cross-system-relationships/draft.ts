/**
 * What a coach may save, decided on the server.
 *
 * THE CLIENT POSTS KEYS, NOT ROWS. It sends a pattern name, a list of
 * component keys with their roles, thresholds and lines of text. Every
 * LABEL a version stores is resolved here out of the live Signal Library,
 * so a hand built request cannot write a component that says "Kidney" and
 * points at the hip, and cannot name a signal, a category or a body area
 * that does not exist.
 *
 * PURE. No client, no clock, no database. The caller hands in the library
 * it already loaded, which is what lets every case in
 * tests/cross-system-relationship-schema.test.ts run with a literal.
 *
 * NOTHING HERE INVENTS A RELATIONSHIP. There is no default component, no
 * inferred pairing and no suggestion. An empty draft is a refused draft,
 * not a filled in one.
 */

import { findBodyArea, findCategory, findName, slugify } from '@/lib/cross-system-signals/library';
import type { SignalLibrary, SignalSide } from '@/lib/cross-system-signals/types';
import {
  CONSIDERATION_MAX_LENGTH,
  LONG_TEXT_MAX_LENGTH,
  MAX_COMPONENTS,
  MAX_CONSIDERATIONS,
  MAX_STRENGTH_LEVELS,
  PATTERN_NAME_MAX_LENGTH,
  RELATIONSHIP_SOURCE_TYPES,
  DEFAULT_RELATIONSHIP_SOURCE_TYPE,
} from './constants';
import type { RelationshipSourceTypeKey } from './constants';
import type {
  RelationshipComponentDraft,
  RelationshipComponentRole,
  RelationshipDraft,
  RelationshipRefKind,
  RelationshipStrengthLevelDraft,
} from './types';

const ROLES: readonly RelationshipComponentRole[] = ['primary', 'related', 'support'];
const REF_KINDS: readonly RelationshipRefKind[] = ['signal', 'category', 'body_area'];
const SIDES: readonly SignalSide[] = ['left', 'right', 'both', 'not_applicable'];

/** One component, with every label already resolved out of the library. */
export type ResolvedComponent = {
  position: number;
  role: RelationshipComponentRole;
  refKind: RelationshipRefKind;
  refKey: string;
  refLabel: string;
  side: SignalSide | null;
  valueKey: string | null;
  valueLabel: string | null;
  minValueNumeric: number | null;
  sourceKey: string | null;
  sourceQuestionRef: string | null;
  sourceQuestionPrompt: string | null;
  note: string | null;
};

export type ResolvedStrengthLevel = {
  levelKey: string;
  position: number;
  displayLabel: string;
  minSupportingSignals: number;
  minDistinctCategories: number | null;
  minRelatedSignals: number | null;
};

export type ResolvedRelationshipDraft = {
  patternName: string;
  minSupportingSignals: number;
  /** Resolved against the closed set. A key the form invented is refused. */
  sourceTypeKey: RelationshipSourceTypeKey;
  /** Which engine reads this entry. See RelationshipVersion.surfacesOnComplaint. */
  surfacesOnComplaint: boolean;
  possibleAssociationText: string | null;
  evidenceNotes: string | null;
  changeSummary: string | null;
  components: ResolvedComponent[];
  strengthLevels: ResolvedStrengthLevel[];
  considerations: string[];
};

export type DraftResolution =
  | { ok: true; draft: ResolvedRelationshipDraft }
  | { ok: false; error: string };

/** Collapses whitespace, trims, cuts at the stored maximum, and turns an empty string into null. */
export function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Newlines survive in the long fields, because a coach writing her own
  // methodology notes writes paragraphs. Only runs of spaces collapse.
  const cleaned = value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

/** A single line: newlines go, because a name and a consideration are each one line. */
export function normalizeLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

function readInteger(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

/**
 * The label a component's key reads as today, out of the live library.
 *
 * A KEY WITH NO ROW IS A REFUSED DRAFT, not a component labelled with its
 * own slug. The editor only ever offers keys that exist, so a miss here is
 * a hand built request or a vocabulary row that was retired between the
 * form loading and the save.
 */
function resolveLabel(
  library: SignalLibrary,
  refKind: RelationshipRefKind,
  refKey: string
): string | null {
  if (refKind === 'signal') return findName(library, refKey)?.displayName ?? null;
  if (refKind === 'category') return findCategory(library, refKey)?.displayName ?? null;
  return findBodyArea(library, refKey)?.displayName ?? null;
}

function resolveComponent(
  input: RelationshipComponentDraft,
  position: number,
  library: SignalLibrary
): ResolvedComponent | { error: string } {
  const role = ROLES.includes(input.role) ? input.role : null;
  if (!role) return { error: 'Every input needs a role.' };

  const refKind = REF_KINDS.includes(input.refKind) ? input.refKind : null;
  if (!refKind) return { error: 'Every input needs to be a signal, a body system or a body area.' };

  const refKey = typeof input.refKey === 'string' ? input.refKey.trim() : '';
  if (refKey.length === 0) return { error: 'Every input needs something chosen.' };

  const refLabel = resolveLabel(library, refKind, refKey);
  if (!refLabel) return { error: `"${refKey}" is not in the Signal Library.` };

  const side =
    typeof input.side === 'string' && (SIDES as readonly string[]).includes(input.side)
      ? (input.side as SignalSide)
      : null;

  const minValueNumeric =
    input.minValueNumeric === null || input.minValueNumeric === undefined
      ? null
      : readInteger(input.minValueNumeric, 0, 1000);

  return {
    position,
    role,
    refKind,
    refKey,
    refLabel,
    side,
    valueKey: normalizeLine(input.valueKey, 120),
    valueLabel: normalizeLine(input.valueLabel, 120),
    minValueNumeric,
    sourceKey: normalizeLine(input.sourceKey, 120),
    sourceQuestionRef: normalizeLine(input.sourceQuestionRef, 120),
    sourceQuestionPrompt: normalizeLine(input.sourceQuestionPrompt, 500),
    note: normalizeLine(input.note, 300),
  };
}

function resolveStrengthLevel(
  input: RelationshipStrengthLevelDraft,
  position: number
): ResolvedStrengthLevel | { error: string } {
  const displayLabel = normalizeLine(input.displayLabel, 60);
  if (!displayLabel) return { error: 'Every strength level needs a name.' };

  // The key is derived from the label rather than trusted from the client,
  // so two levels cannot be saved under one key and a renamed level cannot
  // collide with a level that is already there.
  const levelKey = slugify(
    typeof input.levelKey === 'string' && input.levelKey.trim().length > 0
      ? input.levelKey
      : displayLabel
  );
  if (levelKey.length === 0) return { error: 'Every strength level needs a name.' };

  const minSupportingSignals = readInteger(input.minSupportingSignals, 1, 100);
  if (minSupportingSignals === null) {
    return { error: `"${displayLabel}" needs a minimum of at least one supporting signal.` };
  }

  const minDistinctCategories =
    input.minDistinctCategories === null || input.minDistinctCategories === undefined
      ? null
      : readInteger(input.minDistinctCategories, 1, 100);
  const minRelatedSignals =
    input.minRelatedSignals === null || input.minRelatedSignals === undefined
      ? null
      : readInteger(input.minRelatedSignals, 0, 100);

  return {
    levelKey,
    position,
    displayLabel,
    minSupportingSignals,
    minDistinctCategories,
    minRelatedSignals,
  };
}

/**
 * A whole draft, resolved and refused as one.
 *
 * WHAT A DEFINITION MUST CARRY to be saveable at all: a name, at least one
 * primary input, and a floor of at least one supporting signal. Everything
 * else is optional, because a coach building a pattern over several
 * sittings should be able to save what she has and come back to it. That
 * is also why a new relationship is INACTIVE until she turns it on.
 */
export function resolveRelationshipDraft(
  input: RelationshipDraft,
  library: SignalLibrary
): DraftResolution {
  const patternName = normalizeLine(input.patternName, PATTERN_NAME_MAX_LENGTH);
  if (!patternName) return { ok: false, error: 'Give the pattern a name.' };

  const minSupportingSignals = readInteger(input.minSupportingSignals, 1, 100);
  if (minSupportingSignals === null) {
    return { ok: false, error: 'The minimum supporting signals has to be at least one.' };
  }

  const rawComponents = Array.isArray(input.components) ? input.components : [];
  if (rawComponents.length > MAX_COMPONENTS) {
    return { ok: false, error: `A pattern may hold up to ${MAX_COMPONENTS} inputs.` };
  }

  const components: ResolvedComponent[] = [];
  const seen = new Set<string>();
  let position = 0;
  for (const raw of rawComponents) {
    const resolved = resolveComponent(raw, position + 1, library);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    // The same thing twice in the same role says nothing the first one did
    // not, and it would count twice towards a threshold.
    const fingerprint = `${resolved.role}::${resolved.refKind}::${resolved.refKey}::${resolved.side ?? ''}::${resolved.valueKey ?? ''}::${resolved.minValueNumeric ?? ''}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    components.push(resolved);
    position += 1;
  }

  if (!components.some((component) => component.role === 'primary')) {
    return { ok: false, error: 'Choose at least one primary input.' };
  }

  const rawLevels = Array.isArray(input.strengthLevels) ? input.strengthLevels : [];
  if (rawLevels.length > MAX_STRENGTH_LEVELS) {
    return { ok: false, error: `A pattern may hold up to ${MAX_STRENGTH_LEVELS} strength levels.` };
  }
  const strengthLevels: ResolvedStrengthLevel[] = [];
  const levelKeys = new Set<string>();
  for (const raw of rawLevels) {
    const resolved = resolveStrengthLevel(raw, strengthLevels.length + 1);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    if (levelKeys.has(resolved.levelKey)) {
      return { ok: false, error: `Two strength levels are both called "${resolved.displayLabel}".` };
    }
    levelKeys.add(resolved.levelKey);
    strengthLevels.push(resolved);
  }

  const rawConsiderations = Array.isArray(input.considerations) ? input.considerations : [];
  const considerations = rawConsiderations
    .map((line) => normalizeLine(line, CONSIDERATION_MAX_LENGTH))
    .filter((line): line is string => line !== null)
    .slice(0, MAX_CONSIDERATIONS);

  return {
    ok: true,
    draft: {
      patternName,
      minSupportingSignals,
      // THE SERVER DECIDES BOTH. A hand built request cannot file a
      // relationship under a basis that does not exist, and cannot promote
      // its own definition into Root's automatic map by posting a flag.
      sourceTypeKey: resolveSourceType(input.sourceTypeKey),
      surfacesOnComplaint: input.surfacesOnComplaint === true,
      possibleAssociationText: normalizeText(input.possibleAssociationText, LONG_TEXT_MAX_LENGTH),
      evidenceNotes: normalizeText(input.evidenceNotes, LONG_TEXT_MAX_LENGTH),
      changeSummary: normalizeLine(input.changeSummary, 300),
      components,
      strengthLevels,
      considerations,
    },
  };
}

/** A basis key the closed set really holds, or the default. Never the posted string. */
export function resolveSourceType(value: unknown): RelationshipSourceTypeKey {
  if (typeof value !== 'string') return DEFAULT_RELATIONSHIP_SOURCE_TYPE;
  return (RELATIONSHIP_SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as RelationshipSourceTypeKey)
    : DEFAULT_RELATIONSHIP_SOURCE_TYPE;
}

/**
 * The slug a brand new relationship is filed under.
 *
 * It is derived from the first name it was given and then never changes,
 * because a rename is an edit and an edit must not break a stored
 * reference to the pattern itself. `taken` is the set of keys already in
 * the library, so two patterns that start life with the same name get
 * distinct keys rather than one refusing to save.
 */
export function buildPatternKey(patternName: string, taken: ReadonlySet<string>): string {
  const base = slugify(patternName).slice(0, 80) || 'pattern';
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
