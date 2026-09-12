/**
 * Every shape the MEF Whole-Body Signal Assessment works in.
 *
 * ALL CONTENT IS DATA. Nothing in this file is a literal question, weight,
 * cut off or sentence: those are rows, loaded by ./contentData.ts. What
 * lives here is the shape those rows arrive in, so the pure scoring, Zone,
 * pattern and view modules can be tested against a fixture read out of the
 * migrations rather than a second copy typed into a test file.
 *
 * TWO LAYERS, TWO SETS OF TYPES, AND THE COMPILER IS THE FENCE.
 * `MemberQuestion` is what a member's screens are handed: a prompt, a
 * position, and whether it offers Prefer not to answer. It has NO Zone, NO
 * organ or gland and NO coach topic field, so a member surface cannot leak
 * one even by accident, because there is nowhere on the object for one to
 * be. `PractitionerQuestion` is the whole row, and it is only ever loaded
 * on a request that has already been established as a coach's.
 */

/** 'direct' scores Never as nought, 'reverse' scores Never as four. She never sees any difference. */
export type QuestionDirection = 'direct' | 'reverse';

/**
 * Which set of answers a question is asked with.
 *
 * A KEY, NEVER A UNION OF TWO LITERALS. The scales are rows
 * (whole_body_signal_scales), so a third one is a migration rather than a
 * type change, and every module below reads the options belonging to a
 * question's own key instead of assuming there is one list.
 */
export type ScaleKey = string;

// ---------------------------------------------------------------------
// The member layer.
// ---------------------------------------------------------------------

export type MemberSection = {
  sectionKey: string;
  position: number;
  displayName: string;
  memberTransitionLine: string;
  memberAreaPhrase: string;
  motionCue: string;
};

/**
 * One question, as a member's screens receive it.
 *
 * THE PRACTITIONER COLUMNS ARE NOT HERE, and that is the whole point.
 * Everything a client component is handed is serialised into the page, so
 * a Zone left on this object would be in the payload whether a component
 * drew it or not.
 */
export type MemberQuestion = {
  questionRef: string;
  sectionKey: string;
  position: number;
  prompt: string;
  /**
   * Which answer scale this question is answered on.
   *
   * It is on the member object because her screen has to draw the right
   * answers, and it is not a practitioner field: it says what she is
   * offered, not what it means.
   */
  scaleKey: ScaleKey;
  allowsPnta: boolean;
  /** Null for every question outside Section 8's conditional set. */
  branchGroup: string | null;
  isUniversal: boolean;
};

export type ScaleOption = {
  /** The scale this option belongs to. Options of two scales never mix. */
  scaleKey: ScaleKey;
  valueKey: string;
  position: number;
  label: string;
  directPoints: number;
  reversePoints: number;
};

/**
 * One band.
 *
 * `coachColor` is on this type because the coach's surfaces read the same
 * band rows. It never reaches a member payload, because the member results
 * view has no field to carry it (see ./memberView.ts).
 */
export type SignalBand = {
  bandKey: string;
  position: number;
  /** Inclusive. */
  minPercent: number;
  /** Exclusive. Null on the loudest band, which is open ended. */
  maxPercent: number | null;
  memberLabel: string;
  memberLine: string;
  /** Strong, Moderate or Mild. What the signal landscape labels a bar with. */
  memberIntensityWord: string;
  coachColor: 'green' | 'yellow' | 'orange' | 'red';
};

export type RoutingOption = {
  optionKey: string;
  position: number;
  label: string;
  isPnta: boolean;
};

export type BranchRule = {
  optionKey: string;
  /** The CONDITIONAL questions this answer opens. The universal set is marked on the questions. */
  questionRefs: string[];
};

// ---------------------------------------------------------------------
// The practitioner layer.
// ---------------------------------------------------------------------

export type SignalZone = {
  zoneKey: string;
  position: number;
  displayName: string;
  spinalSegments: string;
  organGlandList: string;
  chakraLens: string;
};

/**
 * One question with everything needed to SCORE it and to name her own
 * theme, and nothing else.
 *
 * THIS IS A SERVER SIDE SHAPE. It is what her results are built from on
 * her own request, and it never crosses to a browser. It deliberately
 * carries no organ or gland and no coach topic: those are practitioner
 * labels and this object is read while answering a member's request.
 */
export type ReadingQuestion = MemberQuestion & {
  direction: QuestionDirection;
  primaryZoneKey: string;
  /** Null when this question contributes to one Zone only. */
  secondaryZoneKey: string | null;
  /** The plain language name for what this question is about. The only one a member may read. */
  memberTheme: string;
};

/** The whole question row. Only ever loaded for a coach or an administrator. */
export type PractitionerQuestion = ReadingQuestion & {
  organGland: string;
  coachTopic: string;
  /** Provenance only. A question scores in its own section and nowhere else. */
  feedsSectionKey: string | null;
};

/**
 * The closed rule vocabulary for a cross section pattern.
 *
 * `minPercent` is optional on purpose: left off, the evaluator reads the
 * one stored elevated threshold, so the number lives in exactly one place.
 */
export type PatternRule =
  | { type: 'sections_at_or_above'; sections: string[]; minPercent?: number }
  | { type: 'sections_count_at_or_above'; minCount: number; minPercent?: number };

export type SignalPattern = {
  patternKey: string;
  position: number;
  title: string;
  rule: PatternRule;
  /** The practitioner approved sentence, whole. Nothing composes around it. */
  coachText: string;
};

/** The closed trigger vocabulary for a coaching question. */
export type CoachingTrigger =
  | { type: 'sections_at_or_above'; sections: string[]; minPercent?: number }
  | { type: 'section'; section: string; minPercent?: number }
  | { type: 'answer'; questions: string[]; minSignal?: number }
  | { type: 'primary_zone'; zone: string };

export type CoachingTriggerType = 'combination' | 'answer' | 'zone' | 'section';

export type CoachingQuestion = {
  questionKey: string;
  position: number;
  triggerType: CoachingTriggerType;
  trigger: CoachingTrigger;
  question: string;
  topic: string;
};

// ---------------------------------------------------------------------
// Her answers and the stored reading.
// ---------------------------------------------------------------------

/** question_ref to a scale value_key, or the Prefer not to answer literal. */
export type WbsAnswers = Record<string, string>;

/** One section's arithmetic. Numbers and slugs only, never sentences. */
export type SectionResult = {
  sectionKey: string;
  /** Signal points earned across the questions she actually answered. */
  points: number;
  /** Points possible across those same questions. A Prefer not to answer is in neither. */
  possible: number;
  /** Rounded to the nearest whole percent. The ONE number every surface prints. */
  percent: number;
  bandKey: string;
  answeredCount: number;
  /** How many of this section's shown questions she marked Prefer not to answer. */
  pntaCount: number;
};

/** One Zone's rollup. Built from ANSWERS, never from section percentages. */
export type ZoneResult = {
  zoneKey: string;
  /** Contributed points: full weight from a primary tag, half from a secondary one. */
  points: number;
  /** Maximum contributable points across the same questions, at the same weights. */
  possible: number;
  percent: number;
};

/** The Whole-Body Signal Load and the three numbers behind it. */
export type SignalLoad = {
  /** Rounded to a whole number. */
  value: number;
  /** Mean of all scorable section percentages. */
  componentA: number;
  /** Share of scorable sections at the elevated threshold or above, as a percentage. */
  componentB: number;
  /** Mean of the highest section percentages. */
  componentC: number;
};

/** The whole stored reading. What lands in member_whole_body_signal_sessions.results. */
export type WbsResults = {
  /** Null only on a sitting whose routing question was never reached, which cannot complete. */
  routingOptionKey: string | null;
  /** Loudest first, ties broken by the section's own fixed position. */
  sections: SectionResult[];
  /** Loudest first. Coach only: no member view has a field to carry one. */
  zones: ZoneResult[];
  load: SignalLoad;
};
