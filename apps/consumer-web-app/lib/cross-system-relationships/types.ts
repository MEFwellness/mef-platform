/**
 * Every shape the Relationship Library works in.
 *
 * A RELATIONSHIP IS A LIST OF COMPONENTS, and a component points at one
 * of three vocabularies the Signal Library already holds: a standardized
 * signal name, a category (what this feature means by a body system), or
 * a body area. There is no field here for a particular pairing, no hip
 * and no kidney, because any combination has to be the same shape:
 * joint to system, muscle to system, skin to digestion, stress to a
 * physical symptom, many systems onto one symptom, one system onto many.
 *
 * NOTHING HERE MATCHES ANYTHING. There is no member, no signal row and no
 * score in this folder. It holds definitions a coach wrote and a version
 * trail over them. Matching is Prompt 3.
 *
 * THE CLOSED SETS are the component's role and its ref kind, and both are
 * unions here and check constraints in migration 243, because the reading
 * code has to handle each exhaustively.
 */

import type { SignalSide } from '@/lib/cross-system-signals/types';

/** Where a component sits in the definition. */
export type RelationshipComponentRole = 'primary' | 'related' | 'support';

/** Which vocabulary a component's key belongs to. */
export type RelationshipRefKind = 'signal' | 'category' | 'body_area';

/**
 * One thing a pattern names.
 *
 * refLabel is stored beside refKey rather than joined at read time, the
 * same discipline a stored signal uses: a version is a snapshot of what
 * the coach wrote on the day, and a category renamed next year must not
 * silently rewrite a definition a match has already recorded.
 */
export type RelationshipComponent = {
  id: string;
  position: number;
  role: RelationshipComponentRole;
  refKind: RelationshipRefKind;
  refKey: string;
  refLabel: string;
  side: SignalSide | null;
  /** A particular stored answer that counts as support. */
  valueKey: string | null;
  valueLabel: string | null;
  /** A floor on the comparable number a signal carries. */
  minValueNumeric: number | null;
  sourceKey: string | null;
  sourceQuestionRef: string | null;
  sourceQuestionPrompt: string | null;
  note: string | null;
};

/**
 * One band of pattern strength, as thresholds rather than as a hard coded
 * ladder. Emerging and Stronger are what the editor offers by default and
 * neither is special: a coach who wants a third band adds one.
 */
export type RelationshipStrengthLevel = {
  levelKey: string;
  position: number;
  displayLabel: string;
  minSupportingSignals: number;
  minDistinctCategories: number | null;
  minRelatedSignals: number | null;
};

/** One coaching consideration, in order. */
export type RelationshipConsideration = {
  id: string;
  position: number;
  body: string;
};

/**
 * One immutable snapshot of a definition.
 *
 * An edit never rewrites one of these. It writes the next version and
 * moves the head record's pointer, so a later pattern match can record
 * this id and the wording it read stays readable word for word.
 */
export type RelationshipVersion = {
  id: string;
  relationshipId: string;
  versionNumber: number;
  patternName: string;
  minSupportingSignals: number;
  possibleAssociationText: string | null;
  /** The coach's own methodology record. Private to her, drawn nowhere else. */
  evidenceNotes: string | null;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
  components: RelationshipComponent[];
  strengthLevels: RelationshipStrengthLevel[];
  considerations: RelationshipConsideration[];
};

/** The head record: identity, the active toggle, and which version is current. */
export type RelationshipHead = {
  id: string;
  patternKey: string;
  isActive: boolean;
  /** True for the one shipped demonstration record, which is labelled as one everywhere. */
  isExample: boolean;
  currentVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A head record plus the version that is current, which is what every list row draws. */
export type RelationshipSummary = {
  head: RelationshipHead;
  current: RelationshipVersion;
};

/** A head record plus its whole trail, newest version first. What the editor opens onto. */
export type RelationshipDetail = {
  head: RelationshipHead;
  current: RelationshipVersion;
  history: RelationshipVersion[];
};

/**
 * Exactly what the editor posts. Every field is untrusted, and the server
 * resolves the labels, the keys and the version number itself.
 */
export type RelationshipComponentDraft = {
  role: RelationshipComponentRole;
  refKind: RelationshipRefKind;
  refKey: string;
  side?: string | null;
  valueKey?: string | null;
  valueLabel?: string | null;
  minValueNumeric?: number | null;
  sourceKey?: string | null;
  sourceQuestionRef?: string | null;
  sourceQuestionPrompt?: string | null;
  note?: string | null;
};

export type RelationshipStrengthLevelDraft = {
  levelKey: string;
  displayLabel: string;
  minSupportingSignals: number;
  minDistinctCategories?: number | null;
  minRelatedSignals?: number | null;
};

export type RelationshipDraft = {
  patternName: string;
  minSupportingSignals: number;
  possibleAssociationText?: string | null;
  evidenceNotes?: string | null;
  changeSummary?: string | null;
  components: RelationshipComponentDraft[];
  strengthLevels: RelationshipStrengthLevelDraft[];
  considerations: string[];
};

/** One line of the version history's "what changed", computed rather than stored. */
export type RelationshipChange = {
  field: string;
  detail: string;
};
