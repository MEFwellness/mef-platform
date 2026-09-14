/**
 * A SHORT PAUSE AFTER SEVERAL WRONG PASSWORDS IN A ROW.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. With the bot check off the sign-in
 * path (see lib/turnstile/verify.ts for why it had to come off), the thing
 * that actually stops somebody grinding passwords at this form is
 * Supabase's own per-IP rate limiting on /token, which runs on their
 * server, cannot be edited from a browser, and answers 429 long before any
 * number of guesses becomes useful. THAT is the protection.
 *
 * This is the other half, and it is a courtesy rather than a defence: a
 * person who has typed the wrong password five times is not going to get
 * it right on the sixth attempt three seconds later, and a form that keeps
 * accepting taps invites exactly that. A short, visible, counting-down
 * pause says "stop and think, or go and reset it" better than a fifth
 * identical red banner does. It lives entirely in the browser and anybody
 * who wants to can reload the page past it, which is fine, because it was
 * never the thing holding the door.
 *
 * IT COUNTS ONLY WRONG CREDENTIALS. A 5xx, a network drop, a rate limit
 * already imposed by Supabase: none of those are a wrong password and none
 * of them advance the counter. Making a member sit out a cooldown for the
 * account service having a bad minute would be punishing her for something
 * that was never hers.
 *
 * ONE SUCCESS CLEARS IT. There is no memory of yesterday here and nothing
 * is stored anywhere: the state is one object held by the login screen for
 * as long as that screen is open.
 */

/** Wrong passwords allowed before the first pause. */
export const FAILURES_BEFORE_COOLDOWN = 5;

/**
 * The pause after the 5th, 6th, 7th and every later consecutive failure.
 * It grows, and then it stops growing: a minute is long enough to break a
 * hammering rhythm, and anything longer starts punishing the member who
 * genuinely cannot remember which of her two passwords this one is.
 */
export const COOLDOWN_STEPS_S = [15, 30, 60] as const;

export interface LoginThrottleState {
  /** Consecutive wrong-credential answers. Reset to 0 by a success. */
  failures: number;
  /** Epoch ms the form reopens at, or 0 when it is open now. */
  cooldownUntil: number;
}

export const IDLE_THROTTLE: LoginThrottleState = { failures: 0, cooldownUntil: 0 };

/** How long the pause is for a given number of consecutive failures. */
export function cooldownSecondsFor(failures: number): number {
  if (failures < FAILURES_BEFORE_COOLDOWN) return 0;
  const step = Math.min(failures - FAILURES_BEFORE_COOLDOWN, COOLDOWN_STEPS_S.length - 1);
  return COOLDOWN_STEPS_S[step]!;
}

/** The state after one more wrong email-or-password. */
export function recordFailure(state: LoginThrottleState, now: number): LoginThrottleState {
  const failures = state.failures + 1;
  const seconds = cooldownSecondsFor(failures);
  return { failures, cooldownUntil: seconds > 0 ? now + seconds * 1000 : 0 };
}

/** Whole seconds still to wait, rounded up so a countdown never shows 0 early. */
export function secondsRemaining(state: LoginThrottleState, now: number): number {
  if (state.cooldownUntil <= now) return 0;
  return Math.ceil((state.cooldownUntil - now) / 1000);
}

/** True while the form should refuse to submit. */
export function isCoolingDown(state: LoginThrottleState, now: number): boolean {
  return secondsRemaining(state, now) > 0;
}

/**
 * What she reads while the pause is running. Says the number, says what to
 * do with it, and points at the way out that actually solves a forgotten
 * password.
 */
export function cooldownMessage(seconds: number): string {
  const unit = seconds === 1 ? 'second' : 'seconds';
  return `Too many attempts. Please wait ${seconds} ${unit} and try again, or reset your password.`;
}

/**
 * True when a Supabase sign-in error means the email or the password was
 * wrong, as opposed to anything else that can come back from that call.
 * Only this advances the counter.
 */
export function isWrongCredentials(rawMessage: string | null | undefined): boolean {
  if (!rawMessage) return false;
  return rawMessage.toLowerCase().includes('invalid login credentials');
}
