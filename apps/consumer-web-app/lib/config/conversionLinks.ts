/**
 * EVERY OUTBOUND CONVERSION LINK IN THIS APP, IN ONE PLACE.
 *
 * There are exactly two places this product sends somebody who wants more
 * than the app itself: a conversation with Osei, and the page where a
 * membership is bought. Before this file they were read in two unrelated
 * modules with two unrelated fallback behaviours, which is how the lock
 * screen ended up rendering a button whose address was a hard coded
 * placeholder token rather than a page. One source of truth per thing,
 * applied to a URL.
 *
 * SERVER ONLY. Neither variable carries a NEXT_PUBLIC_ prefix, so neither
 * reaches a browser bundle. Every caller is a server component or a server
 * side compose step that hands the resolved value down as a prop.
 *
 * THE TWO LINKS BEHAVE DIFFERENTLY ON PURPOSE.
 *
 *   The discovery call ALWAYS RESOLVES. LEAD_DISCOVERY_CALL_URL has been
 *   set in Vercel since the Lead Capture Agent shipped, and the shipped
 *   fallback below is the same booking address that agent has always used.
 *   Its value is not changed by this file: it is only read from one place
 *   now instead of two.
 *
 *   The membership page MAY GENUINELY NOT EXIST YET, and when it does not,
 *   the honest thing is to show no door rather than a door that goes
 *   nowhere. `membershipPricingUrl()` returns null when nothing is
 *   configured, and every caller renders nothing in that case. There is no
 *   placeholder href anywhere in this codebase any more: a member never
 *   taps something that does not move, and never reads a made up address.
 *   Setting MEMBERSHIP_PRICING_URL in Vercel makes the door appear with no
 *   code change and no deploy of this file.
 *
 * WHY null AND NOT A SENTINEL STRING. A sentinel is a value every caller
 * has to remember to compare against, and the one that forgot is exactly
 * the bug this file was written after. `string | null` makes the compiler
 * ask the question at every call site.
 */

export const DISCOVERY_CALL_URL_ENV = 'LEAD_DISCOVERY_CALL_URL';
export const MEMBERSHIP_PRICING_URL_ENV = 'MEMBERSHIP_PRICING_URL';

/**
 * The booking address the Lead Capture Agent has always shipped with.
 *
 * Kept exactly as it was when it lived in lib/lead-capture/env.ts. Task B of
 * this build moved WHERE the value is read, deliberately without changing
 * WHAT it is, so nothing about the live widget's behaviour changed on the
 * day the config module landed.
 */
export const DISCOVERY_CALL_URL_FALLBACK = 'https://calendly.com/mefwellness/discovery-assessment';

/** A configured value, trimmed, or null for unset, empty or whitespace. */
function configured(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Where "Talk with Osei" goes. Always a real address.
 *
 * Read by the Lead Capture Agent's routing and by the trial arc's day 7
 * close. Both of them are inviting somebody into the same conversation, so
 * both of them point at the same booking page by construction rather than
 * by two people happening to configure the same URL twice.
 */
export function discoveryCallUrl(): string {
  return configured(DISCOVERY_CALL_URL_ENV) ?? DISCOVERY_CALL_URL_FALLBACK;
}

/**
 * Where "Continue with Rooted Reset" goes, or null when there is no such
 * page configured.
 *
 * NULL IS A REAL ANSWER AND EVERY CALLER HONORS IT. The post-trial lock
 * screen renders no button and leans on the support address it already
 * shows. The day 7 close renders no membership door and stands on the
 * conversation door alone. Neither of them prints a placeholder, and
 * neither of them renders a link that does not go anywhere.
 */
export function membershipPricingUrl(): string | null {
  return configured(MEMBERSHIP_PRICING_URL_ENV);
}

/** Both links as one object, for a caller that hands them to a pure renderer. */
export interface ConversionLinks {
  discoveryCallUrl: string;
  membershipPricingUrl: string | null;
}

export function conversionLinks(): ConversionLinks {
  return { discoveryCallUrl: discoveryCallUrl(), membershipPricingUrl: membershipPricingUrl() };
}
