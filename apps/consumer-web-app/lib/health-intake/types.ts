/**
 * The shape of the Health & Lifestyle Intake: its sections, its screens,
 * its fields, and the answers a member gives them.
 *
 * WHY THE CONTENT IS TYPED DATA RATHER THAN STORED ROWS. Every scored
 * instrument in this app keeps its content in the database, because a
 * coach retunes a weight, a cut off or a band and must not need a deploy
 * to do it. This one scores nothing: it has no weight, no band, no
 * maximum and no reading. What it has instead is eleven different KINDS of
 * question, several of which carry their own follow-ups and their own
 * repeatable entries, and a generic row schema able to express all of them
 * would be a second questionnaire engine rather than a content table. So
 * the instrument is a typed constant (./questions.ts), read by pure
 * functions, and every word of it is covered by tests that parse the same
 * constant the app serves. This is the same decision the eight Happiness
 * deep-dives took, for the same reason.
 *
 * A FIELD ID IS A PERMANENT NAME. It is the key an answer is stored under
 * and the key the coach's summary reads back, so renaming one silently
 * orphans stored answers. Retire a field by removing it from the screens
 * and leaving its id unused; never reuse an id for a different question.
 */

/** The eleven chapters, in the order she walks them. */
export type IntakeSectionKey =
  | 'about_you'
  | 'what_brings_you'
  | 'health_background'
  | 'history'
  | 'already_tried'
  | 'stress'
  | 'body_weight'
  | 'movement'
  | 'sleep_rhythm'
  | 'senses'
  | 'symptoms';

export type IntakeOption = {
  value: string;
  label: string;
  /**
   * A multi-select option that cannot be held alongside any other, because
   * the two would contradict each other ("No meaningful change" beside
   * "Stairs"). Selecting it clears the rest; selecting anything else
   * clears it.
   */
  exclusive?: boolean;
  /** Selecting this reveals the named short text field on the same screen. */
  revealsTextFieldId?: string;
};

/** One field inside a repeatable entry (a medication, a surgery). */
export type IntakeEntryField =
  | { kind: 'text'; id: string; label: string; optional?: boolean; placeholder?: string }
  | { kind: 'select'; id: string; label: string; options: IntakeOption[]; optional?: boolean }
  | { kind: 'year'; id: string; label: string; optional?: boolean };

/** What an entry list calls the things in it, so a removal can be named honestly. */
export type IntakeNoun = { one: string; many: string };

export type IntakeField =
  | { kind: 'short_text'; id: string; label: string; optional?: boolean; placeholder?: string; prefillFrom?: 'display_name' }
  | { kind: 'long_text'; id: string; label: string; optional?: boolean; placeholder?: string }
  | { kind: 'date'; id: string; label: string; optional?: boolean; help?: string }
  | { kind: 'height'; id: string; label: string; optional?: boolean }
  | { kind: 'single_select'; id: string; label: string; options: IntakeOption[]; optional?: boolean }
  | { kind: 'multi_select'; id: string; label: string; options: IntakeOption[]; optional?: boolean; help?: string }
  /**
   * A binary Yes / No screening question, and the ONLY field in this
   * instrument allowed to advance by itself. See ./steps.ts.
   */
  | { kind: 'gate'; id: string; label: string; yesLabel?: string; noLabel?: string }
  | { kind: 'scale_ten'; id: string; label: string; lowLabel: string; highLabel: string }
  | { kind: 'time'; id: string; label: string; help?: string }
  | {
      kind: 'entry_list';
      id: string;
      label: string;
      addLabel: string;
      addAnotherLabel: string;
      noun: IntakeNoun;
      entryFields: IntakeEntryField[];
      /** Which entry field ids compose the card's headline, in order. */
      summaryFieldIds: string[];
    }
  /**
   * One follow-up asked once per item a member selected on an earlier
   * multi-select. The answers are stored as a map keyed by the item value,
   * so an item she later unselects takes its follow-up with it.
   */
  | {
      kind: 'per_item';
      id: string;
      /** The multi-select whose selected values decide what is asked. */
      sourceFieldId: string;
      label: string;
      options: IntakeOption[];
      /** Item values this follow-up is never asked for (an exclusive "no change" option). */
      skipValues?: string[];
      /** Only ask it for these item values. Omitted means every selected value. */
      onlyValues?: string[];
      noun: IntakeNoun;
    };

/**
 * Whether a screen is shown at all.
 *
 * Deliberately three narrow forms rather than an expression language. A
 * condition a test cannot enumerate is a branch nobody can prove closes.
 */
export type IntakeCondition =
  | { fieldId: string; equals: string }
  | { fieldId: string; oneOf: string[] }
  /** A multi-select that holds at least one of these values. An empty list means "at least one of anything". */
  | { fieldId: string; includesAny: string[] }
  | { fieldId: string; isAnswered: true };

/** One screen. She sees one of these at a time. */
export type IntakeScreen = {
  id: string;
  sectionKey: IntakeSectionKey;
  /** The screen's own heading, when the fields under it need one sentence above them. */
  title?: string;
  /** One quiet line under the heading. Never a claim about her. */
  note?: string;
  fields: IntakeField[];
  showWhen?: IntakeCondition;
  /**
   * The gate whose Yes opened this screen. Set on every screen a gate
   * reveals, so a flip back to No can name exactly what it removes without
   * re-deriving the branch. Purely descriptive: visibility is decided by
   * showWhen, and ./branching.ts asserts the two always agree.
   */
  openedBy?: string;
};

export type IntakeSection = {
  key: IntakeSectionKey;
  /** 1 through 11. The soft counter she reads. */
  number: number;
  title: string;
  /** The one warm framing line under the title. */
  framingLine: string;
  /**
   * A short sentence carried at the TOP of this chapter's own screen, for
   * the few chapters that earn one. Never after every question.
   */
  transitionLine?: string;
  screens: IntakeScreen[];
};

/** One repeatable entry, as stored: entry field id to the text she typed. */
export type IntakeEntry = Record<string, string>;

/**
 * One stored answer.
 *
 * A string for a text, date, time, single select or gate. A number for the
 * ten point scale. A string array for a multi select. An array of entries
 * for an entry list. A map for a per item follow-up.
 */
export type IntakeAnswerValue =
  | string
  | number
  | string[]
  | IntakeEntry[]
  | Record<string, string>;

export type IntakeAnswers = Record<string, IntakeAnswerValue>;

/** Yes and No, stored as the literals a gate holds. Nothing else is a gate answer. */
export const GATE_YES = 'yes' as const;
export const GATE_NO = 'no' as const;
