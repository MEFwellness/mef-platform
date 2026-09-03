/**
 * Reading the full attribution set off an inbound link.
 *
 * WHAT COUNTS AS ATTRIBUTION HERE. The five standard utm parameters, our
 * own per-partner source code (which migration 197 already read from
 * `/energy/dr-okafor`, `?ref=`, `?utm_source=` and `?source=`, and which is
 * left exactly as it was), and the three ad click ids a platform appends to
 * a link it sent: `fbclid`, `ttclid`, `gclid`. Nothing else is read off a
 * URL, and there is no field on the shape below that a health answer, a
 * result or an email could be written into.
 *
 * WHY THE CLICK IDS ARE KEPT AT ALL. They are the only thing that can be
 * handed back to the platform that issued them to ask whether a click
 * became anything. They are opaque to us, they are never decoded, and they
 * are never shown to anybody.
 *
 * FIRST TOUCH WINS. `attributionsDiffer` exists so a later arrival on the
 * same visitor token can be recorded as a LAST touch without ever
 * disturbing the first, which is written once and refused an update by the
 * database itself.
 */

import type { AcquisitionAttribution, AcquisitionGeo } from '@mef/shared-types-contracts';
import { normalizeClickId, normalizeSourceCodeValue, normalizeTag } from './normalize';

export const EMPTY_GEO: AcquisitionGeo = { country: null, region: null, city: null };

export const EMPTY_ATTRIBUTION: AcquisitionAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  sourceCode: null,
  sourceRaw: null,
  fbclid: null,
  ttclid: null,
  gclid: null,
  landingPath: null,
  referrerHost: null,
  geo: EMPTY_GEO,
};

export type QueryLike = Record<string, string | string[] | undefined>;

/** A query value arrives as a string, an array (a parameter repeated) or nothing. The first one wins, which is what every server does with a repeated parameter. */
function first(query: QueryLike, key: string): string | null {
  const value = query[key];
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' ? single : null;
}

/**
 * The campaign half of an inbound link, normalised.
 *
 * `utm_source` takes the SOURCE CODE shape (hyphens) rather than the tag
 * shape (underscores), because it is the source code. If the two
 * normalised differently, `/energy/dr-okafor` and `?utm_source=dr-okafor`
 * would be two partners.
 */
export function readCampaignParams(query: QueryLike): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
} {
  return {
    utmSource: normalizeSourceCodeValue(first(query, 'utm_source')),
    utmMedium: normalizeTag(first(query, 'utm_medium')),
    utmCampaign: normalizeTag(first(query, 'utm_campaign')),
    utmContent: normalizeTag(first(query, 'utm_content')),
    utmTerm: normalizeTag(first(query, 'utm_term')),
  };
}

/** The three ad click ids, kept verbatim. A link carrying none, which is almost all of them, produces three nulls. */
export function readClickIds(query: QueryLike): {
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
} {
  return {
    fbclid: normalizeClickId(first(query, 'fbclid')),
    ttclid: normalizeClickId(first(query, 'ttclid')),
    gclid: normalizeClickId(first(query, 'gclid')),
  };
}

/**
 * Everything an arrival's URL said, in one shape.
 *
 * `sourceCode` is passed in rather than re-derived, because the path
 * segment beats every query parameter and only the page knows what the
 * path segment was. `lib/public-entry/sources.ts` stays the one place that
 * decision is made.
 */
export function readAttributionFromQuery(input: {
  query: QueryLike;
  sourceCode: string | null;
  landingPath: string | null;
}): AcquisitionAttribution {
  const campaign = readCampaignParams(input.query);
  const clicks = readClickIds(input.query);
  return {
    ...campaign,
    ...clicks,
    sourceCode: input.sourceCode,
    sourceRaw: input.sourceCode,
    landingPath: input.landingPath ? input.landingPath.slice(0, 200) : null,
    referrerHost: null,
    geo: EMPTY_GEO,
  };
}

/**
 * The keys that make an arrival TRACKED. Landing path, referrer and geo are
 * deliberately not among them: every arrival has those, including somebody
 * who typed the address in, and counting them as attribution would make
 * "untracked" a category with no members.
 */
const TRACKING_KEYS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'sourceCode',
  'fbclid',
  'ttclid',
  'gclid',
] as const satisfies readonly (keyof AcquisitionAttribution)[];

/** True when a link carried nothing that identifies where it came from. An untracked arrival is a real and ordinary thing, and it is still recorded. */
export function isUntracked(attribution: AcquisitionAttribution): boolean {
  return TRACKING_KEYS.every((key) => attribution[key] === null);
}

/**
 * Whether a later arrival carried something genuinely different from the
 * first. Only the tracking keys are compared: coming back from a different
 * referring page, or from the next town, is not a second campaign and must
 * not manufacture a last-touch row.
 */
export function attributionsDiffer(
  a: AcquisitionAttribution,
  b: AcquisitionAttribution
): boolean {
  return TRACKING_KEYS.some((key) => a[key] !== b[key]);
}
