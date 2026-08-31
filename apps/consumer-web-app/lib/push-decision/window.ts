/**
 * WHEN the job is allowed to reach her, in HER OWN hours.
 *
 * Pure. No clock, no database, no timezone of its own. The caller resolves
 * her local wall clock with lib/time/localDate.ts's nowInTimezone and
 * passes the hour in, exactly as every other date decision in this app is
 * made on the server and handed down.
 *
 * NINE IN THE MORNING, HERS, NOT NINE UTC. The whole reason this file
 * exists is that a schedule fires in UTC and a member lives somewhere. A
 * job that sent "at 9" would reach Los Angeles at 1am. So the schedule
 * runs every hour and each member is selected only in the hour her own
 * clock says is hers.
 *
 * WHY THE WINDOW IS THREE HOURS AND NOT ONE. An hourly schedule that has
 * to land in one exact hour has a single point of failure: one cron
 * invocation that does not run, or runs long, silently costs her the day
 * and there is no way to tell that from "nothing was waiting". The window
 * opens at her hour and stays open for two more, so a missed run is
 * caught by the next one. That cannot become two notifications, because
 * the cap is not the window: it is the unique (member_id, local_date)
 * receipt in migration 196, claimed before anything is sent.
 *
 * THE WINDOW NEVER CROSSES HER MIDNIGHT. A member whose hour is 23 gets a
 * window of 23 only, not 23, 0 and 1, because 0 and 1 are a DIFFERENT
 * local date and would be that day's one notification, arriving in the
 * small hours. Clamping is what keeps "one per local day at an hour she
 * chose" true at the edge of the day rather than only in the middle of it.
 */

/** The hour every member gets until something writes profiles.push_send_hour_local. Nothing does today. */
export const DEFAULT_SEND_HOUR = 9;

/** How many extra hours the window stays open after her hour, so one failed run does not cost her the day. */
export const SEND_WINDOW_CATCH_UP_HOURS = 2;

/**
 * The stored value, or the default. Anything that is not a whole hour of
 * a day falls back rather than being coerced: a nonsense value must not
 * quietly become midnight.
 */
export function resolveSendHour(stored: number | null | undefined): number {
  if (typeof stored !== 'number' || !Number.isInteger(stored)) return DEFAULT_SEND_HOUR;
  if (stored < 0 || stored > 23) return DEFAULT_SEND_HOUR;
  return stored;
}

/** The last hour of her own day the window is still open in, clamped so it never reaches tomorrow. */
export function sendWindowEndHour(sendHour: number): number {
  return Math.min(23, sendHour + SEND_WINDOW_CATCH_UP_HOURS);
}

/** Whether her local wall clock is inside today's window right now. */
export function isInsideSendWindow(localHour: number, sendHour: number): boolean {
  return localHour >= sendHour && localHour <= sendWindowEndHour(sendHour);
}

/** "9:00" — for an administrator's screen and a job log, never for a member. */
export function formatSendHour(hour: number): string {
  return `${hour}:00`;
}
