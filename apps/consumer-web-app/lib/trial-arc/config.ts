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

/**
 * THE TEST RIG OVERRIDE, AND EXACTLY WHAT IT IS ALLOWED TO SKIP.
 *
 * WHY IT EXISTS. Everything about this arc is only true if somebody has
 * watched it happen on the real site: the message rendering, the day
 * rolling over, the receipt landing, the closer closing. None of that can
 * be watched while the launch date is null, and the launch date must stay
 * null, because setting it would start the sequence for every real signup
 * on the day it deployed. So one named account, listed here, is let past
 * the switch.
 *
 * IT SKIPS RULES 1, 2 AND 3, AND NOTHING ELSE.
 *
 *   1  the launch date, and the account being created after it. This is the
 *      whole point: the rig is inside the arc while nobody else is.
 *   2  the test-account refusal. The rig is flagged is_test on purpose, so
 *      it stays out of every staff surface and every analytics figure, and
 *      that same flag would otherwise refuse it here.
 *   3  the trial tier and the 'system' source, so a verification run can
 *      move the rig's own trial dates around without the tier rules
 *      arguing about it.
 *
 * IT SKIPS NOTHING ELSE, AND THE THREE IT CANNOT SKIP ARE THE THREE THAT
 * MATTER. Rule 4 (never assigned a coach, in any status, ever), rule 5
 * (nobody has suppressed the arc for this account) and rule 6 (the
 * relationship derivation answers PROSPECT) all still have to pass on their
 * own. A coaching client added to this list is still refused, which is what
 * makes the list safe to have: the worst a mistyped or malicious entry can
 * do is let a stranger's own free trial account receive a welcome sequence
 * written for somebody on a free trial.
 *
 * SERVER ONLY. The variable is read from process.env with no NEXT_PUBLIC_
 * prefix, so it never reaches a browser bundle and no client can discover
 * or assert membership of it.
 *
 * WHO IS ON IT TODAY. One account: the permanent trial arc rig
 * (scripts/trial-arc-rig.mjs), which exists so prompts 4 to 7 can each watch
 * the arc happen on the real site without switching it on for anybody. It is
 * flagged is_test, so it reaches no staff screen and no analytics figure.
 *
 * EMPTY BY DEFAULT. An unset variable, an empty string, or a string of
 * separators is an empty set, and every account in the system then answers
 * to the ordinary six rules. There is no shape of input here that turns the
 * arc on for somebody who was not named, one id at a time.
 */
export const TRIAL_ARC_TEST_ACCOUNTS_ENV = 'TRIAL_ARC_TEST_ACCOUNT_IDS';

/**
 * The listed ids, as a set. Comma, whitespace or newline separated, and
 * anything that is not a well formed UUID is dropped rather than trusted:
 * a typo can only ever shorten this list, never widen it to something else.
 */
export function trialArcTestAccountIds(
  raw: string | undefined = process.env[TRIAL_ARC_TEST_ACCOUNTS_ENV]
): ReadonlySet<string> {
  if (!raw) return new Set();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => UUID.test(entry))
  );
}

/** Whether this one account is on the list. Case insensitive, because a UUID printed by one tool and pasted from another often is not. */
export function isTrialArcTestAccount(
  memberId: string,
  raw: string | undefined = process.env[TRIAL_ARC_TEST_ACCOUNTS_ENV]
): boolean {
  return trialArcTestAccountIds(raw).has(memberId.toLowerCase());
}
