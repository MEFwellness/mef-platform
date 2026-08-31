/**
 * ROOT NEVER NAGS.
 *
 * A member who has not opened the app after five reminders in a row is
 * telling Root something, and the correct answer to it is not a sixth
 * reminder tomorrow. She drops to one a week. The moment she opens the
 * app again she is back to one a day, with nothing to undo and nothing to
 * ask her.
 *
 * IGNORED HAS ONE DEFINITION AND IT IS NOT "SHE DID NOT DO THE THING".
 * A notification is ignored when no sign-in happened within twenty four
 * hours of it being sent. She may have read it on the lock screen and
 * decided today was not the day, and that is a perfectly good outcome
 * this rule must not punish; what it watches for is the app going
 * genuinely unopened. The sign-ins come from `session_started` in
 * member_wellness_events, which app/actions/auth.ts has written one row of
 * per completed sign-in since migration 146. No new tracking, no new
 * column, and nothing here reads a single health figure.
 *
 * WHAT RESTORES DAILY IS OPENING THE APP, NOT DOING ANYTHING IN IT. Any
 * sign-in at or after the most recent reminder ends the quiet period,
 * even one that arrives days later and therefore still leaves that
 * reminder counted as ignored. "Until she opens the app again" is meant
 * literally.
 *
 * PURE. Every fact arrives as an argument. No clock, no database.
 */

import { daysBetweenLocalDates } from '../feed/dateMath';

/** How many consecutive ignored reminders drop her to one a week. */
export const IGNORED_STREAK_FOR_WEEKLY = 5;

/** How many of her own days must pass between reminders while she is quiet. */
export const WEEKLY_CADENCE_DAYS = 7;

/** Twenty four hours, in milliseconds. The whole of "within a day of being sent". */
export const OPENED_WITHIN_MS = 24 * 60 * 60 * 1000;

export type PastDelivery = {
  /** Her own local day the reminder was sent on. */
  localDate: string;
  /** The instant it was sent, ISO. */
  sentAt: string;
  /** Whether any sign-in landed within twenty four hours of that instant. */
  openedWithin24h: boolean;
};

export type Cadence = 'daily' | 'weekly';

export type CadenceVerdict = {
  cadence: Cadence;
  /** True when a reminder may be sent today as far as cadence alone is concerned. */
  allowedToday: boolean;
  /** How many of the most recent reminders in a row went unopened. */
  ignoredStreak: number;
  /** Her own local day of the most recent reminder, or null if she has never had one. */
  lastSentLocalDate: string | null;
  /** Days between that and today. Null when there is no previous reminder. */
  daysSinceLastSent: number | null;
};

/**
 * Whether a sign-in landed inside the twenty four hours after a send.
 * Exported because it is the definition of "ignored" and deserves its own
 * test rather than being an implementation detail of the loader.
 */
export function openedWithin24h(sentAtIso: string, signInInstants: string[]): boolean {
  const sent = new Date(sentAtIso).getTime();
  if (Number.isNaN(sent)) return false;
  return signInInstants.some((iso) => {
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return false;
    return at >= sent && at - sent <= OPENED_WITHIN_MS;
  });
}

/**
 * The cadence she is on today, and whether today is one of her days.
 *
 * @param recent  Her most recent reminders, NEWEST FIRST, at least
 *                IGNORED_STREAK_FOR_WEEKLY of them when that many exist.
 * @param openedSinceLastSent  Whether any sign-in happened at or after the
 *                most recent reminder. This is the "she came back" signal
 *                and it outranks the streak.
 */
export function resolveCadence(input: {
  recent: PastDelivery[];
  openedSinceLastSent: boolean;
  todayLocalDate: string;
}): CadenceVerdict {
  const { recent, openedSinceLastSent, todayLocalDate } = input;

  let ignoredStreak = 0;
  for (const delivery of recent) {
    if (delivery.openedWithin24h) break;
    ignoredStreak += 1;
  }

  const last = recent[0] ?? null;
  const lastSentLocalDate = last?.localDate ?? null;
  const daysSinceLastSent = lastSentLocalDate
    ? daysBetweenLocalDates(lastSentLocalDate, todayLocalDate)
    : null;

  // She came back. Whatever the streak says about the reminders behind
  // her, she is not being nagged, so nothing is throttled.
  const quiet = ignoredStreak >= IGNORED_STREAK_FOR_WEEKLY && !openedSinceLastSent;

  if (!quiet) {
    return {
      cadence: 'daily',
      allowedToday: true,
      ignoredStreak,
      lastSentLocalDate,
      daysSinceLastSent,
    };
  }

  return {
    cadence: 'weekly',
    // A member with a streak of five necessarily has a last reminder, so
    // the null branch cannot be reached here; it resolves to "allowed"
    // rather than "blocked" so a missing date can never silence her
    // forever.
    allowedToday: daysSinceLastSent === null || daysSinceLastSent >= WEEKLY_CADENCE_DAYS,
    ignoredStreak,
    lastSentLocalDate,
    daysSinceLastSent,
  };
}
