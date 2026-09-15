/**
 * The Relationship Library, named once.
 *
 * IT IS THE SECOND HALF OF THE SAME FEATURE AS lib/cross-system-signals/,
 * and it carries the same cross_system prefix for the same reason: the
 * app already holds the Rooted Reset Whole-Body Signal Assessment
 * (lib/whole-body-signal/) and the older Whole-Body Check-In, and neither
 * is this.
 *
 * SIGNALS ARE WHAT A BODY SAID. RELATIONSHIPS ARE WHAT THE COACH KNOWS.
 * The Signal Library fills itself from assessments. This library fills
 * only from her, one definition at a time, and nothing in this codebase
 * writes a row in it on her behalf.
 *
 * COACH ONLY. Nothing member facing exists for it at all, and migration
 * 243 gives its five tables no member policy of any kind.
 */

/** The library's coach facing name, used by the tool tile and the page. */
export const RELATIONSHIP_LIBRARY_LABEL = 'Relationship Library';

/** Where the editor lives. One place, so a tile and a link cannot disagree. */
export const RELATIONSHIP_LIBRARY_HREF = '/coach/relationships';

/**
 * THE FOUR LEVELS THE FORM SEPARATES, and the fifth field that is hers
 * alone. The editor draws one section per entry, in this order, and the
 * headings are here rather than inline so the form and any later reader
 * of a definition name the same four things the same way.
 */
export const RELATIONSHIP_FORM_SECTIONS = [
  {
    key: 'observed_inputs',
    title: 'Observed inputs',
    blurb:
      'The signals, categories and body areas this pattern is made of. A primary is where it starts. A related is anything observed together with it. A supporting input is a specific answer or level that counts towards the pattern surfacing.',
  },
  {
    key: 'pattern_composition',
    title: 'Pattern composition',
    blurb:
      'How many supporting signals have to be present before this pattern may surface at all, and the thresholds that separate one strength level from the next.',
  },
  {
    key: 'possible_association',
    title: 'Possible Association text',
    blurb:
      'Coach only. What this pattern may mean, in association language: observed together, may be relevant, worth exploring. Never a claim about what one thing does to another.',
  },
  {
    key: 'coaching_considerations',
    title: 'Coaching Considerations',
    blurb: 'One line each. What is worth exploring, and what is worth asking about next.',
  },
] as const;

/** The private fifth field, labelled so it can never be mistaken for coach facing text. */
export const RELATIONSHIP_EVIDENCE_SECTION = {
  key: 'evidence_notes',
  title: 'Evidence and methodology notes',
  blurb:
    'Private to you. Your own reasoning, your training sources, and why you wrote the pattern this way. Shown nowhere outside this editor.',
} as const;

/** What a component's role is called where a coach reads it. */
export const ROLE_LABELS = {
  primary: 'Primary',
  related: 'Related',
  support: 'Supporting',
} as const;

/** What a component's vocabulary is called where a coach reads it. */
export const REF_KIND_LABELS = {
  signal: 'Signal',
  category: 'Body system',
  body_area: 'Body area',
} as const;

/**
 * The two strength levels a new relationship starts with.
 *
 * NEITHER IS SPECIAL TO THE SCHEMA. They are rows in migration 243 like
 * any other, and a coach may rename them, change their thresholds, remove
 * one or add a third. This is the starting point the form offers, not a
 * ladder the code depends on.
 */
export const DEFAULT_STRENGTH_LEVELS = [
  {
    levelKey: 'emerging',
    displayLabel: 'Emerging',
    minSupportingSignals: 2,
    minDistinctCategories: null,
    minRelatedSignals: null,
  },
  {
    levelKey: 'stronger',
    displayLabel: 'Stronger',
    minSupportingSignals: 3,
    minDistinctCategories: 2,
    minRelatedSignals: null,
  },
] as const;

/** The longest a pattern name may be. */
export const PATTERN_NAME_MAX_LENGTH = 140;
/** The longest one coaching consideration may be. */
export const CONSIDERATION_MAX_LENGTH = 400;
/** The longest a free text field may be. */
export const LONG_TEXT_MAX_LENGTH = 4000;
/** The most components one version may carry, so a malformed post cannot write thousands of rows. */
export const MAX_COMPONENTS = 60;
/** The most strength levels one version may carry. */
export const MAX_STRENGTH_LEVELS = 6;
/** The most coaching considerations one version may carry. */
export const MAX_CONSIDERATIONS = 30;
