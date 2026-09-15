/**
 * Every shape the shared Signal Library works in.
 *
 * ALL CONTENT IS DATA. No category, body area, symptom word or
 * standardized signal name is a literal in this file or anywhere else in
 * this folder: those are rows loaded by ./contentData.ts. What lives here
 * is the shape those rows arrive in, so the adapters and the view builder
 * can be tested against a fixture with no database at all.
 *
 * THE THREE CLOSED SETS are side, the kind of value a row carries and the
 * entry mode. Each is a shape the reading code must handle exhaustively,
 * so each is a union here and a check constraint in migration 240 rather
 * than a table.
 */

/** Which side of the body, when the question has one. */
export type SignalSide = 'left' | 'right' | 'both' | 'not_applicable';

/**
 * What sort of answer a row carries.
 *
 *   scale     a five point frequency word the member chose.
 *   band      a stored band, "Showing Up" or "Speaking loudly".
 *   severity  a graded finding, "Moderate".
 *   score     an instrument total, "23 of 64".
 *   percent   a bare percentage with no band behind it.
 *   presence  the thing was reported, with no grading attached.
 *   coach_tap the coach's own tap in the entry tool.
 */
export type SignalValueKind =
  | 'scale'
  | 'band'
  | 'severity'
  | 'score'
  | 'percent'
  | 'presence'
  | 'coach_tap';

/** Ingested by an adapter, or typed by a coach. */
export type SignalEntryMode = 'ingested' | 'coach_entered';

export type SignalCategory = {
  categoryKey: string;
  position: number;
  displayName: string;
};

export type SignalBodyArea = {
  areaKey: string;
  position: number;
  displayName: string;
  /** False where Left / Right is not a sensible question, so the entry tool skips the selector. */
  takesSide: boolean;
};

export type SignalSymptomType = {
  symptomKey: string;
  position: number;
  displayName: string;
  /** The lowercase form a composed name uses ("Hip clicking"). */
  phrase: string;
  defaultCategoryKey: string | null;
};

export type StandardizedSignalName = {
  signalSlug: string;
  displayName: string;
  categoryKey: string;
  defaultBodyAreaKey: string | null;
  defaultSymptomKey: string | null;
  /** Extra words the coach's search matches on. */
  searchTerms: string;
  isCoachAddable: boolean;
};

export type SignalSource = {
  sourceKey: string;
  position: number;
  displayName: string;
  assessmentDefinitionId: string | null;
};

/** What sort of key a dictionary entry's external_key is. */
export type SignalExternalKind = 'section' | 'question' | 'item' | 'finding_type' | 'metric';

export type SignalSourceMapping = {
  sourceKey: string;
  externalKind: SignalExternalKind;
  externalKey: string;
  signalSlug: string;
  /** Overrides the standardized name's own default area for this one question. */
  bodyAreaKey: string | null;
};

/**
 * The whole library in one object, as an adapter receives it.
 *
 * It is handed in rather than fetched by the adapter, for two reasons:
 * one ingestion run maps five sources and must not read the same six
 * tables five times, and an adapter that cannot reach a database is an
 * adapter a test can drive with a literal.
 */
export type SignalLibrary = {
  categories: ReadonlyMap<string, SignalCategory>;
  bodyAreas: ReadonlyMap<string, SignalBodyArea>;
  symptoms: ReadonlyMap<string, SignalSymptomType>;
  names: ReadonlyMap<string, StandardizedSignalName>;
  sources: ReadonlyMap<string, SignalSource>;
  /** Keyed `${sourceKey}::${externalKind}::${externalKey}`. See mappingKey in ./library.ts. */
  mappings: ReadonlyMap<string, SignalSourceMapping>;
};

/**
 * One signal an adapter has decided to write, before it is a row.
 *
 * EVERY FIELD THAT NAMES A SOURCE IS REQUIRED TO BE HONEST. sourceKey and
 * the session, question ref and prompt behind it are what let the coach's
 * list show where a value came from and what the member was actually
 * answering, which is the difference between a library and a pile of
 * assertions.
 */
export type SignalDraft = {
  signalSlug: string;
  signalName: string;
  categoryKey: string;
  bodyAreaKey: string | null;
  symptomKey: string | null;
  side: SignalSide | null;
  valueKind: SignalValueKind;
  valueLabel: string;
  valueKey: string | null;
  valueNumeric: number | null;
  sourceKey: string;
  sourceLabel: string;
  sourceSessionId: string | null;
  sourceQuestionRef: string | null;
  sourceQuestionPrompt: string | null;
  sourceRecordId: string | null;
  /** A bare YYYY-MM-DD local day. Never derived from a server clock inside an adapter. */
  capturedOn: string;
  capturedAt: string;
  note: string | null;
  /**
   * Names the source, the sitting and the thing inside it. Re-running
   * ingestion over one completed sitting writes nothing the second time;
   * a NEW sitting has a new id and therefore a new fingerprint, which is
   * what keeps the library append over time.
   */
  ingestFingerprint: string;
};

/** One stored signal, as every coach surface reads it. */
export type SignalRecord = {
  id: string;
  memberId: string;
  signalSlug: string;
  signalName: string;
  categoryKey: string;
  bodyAreaKey: string | null;
  symptomKey: string | null;
  side: SignalSide | null;
  valueKind: SignalValueKind;
  valueLabel: string;
  valueKey: string | null;
  valueNumeric: number | null;
  sourceKey: string;
  sourceLabel: string;
  sourceSessionId: string | null;
  sourceQuestionRef: string | null;
  sourceQuestionPrompt: string | null;
  sourceRecordId: string | null;
  capturedOn: string;
  capturedAt: string;
  note: string | null;
  enteredBy: string | null;
  entryMode: SignalEntryMode;
};
