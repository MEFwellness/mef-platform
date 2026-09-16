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
 * THE TABLE HOLDS MORE THAN THIS, on purpose. Migrations 247 and 251 seed
 * fourteen surfaces, including a journal, a pain check-in, a food check-in
 * and a sleep check-in that DO NOT EXIST AS FEATURES. Their rows stay
 * registered because the point of that table is that wiring one in later
 * is a row and one call rather than a schema change, and because a
 * registered key is how a future build knows what this one decided.
 *
 * WHAT IS NOT HERE AND WHY. 'questionnaire_free_text' has no wiring
 * because the reusable assessment engine and the Body Systems Survey have
 * no free text question type at all: every question in them is a scored
 * choice. Giving a scored instrument a text box is a change to the
 * instrument, not a wiring job, and it is not one this build makes.
 */
export const SURFACE_DAILY_CHECKIN_NOTES = 'daily_checkin_notes' as const;
export const SURFACE_DAILY_CHECKIN_CONCERN = 'daily_checkin_concern' as const;
export const SURFACE_DAILY_CHECKIN_DISCOMFORT = 'daily_checkin_discomfort' as const;
export const SURFACE_EVENING_REFLECTION = 'evening_reflection' as const;
export const SURFACE_CONCERN_FLAG = 'concern_flag' as const;
export const SURFACE_CLIENT_COMMENT = 'client_comment' as const;
export const SURFACE_ASSESSMENT_FREE_TEXT = 'assessment_free_text' as const;
export const SURFACE_COACH_NOTE = 'coach_note' as const;
export const SURFACE_COACH_OBSERVATION = 'coach_observation' as const;

/**
 * Every surface this build listens on, in one list, so a test can assert
 * the set rather than hunting call sites and so a reader can see the whole
 * answer to "what does Root hear" in one place.
 *
 * ONE OF THEM IS WIRED BUT CURRENTLY UNREACHABLE, and saying so here is
 * more honest than leaving it looking complete. `concern_flag` is the
 * mid-day "what is new or worse today" box. Its action is wired into this
 * pipeline and works; its COMPONENT, components/checkin/ConcernFlag.tsx,
 * is imported by nothing. Commit f03e10e replaced the Quick Actions
 * carousel with a fixed icon grid and did not carry it across, so a member
 * has had no way to reach it since. Nothing here needs to change when it
 * is mounted again.
 */
export const WIRED_COMPLAINT_SURFACES = [
  SURFACE_DAILY_CHECKIN_NOTES,
  SURFACE_DAILY_CHECKIN_CONCERN,
  SURFACE_DAILY_CHECKIN_DISCOMFORT,
  SURFACE_EVENING_REFLECTION,
  SURFACE_CONCERN_FLAG,
  SURFACE_CLIENT_COMMENT,
  SURFACE_ASSESSMENT_FREE_TEXT,
  SURFACE_COACH_NOTE,
  SURFACE_COACH_OBSERVATION,
] as const;

/**
 * Registered, deliberately not wired, and the reason.
 *
 * SAY ONLY WHAT IS TRUE TODAY. Four of these name features that do not
 * exist, and one names a text field no instrument in this app has. None of
 * them is a promise with a date on it.
 */
export const UNWIRED_COMPLAINT_SURFACES: Readonly<Record<string, string>> = {
  journal_entry: 'No journal feature exists.',
  pain_checkin: 'No standalone pain check-in exists. The daily check-in asks about discomfort and now carries its own optional box.',
  food_checkin: 'No food check-in with free text exists.',
  sleep_checkin: 'No standalone sleep check-in exists. Sleep is asked inside the daily check-in and the Evening Reflection, both of which are wired.',
  questionnaire_free_text: 'No questionnaire in this app has a free text question. Every question in the assessment engine and the Body Systems Survey is a scored choice.',
};

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
