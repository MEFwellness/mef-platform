/**
 * Every shape the MEF Body Systems Survey works in.
 *
 * ALL CONTENT IS DATA. Nothing in this file is a literal question, a
 * literal weight or a literal sentence: those are rows, loaded by
 * ./content.ts. What lives here is the shape those rows arrive in, so the
 * pure scoring, association and view modules can be tested against a
 * fixture without a database.
 *
 * TWO LAYERS, TWO TYPES. `MemberResultsView` may only ever hold loudness
 * language. `CoachReadingView` holds everything else. They are separate
 * types rather than one type with a flag, because a flag is something a
 * caller can get wrong and a type is something the compiler checks.
 */

/** Which Hormonal Health question set a member answers. */
export type BodySystemsBranch = 'a' | 'b';

/** 'all' for the ten sections everybody answers, 'a' or 'b' inside Hormonal Health. */
export type BodySystemsQuestionBranch = 'all' | BodySystemsBranch;

export type BodySystemsSection = {
  sectionKey: string;
  position: number;
  displayName: string;
  memberIntroLine: string;
  topAttentionLine: string;
  registryDomain: string;
  registryCode: string;
};

export type BodySystemsQuestion = {
  questionRef: string;
  sectionKey: string;
  position: number;
  prompt: string;
  branch: BodySystemsQuestionBranch;
  allowsDna: boolean;
  /** Null when this question can always apply. Never null when allowsDna is true (a database check enforces it). */
  dnaLabel: string | null;
};

export type BodySystemsScaleOption = {
  valueKey: string;
  position: number;
  label: string;
  points: number;
  /** Often or Almost always. The single definition every association trigger rests on. */
  isElevated: boolean;
};

export type BodySystemsBand = {
  bandKey: string;
  position: number;
  /** Inclusive. */
  minPercent: number;
  /** Exclusive. Null on the loudest band, which is open ended. */
  maxPercent: number | null;
  colorKey: 'green' | 'yellow' | 'red';
  memberLabel: string;
  memberStatusLine: string;
};

export type BodySystemsSafetyLevel = {
  level: 1 | 2;
  label: string;
  memberResponse: string;
};

export type BodySystemsRedFlag = {
  flagKey: string;
  position: number;
  prompt: string;
  level: 1 | 2;
};

/** One entry of the coach association library. Never reaches a member surface. */
export type BodySystemsAssociation = {
  entryCode: string;
  position: number;
  /** Null for a cross system meta pattern that belongs to no single section. */
  sectionKey: string | null;
  branch: BodySystemsQuestionBranch;
  title: string;
  trigger: AssociationTrigger;
  /** The coach approved sentence, whole, including its cautious frame. */
  associationText: string;
  nextStep: string;
};

/**
 * The closed trigger vocabulary. Documented on the table in migration 220.
 *
 * Anything that does not parse into one of these is dropped rather than
 * guessed at, so a malformed row can never fire an association.
 */
export type AssociationTrigger =
  | { type: 'cluster'; questions: string[]; min: number }
  | { type: 'min_elevated'; questions: string[]; min: number }
  | { type: 'all_elevated'; questions: string[] }
  | { type: 'any_elevated'; questions: string[] }
  | { type: 'all_of'; conditions: AssociationTrigger[] }
  | { type: 'any_of'; conditions: AssociationTrigger[] }
  | { type: 'sections_at_band'; sections: string[]; band: string }
  | { type: 'sections_count_at_band'; band: string; min: number };

/** The literal stored for a Does not apply to me tap. Scores nothing, leaves the denominator. */
export const DNA_VALUE = 'dna' as const;

/** question_ref to a scale value_key, or the DNA literal. */
export type BodySystemsAnswers = Record<string, string>;

/** flag_key to her Yes or No. Kept in its own object because nothing that scores ever receives it. */
export type BodySystemsRedFlagAnswers = Record<string, boolean>;

/** One section's arithmetic. Numbers and slugs only, never sentences. */
export type SectionResult = {
  sectionKey: string;
  /** Points earned across the questions she actually answered. */
  points: number;
  /** Points possible across those same questions. DNA answers are in neither. */
  possible: number;
  /** Rounded to the nearest whole percent. The ONE number every surface prints. */
  percent: number;
  bandKey: string;
  /** How many of this section's questions she answered with something other than Does not apply to me. */
  answeredCount: number;
  /** How many she marked Does not apply to me. */
  dnaCount: number;
};

/** The whole stored reading. What lands in member_body_systems_sessions.results. */
export type BodySystemsResults = {
  branch: BodySystemsBranch;
  /** Loudest first, ties broken by the section's own fixed position. */
  sections: SectionResult[];
};

/**
 * WHY THESE THREE SHAPES LIVE HERE and not beside the engine that builds
 * them. ./retake.ts compares patterns across two sittings and needs the
 * shape, and ./contentData.ts needs ./retake.ts for one threshold, and a
 * member's own screens load their content through ./contentData.ts. A type
 * import is erased at compile time, but the import graph guard in
 * tests/body-systems-member-language.test.tsx cannot tell a type import
 * from a real one and should not try: the honest fix is that a member
 * surface has no path to the module holding the association TEXT at all.
 * A shape carries no words, so it can live here.
 */

/** One cited answer: what she was asked, and what she tapped. */
export type WhySurfacedAnswer = {
  questionRef: string;
  sectionKey: string;
  sectionName: string;
  prompt: string;
  /** The scale label she chose. Her own answer, never a paraphrase. */
  answerLabel: string;
  points: number;
};

/** One cited section band, for a trigger that reads loudness rather than single answers. */
export type WhySurfacedSection = {
  sectionKey: string;
  sectionName: string;
  percent: number;
  bandLabel: string;
};

/** One library entry that fired, with the words from its own row and its citation. */
export type FiredAssociation = {
  entryCode: string;
  title: string;
  sectionKey: string | null;
  sectionName: string | null;
  associationText: string;
  nextStep: string;
  whySurfacedAnswers: WhySurfacedAnswer[];
  whySurfacedSections: WhySurfacedSection[];
};
