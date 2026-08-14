/**
 * The trial-ended screen's words, in one place so a test can hold them.
 *
 * VOICE. Root does not sell and does not scold. A member reaching this
 * screen has just spent a month with us and has done nothing wrong, so
 * nothing here counts down, warns, or implies loss. It says the thirty days
 * are complete, says their work is still theirs, and leaves the next move
 * to them.
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
  heading: 'Your 30 days are complete',
  body: [
    'Thank you for spending the last month here. Everything you noticed, logged and worked on is still exactly where you left it, and it stays yours.',
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
