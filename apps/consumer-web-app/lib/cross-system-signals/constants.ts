/**
 * The Whole-Body Cross-System Correlation Engine's shared Signal Library,
 * in one place: what it is called, what it is addressed by, and the two
 * names it must never be confused with.
 *
 * IT IS NOT THE ROOTED RESET WHOLE-BODY SIGNAL ASSESSMENT
 * (lib/whole-body-signal/, tables whole_body_signal_*, migrations 225 to
 * 228), and it is NOT the Whole-Body Check-In in the assessment registry.
 * Those are questionnaires a member sits. This is a store the coach reads,
 * fed BY those questionnaires among others. Every table, every module and
 * every identifier in this feature carries the cross_system prefix so the
 * two can never be grepped for by accident.
 *
 * IN COACH FACING WORDS this library is "Signals" and one row is "a
 * signal". Nothing member facing exists for it at all.
 */

/** The library's coach facing name, used by the panel and the page index. */
export const CROSS_SYSTEM_SIGNALS_LABEL = 'Signals';

/** The collapsible section's DOM anchor on the client detail page. */
export const CROSS_SYSTEM_SIGNALS_SECTION_ID = 'detail-section-cross-system-signals';

/** The card's DOM anchor inside that section. */
export const CROSS_SYSTEM_SIGNALS_CARD_ID = 'detail-card-cross-system-signals';

/**
 * The registered sources, named once.
 *
 * These are the keys in cross_system_signal_sources (migration 241). A
 * source's human readable LABEL is not here: it is a row, and it is
 * copied onto every signal at capture time, so renaming a source never
 * rewrites what a coach was told last month about where a row came from.
 */
export const SOURCE_BODY_SYSTEMS = 'body_systems_survey' as const;
export const SOURCE_WHOLE_BODY_SIGNAL = 'whole_body_signal' as const;
export const SOURCE_BREATHING_CHECK_IN = 'breathing_pattern_check_in' as const;
export const SOURCE_BODY_ASSESSMENT = 'body_assessment' as const;
export const SOURCE_DAILY_CHECK_IN = 'daily_check_in' as const;
export const SOURCE_COACH_ENTERED = 'coach_entered' as const;

/**
 * The frequency words the coach's entry tool offers, and the only ones it
 * accepts.
 *
 * DELIBERATELY THE BODY SYSTEMS SURVEY'S OWN MIDDLE THREE. A coach
 * tapping "Often" beside a member's own "Often" is saying the same word
 * about the same thing, which is what makes the two comparable on one
 * timeline at all. The numeric value is that scale's own point value, so
 * a later correlation pass reads one ladder rather than two.
 */
export const COACH_FREQUENCY_OPTIONS = [
  { valueKey: 'rarely', label: 'Rarely', numeric: 1 },
  { valueKey: 'sometimes', label: 'Sometimes', numeric: 3 },
  { valueKey: 'often', label: 'Often', numeric: 6 },
] as const;

/** The longest a coach's optional one line note may be. */
export const COACH_NOTE_MAX_LENGTH = 200;
