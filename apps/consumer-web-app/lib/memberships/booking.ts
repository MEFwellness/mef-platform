/**
 * WHERE EVERY CALL TO ACTION ON /memberships GOES, DECIDED IN ONE PLACE.
 *
 * The public membership page has three calls to action and they are all the
 * same invitation: book the $175 Initial Assessment & Training Session.
 * They resolve here so that connecting the real booking address is one
 * environment variable and no code change, and so no button on that page
 * can ever point somewhere the others do not.
 *
 * THIS IS NOT lib/config/conversionLinks.ts AND MUST NOT BECOME IT. That
 * module owns the two links belonging to the Rooted Reset APP: the
 * discovery call, and the pricing page the post-trial lock screen shows a
 * member whose app subscription has ended. That link's environment
 * variable is named in that module and nowhere else, which
 * tests/trial-arc-close-guard.test.ts enforces, so this file does not
 * spell it out either. This one owns the
 * in-person MEF Wellness training funnel, which is a different offer sold
 * to a different person. Pointing either at the other's address would put
 * an app subscription page in front of a prospective training client, or a
 * training assessment in front of a member trying to keep her app.
 *
 * PUBLIC ON PURPOSE. NEXT_PUBLIC_ so the value is available to any renderer
 * of this marketing page without a server round trip, and because there is
 * nothing secret about a booking address a prospect is about to open.
 * `process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL` is read as a literal
 * member expression rather than through a dynamic lookup, because Next.js
 * inlines NEXT_PUBLIC_ variables by textual substitution at build time and
 * `process.env[name]` would not be substituted at all.
 *
 * IT ALWAYS RESOLVES TO SOMETHING HONEST, which is the opposite decision
 * from that module's own pricing link and deliberately so. That one
 * returns null
 * and its callers render no button, because a member reading a lock screen
 * must never tap a door that does not open. Here the button IS the page:
 * a membership page whose only action is missing is not a page worth
 * shipping. So when nothing is configured the button opens a mail draft to
 * the address a prospect would have written to anyway. It makes no promise
 * about a calendar and books nothing, which is exactly what is true today.
 *
 * NO CHECKOUT LIVES HERE. This module returns an address. It takes no
 * payment, holds no slot and creates no row.
 */

export const ASSESSMENT_BOOKING_URL_ENV = 'NEXT_PUBLIC_ASSESSMENT_BOOKING_URL';

/**
 * What the button does until a real booking address is configured: opens a
 * mail draft to the address MEF Wellness already publishes, with the
 * subject already written.
 */
export const ASSESSMENT_BOOKING_FALLBACK =
  'mailto:info@mefwellness.com?subject=Assessment%20Booking';

/** The label every primary call to action on this page carries. */
export const ASSESSMENT_CTA_LABEL = 'Start With Your Assessment';

/**
 * The one address every call to action on /memberships points at.
 *
 * Trimmed, and empty or whitespace counts as unset: an environment variable
 * that exists but holds nothing is a misconfiguration, not a destination.
 */
export function assessmentBookingUrl(): string {
  const raw = process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL;
  if (typeof raw !== 'string') return ASSESSMENT_BOOKING_FALLBACK;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : ASSESSMENT_BOOKING_FALLBACK;
}

/** Whether the button currently opens a real booking page rather than the mail fallback. */
export function hasConfiguredBookingUrl(): boolean {
  return assessmentBookingUrl() !== ASSESSMENT_BOOKING_FALLBACK;
}
