/**
 * WHERE THE ASSESSMENT CALL TO ACTION ON /memberships GOES, DECIDED IN ONE
 * PLACE.
 *
 * The public membership page invites a prospect to one thing three times:
 * the Initial Assessment & Training Session. The hero button, the button on
 * the assessment card and the button at the close are one offer, so they
 * resolve through this one function and no button on that page can ever
 * point somewhere the others do not.
 *
 * IT GOES TO STRIPE NOW. Since 2026-09-08 the address is the real Stripe
 * Checkout link in lib/memberships/content.ts, verified in a browser as a
 * one-time $175.00 charge before it shipped. The three tier cards each
 * carry their own checkout link from the same table; those are read
 * directly by the page rather than through a function here, because there
 * is nothing to decide about them: one tier, one address.
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
 * THE ENVIRONMENT VARIABLE STAYS, AS AN OVERRIDE AND NOT AS THE SOURCE.
 * Setting NEXT_PUBLIC_ASSESSMENT_BOOKING_URL in Vercel still wins, so a
 * seasonal offer, a test link or an emergency redirect is one dashboard
 * edit with no deploy. Unset, which is how production runs today, the
 * committed Stripe address is used. NEXT_PUBLIC_ because there is nothing
 * secret about a checkout address a prospect is about to open, and because
 * the value has to survive into the browser bundle; it is read as a literal
 * member expression rather than through a dynamic lookup, because Next.js
 * inlines NEXT_PUBLIC_ variables by textual substitution at build time and
 * `process.env[name]` would not be substituted at all.
 *
 * IT ALWAYS RESOLVES TO SOMETHING HONEST, which is the opposite decision
 * from that module's own pricing link and deliberately so. That one returns
 * null and its callers render no button, because a member reading a lock
 * screen must never tap a door that does not open. Here the button IS the
 * page: a membership page whose only action is missing is not a page worth
 * shipping. The mail draft below is the floor under both of the two real
 * answers, reached only if the committed address is ever blanked as well as
 * the variable being unset. It is not a step anybody walks today, and that
 * is the point of it.
 *
 * NO CHECKOUT LIVES HERE. This module returns an address. Stripe takes the
 * payment, on its own page. Nothing in this app learns that a purchase
 * happened, and buying through one of these links grants no account and no
 * Rooted Reset entitlement.
 */

import { MEMBERSHIP_CHECKOUT_URLS } from './content';

export const ASSESSMENT_BOOKING_URL_ENV = 'NEXT_PUBLIC_ASSESSMENT_BOOKING_URL';

/**
 * The last resort, if both the environment variable and the committed
 * Stripe address are somehow empty: a mail draft to the address MEF
 * Wellness already publishes, with the subject already written. A button
 * that does nothing is the one outcome this page must never have.
 */
export const ASSESSMENT_BOOKING_FALLBACK =
  'mailto:info@mefwellness.com?subject=Assessment%20Booking';

/** The label every primary call to action on this page carries. */
export const ASSESSMENT_CTA_LABEL = 'Start With Your Assessment';

/**
 * The one address all three assessment calls to action point at.
 *
 * Override first, committed Stripe address second, mail draft last.
 * Trimmed at every level, and empty or whitespace counts as unset: a
 * variable that exists but holds nothing is a misconfiguration, not a
 * destination, and falling through to a real address is better than
 * rendering a button that goes nowhere.
 */
export function assessmentBookingUrl(): string {
  const override = process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL;
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();

  const checkout = MEMBERSHIP_CHECKOUT_URLS.assessment.trim();
  return checkout.length > 0 ? checkout : ASSESSMENT_BOOKING_FALLBACK;
}

/** Whether the button opens a real destination rather than the mail draft of last resort. */
export function hasConfiguredBookingUrl(): boolean {
  return assessmentBookingUrl() !== ASSESSMENT_BOOKING_FALLBACK;
}

/**
 * Everything a link out of this page needs to be safe in a new tab.
 *
 * `target="_blank"` so a prospect reading the page keeps it while checkout
 * opens beside it, and `rel="noopener"` so the opened page cannot reach
 * back through `window.opener`. Deliberately NOT `noreferrer` as well:
 * stripping the Referer header would cost Stripe the one signal that says
 * which page the customer came from, and noopener alone closes the actual
 * hole.
 */
export const CHECKOUT_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener',
} as const;
