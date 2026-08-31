/**
 * The trial-ended screen's words, in one place so a test can hold them.
 *
 * VOICE. Root does not sell and does not scold. A member reaching this
 * screen has just spent their trial with us and has done nothing wrong, so
 * nothing here counts down, warns, or implies loss. It says the time is
 * complete, says their work is still theirs, and leaves the next move to
 * them.
 *
 * WHY THE HEADING IS A FUNCTION. The trial is 7 days for accounts created
 * from migration 198 on, and was 30 days for every account stamped before
 * it. Both of those members reach this same screen, so a fixed number in
 * the heading would be a lie to one of them. The heading is built from the
 * window that member was actually given, and falls back to naming no
 * number at all when the row cannot be read.
 *
 * STYLE LAW. No em dash anywhere, in this file or any other member-facing
 * string: commas, periods, colons and parentheses instead.
 * tests/no-em-dash-guard.test.ts enforces it across the whole app.
 *
 * NOT PRESCRIPTIVE. No instruction, no deadline, no "act now", and no
 * health claim of any kind.
 */

export const TRIAL_ENDED_COPY = {
  eyebrow: 'Your membership',
  /** Used when we cannot tell how long this member's trial ran. Names no number, so it is true either way. */
  heading: 'Your free trial is complete',
  body: [
    'Thank you for spending this time here. Everything you noticed, logged and worked on is still exactly where you left it, and it stays yours.',
    'Whenever you would like to keep going, the door is open. Nothing has to happen today.',
  ],
  primaryCta: 'Continue with Rooted Reset',
  /** Shown under the button. The support address is the one already used on the membership screen. */
  supportLead: 'Questions about your membership?',
  supportEmail: 'support@mefwellness.com',
  /** Shown only when no pricing link has been configured yet, so nobody is left tapping a button that goes nowhere. */
  unconfiguredNote:
    'The membership page is not linked here yet. Email us and we will send you the options.',
  signedInAs: 'Signed in as',
  /** The one honest reassurance a locked member most needs, stated plainly rather than implied. */
  dataNote: 'Your account is still here, and so is everything in it.',
} as const;

/**
 * The heading for one member, named from the trial she was actually given.
 *
 * `trialLengthDays` comes from `trialLengthDaysOf()` in
 * lib/membership/access.ts, which measures her own stored window. Null,
 * zero or a negative means we could not read it, and she gets the heading
 * that names no number rather than a guess.
 */
export function trialEndedHeading(trialLengthDays: number | null): string {
  if (trialLengthDays === null || trialLengthDays < 1) return TRIAL_ENDED_COPY.heading;
  if (trialLengthDays === 1) return 'Your first day is complete';
  return `Your ${trialLengthDays} days are complete`;
}
