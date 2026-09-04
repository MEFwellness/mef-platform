/**
 * The trial arc's launch date, and the only thing that turns it on.
 *
 * WHILE THIS IS NULL, THE TRIAL ARC IS LAUNCHED FOR NO ONE. Every account
 * in the system, including one signing up in the next minute, is
 * ineligible, and eligibility says so with 'launch_not_set' as the reason.
 * Prompt 7 of this build sets the real date. Until then the arc's modules
 * are fully built, fully tested and completely inert in production, which
 * is the point: nothing about the switch-on depends on code shipping that
 * day.
 *
 * WHY A DATE AND NOT A BOOLEAN. It doubles as the line between the accounts
 * the arc is for and the accounts it is not. Rule 1 of eligibility is that
 * the account was created on or after this instant, so existing members are
 * excluded by the launch itself rather than by a backfill, a flag or a list
 * somebody has to maintain. There is no backfill anywhere in this build,
 * deliberately: nobody who signed up before the arc existed will receive a
 * message written for somebody in their first week.
 *
 * FORMAT. An ISO 8601 instant ('2026-09-15T00:00:00Z') or a bare date
 * ('2026-09-15', read as UTC midnight). Anything unparseable is treated
 * exactly like null: the arc is launched for no one, and eligibility says
 * 'launch_not_set'. A typo can therefore only ever silence the arc, never
 * fire it at the wrong people.
 */
export const TRIAL_ARC_LAUNCH: string | null = null;

/**
 * The launch instant, or null when the arc is not launched. One place that
 * decides what an unparseable value means, so no caller has to.
 */
export function trialArcLaunchInstant(launch: string | null = TRIAL_ARC_LAUNCH): Date | null {
  if (!launch) return null;
  const parsed = new Date(launch);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
