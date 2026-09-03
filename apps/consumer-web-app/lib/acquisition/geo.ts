/**
 * Coarse request geo, read from the edge headers that are already on every
 * request.
 *
 * WHY THE HEADERS AND NOT A LOOKUP SERVICE. Vercel resolves the request's
 * location at the edge and sets it as headers before anything of ours runs.
 * That is free, it happens whether we read it or not, and it means no IP
 * address is ever handled, stored or sent anywhere by this application. A
 * third party geo API would mean shipping a visitor's IP to somebody else,
 * which is a worse trade for a number that only answers "roughly where are
 * these people".
 *
 * COUNTRY, REGION, CITY, AND NOTHING FINER. Vercel also offers latitude and
 * longitude headers. They are deliberately not read, there is no column
 * they could be written into, and a test asserts this file never mentions
 * them.
 *
 * READ SERVER SIDE, FROM THE REQUEST'S OWN HEADERS. Never passed through
 * the browser. The route handler that writes the attribution reads its own
 * request, so the value cannot be forged by a caller and does not depend on
 * the page having remembered to hand it down.
 */

import type { AcquisitionGeo } from '@mef/shared-types-contracts';
import { EMPTY_GEO } from './attribution';
import { normalizeCountry, normalizePlaceName } from './normalize';

/** Anything that answers `get(name)`: a `Headers`, or Next's own `headers()` result. */
export type HeaderReader = { get(name: string): string | null };

/**
 * The three headers Vercel sets. `x-vercel-ip-city` arrives percent-encoded
 * ("Milton%20Keynes"), which `normalizePlaceName` decodes. On a local
 * machine none of them exist and every field is null, which is correct: an
 * arrival with no known place is recorded as an arrival with no known
 * place, not as one from nowhere in particular.
 */
export function readRequestGeo(headers: HeaderReader | null | undefined): AcquisitionGeo {
  if (!headers) return EMPTY_GEO;
  return {
    country: normalizeCountry(headers.get('x-vercel-ip-country')),
    region: normalizePlaceName(headers.get('x-vercel-ip-country-region'), 40),
    city: normalizePlaceName(headers.get('x-vercel-ip-city'), 80),
  };
}
