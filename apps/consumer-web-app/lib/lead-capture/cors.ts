/**
 * CORS handling for the Lead Capture Agent's public API route — the first
 * genuinely cross-origin-callable endpoint in this app (see the research
 * this feature was built against: no CORS helper existed anywhere else in
 * the codebase). Locked to an explicit allowlist
 * (LEAD_WIDGET_ALLOWED_ORIGINS) rather than `Access-Control-Allow-Origin: *`,
 * since this is a public, unauthenticated, write-capable endpoint.
 */

import { getLeadWidgetAllowedOrigins } from './env';

/**
 * `selfOrigin` (the app's own deployment origin, derived from the
 * incoming request's own URL) is always allowed in addition to the
 * configured allowlist — a same-origin request (e.g. the
 * /lead-widget-test test harness page, or the app calling its own API)
 * never needs an env var entry to work, and a same-origin fetch's Origin
 * header (when browsers send one at all) would otherwise be rejected by
 * an allowlist meant only to gate genuine third-party domains.
 */
export function isOriginAllowed(origin: string | null, selfOrigin?: string): boolean {
  if (!origin) return false;
  if (selfOrigin && origin === selfOrigin) return true;
  return getLeadWidgetAllowedOrigins().includes(origin);
}

/**
 * Returns the CORS headers to attach to a response. Only includes
 * Access-Control-Allow-Origin when the request's Origin is on the
 * allowlist (or is the app's own origin) — an empty object for a
 * disallowed/missing origin means the browser will block the caller from
 * reading the response, even though this server still returns 403
 * explicitly too (defense in depth, not reliance on the browser alone).
 */
export function corsHeaders(origin: string | null, selfOrigin?: string): Record<string, string> {
  if (!isOriginAllowed(origin, selfOrigin)) return {};
  return {
    'Access-Control-Allow-Origin': origin as string,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * The app's own public-facing origin, derived from the request's Host
 * header (with x-forwarded-* overrides, as Vercel's proxy sets them)
 * rather than `new URL(request.url).origin` — that reflects the literal
 * socket the Node/Next server is bound to (e.g. `0.0.0.0:3000` in dev,
 * since this repo's dev script is `next dev -H 0.0.0.0`), which never
 * matches the `Origin` header a real browser sends for the domain it
 * actually navigated to. Using Host (what the browser/proxy says it
 * connected to) instead is what correctly makes a same-origin request —
 * e.g. from /lead-widget-test — recognized as self, in both dev and prod.
 */
export function getSelfOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}
