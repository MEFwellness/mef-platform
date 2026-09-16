/**
 * Automatic complaint understanding, named once.
 *
 * IT IS THE LISTENING HALF OF THE SAME FEATURE as
 * lib/cross-system-signals/ and lib/cross-system-relationships/, and it
 * carries the same cross_system prefix for the same reason those two do:
 * the app already holds the Rooted Reset Whole-Body Signal Assessment and
 * the older Whole-Body Check-In, and this is neither.
 *
 * IT CREATES NO SECOND SIGNAL STORE. A classified complaint writes an
 * ordinary row in cross_system_signals, under an ordinary source key,
 * with an ordinary fingerprint. What is new is the record of the sentence
 * itself.
 *
 * COACH ONLY. Nothing member facing exists for it, and migration 246 gives
 * its tables no member policy of any kind.
 */

/** The two sources a classified complaint files a signal under. */
export const SOURCE_MEMBER_REPORTED = 'member_reported' as const;
export const SOURCE_COACH_REPORTED = 'coach_reported' as const;

/**
 * The surfaces this build actually wires up.
 *
 * THE TABLE HOLDS MORE THAN THIS, on purpose. Migration 247 seeds eleven
 * surfaces including a journal and a pain check-in that do not exist yet,
 * because the point of that table is that wiring one in later is a row and
 * one call rather than a schema change. These are the keys the code names
 * today.
 */
export const SURFACE_DAILY_CHECKIN_NOTES = 'daily_checkin_notes' as const;
export const SURFACE_DAILY_CHECKIN_CONCERN = 'daily_checkin_concern' as const;
export const SURFACE_COACH_NOTE = 'coach_note' as const;

/**
 * The longest free text this layer will read in one go.
 *
 * A LIMIT IS NOT AN OPINION ABOUT HOW MUCH SHE MAY WRITE. Her words are
 * stored in full either way; this caps what one classification pass walks,
 * so a pasted essay cannot turn a member's submit into a long request.
 */
export const COMPLAINT_TEXT_MAX_SCAN = 4000;

/** The most classifications one complaint may produce. */
export const MAX_CLASSIFICATIONS_PER_REPORT = 24;
