/**
 * Every shape automatic complaint understanding works in.
 *
 * WHAT A CLASSIFICATION IS ALLOWED TO SAY, and the reason it is a type
 * rather than a rule somebody remembers. Read the fields below: a
 * canonical signal, a body area, a side, a context, a frequency, and the
 * span of her own words that produced them. There is no cause field, no
 * condition field, no organ field, no confidence and no score, and there
 * is nowhere one could be added without a reviewer noticing.
 *
 * "Right hip pain reported" is what this layer produces. "Kidney
 * dysfunction is producing the hip pain" is not a thing it has the
 * vocabulary to express. What may be worth reviewing alongside a complaint
 * is decided afterwards, by the Whole-Body Association Map, which holds
 * only what a coach put in it.
 *
 * ALL CONTENT IS DATA. Not one phrase, area, side word or frequency word
 * is a literal in this folder: they are rows in migrations 246 and 247.
 * What lives here is the shape those rows arrive in, so the classifier can
 * be driven from a fixture with no database at all.
 */

import type { SignalSide } from '@/lib/cross-system-signals/types';

/** Which surface a complaint arrived on. A row, so a new one is not a deploy. */
export type ComplaintSurface = {
  surfaceKey: string;
  position: number;
  displayName: string;
  defaultAuthorRole: 'member' | 'coach';
};

/** A context her own words carried. Never one the code inferred. */
export type ComplaintContext = {
  contextKey: string;
  position: number;
  displayName: string;
};

/**
 * One way IN to a canonical signal name.
 *
 * IT CANNOT WIDEN THE VOCABULARY. signalSlug is a foreign key onto
 * cross_system_signal_names, so a lexicon row is another way of saying a
 * name a coach has already reviewed, and never a new name.
 */
export type ComplaintPhrase = {
  phrase: string;
  signalSlug: string;
  /** An area the phrase itself carries ("my right hip"), overriding the name's default. */
  bodyAreaKey: string | null;
  specificity: number;
};

/** What sort of meaning a modifier carries. */
export type ComplaintModifierKind =
  | 'side'
  | 'body_area'
  | 'context'
  | 'frequency'
  /** Closes a match out when it sits IN FRONT of it ("no bloating"). */
  | 'negation'
  /** Closes a match out when it sits BEHIND it ("my headaches have stopped"). */
  | 'negation_after'
  /**
   * REOPENS one that a closing word would otherwise have shut.
   *
   * WHY THIS IS A THIRD KIND AND NOT THE ABSENCE OF THE OTHER TWO. "My
   * headaches stopped, but they have come back" contains a closing word
   * and is a CURRENT complaint. A matcher that only knew how to close
   * would file it as settled, and that is the worse direction to be wrong
   * in: the library is append over time and the engine reads the LATEST
   * row, so a sentence reopening a complaint would have buried it.
   */
  | 'reassertion';

/**
 * A word that CHANGES a match rather than being one.
 *
 * "right" is not a complaint. Keeping these apart from the phrase lexicon
 * is what stops a sentence full of ordinary words from producing signals.
 */
export type ComplaintModifier = {
  phrase: string;
  kind: ComplaintModifierKind;
  side: SignalSide | null;
  bodyAreaKey: string | null;
  contextKey: string | null;
  frequencyKey: string | null;
  frequencyLabel: string | null;
  frequencyNumeric: number | null;
};

/**
 * The whole lexicon in one object, as the classifier receives it.
 *
 * Handed in rather than fetched, for the reason the Signal Library's own
 * adapters are: a classifier that cannot reach a database is a classifier
 * a test can drive with a literal, and one ingestion pass must not read
 * the same tables once per complaint.
 */
export type ComplaintLexicon = {
  /** Sorted longest phrase first, which is the order the matcher depends on. */
  phrases: readonly ComplaintPhrase[];
  modifiers: readonly ComplaintModifier[];
  surfaces: ReadonlyMap<string, ComplaintSurface>;
  contexts: ReadonlyMap<string, ComplaintContext>;
};

/**
 * One thing the classifier recognized in one complaint.
 *
 * matchedPhrase IS THE PROOF, and it is a span of HER text rather than the
 * lexicon's tidier version of it, so a coach reading a finding sees the
 * words Root actually read and a wrong classification is visible rather
 * than mysterious.
 */
export type ComplaintClassificationDraft = {
  position: number;
  signalSlug: string;
  /**
   * TRUE WHEN HER WORDS CLOSED THIS OUT rather than reported it.
   *
   * A resolution is a classification, not a silence. The matcher used to
   * recognize "my headaches have stopped" and then throw the whole match
   * away, which wrote nothing at all: no row, and no way for a coach to
   * know she had said it. Worse, the Signal Library is append over time
   * and the engine reads the latest row, so the silence left her older
   * complaint standing as the newest thing she had said on the subject.
   *
   * A row carrying this is written as an ordinary signal at nought, which
   * is exactly what lib/cross-system-root/evidence.ts already reads as
   * RESOLVED, and what lib/cross-system-patterns/match.ts already refuses
   * to count as support.
   */
  isResolution: boolean;
  bodyAreaKey: string | null;
  side: SignalSide | null;
  /** The exact substring of the original text that produced this row. */
  matchedPhrase: string;
  contextKey: string | null;
  frequencyKey: string | null;
  frequencyLabel: string | null;
  frequencyNumeric: number | null;
};

/** Which approach read the words. */
export type ComplaintClassifierKind = 'deterministic_lexicon' | 'provider_validated';

/** One complaint, before it is a row. */
export type ComplaintReportDraft = {
  memberId: string;
  surfaceKey: string;
  surfaceLabel: string;
  /** Her words, verbatim. Never the classifier's tidied version. */
  rawText: string;
  fieldRef: string | null;
  fieldPrompt: string | null;
  sourceRecordId: string | null;
  reportedOn: string;
  reportedAt: string;
  authorRole: 'member' | 'coach';
  authoredBy: string | null;
  classifierKind: ComplaintClassifierKind;
  classifierRevision: string;
  ingestFingerprint: string | null;
};

/** One stored complaint, as every coach surface reads it. */
export type ComplaintReportRecord = ComplaintReportDraft & {
  id: string;
  lookupCompletedAt: string | null;
  createdAt: string;
};

/** One stored classification, joined to the signal it was written into. */
export type ComplaintClassificationRecord = ComplaintClassificationDraft & {
  id: string;
  reportId: string;
  signalId: string | null;
};

/** A complaint and everything the classifier found in it. */
export type ClassifiedComplaint = {
  report: ComplaintReportRecord;
  classifications: ComplaintClassificationRecord[];
};
