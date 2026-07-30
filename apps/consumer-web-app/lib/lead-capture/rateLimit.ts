/**
 * Per-IP rate limiting for the public Lead Capture API route. No Redis/
 * Upstash dependency exists anywhere in this repo (checked before writing
 * this), so this is a plain in-memory sliding window keyed by IP — a
 * deliberate, honest tradeoff: on Vercel's serverless platform each
 * function instance has its own memory, so this limits abuse *per warm
 * instance*, not globally across every instance the platform might spin
 * up. It still meaningfully blocks a single script hammering the
 * endpoint from one instance, and costs nothing to add. If traffic ever
 * justifies it, swap this module's internals for a real shared store
 * (e.g. Upstash Redis) without changing its exported function signature.
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map<string, number[]>();

/** Returns true if the request should be allowed, false if the IP is over the limit for this window. Also opportunistically prunes old entries so the map never grows unbounded. */
export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  const timestamps = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(ip, timestamps);
  return true;
}

/** Best-effort client IP from Vercel/standard proxy headers — 'unknown' groups every unidentifiable caller into one shared bucket, which is intentionally strict (fails toward more limiting, not less) rather than granting each of them their own uncapped 20-per-window. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return (forwardedFor.split(',')[0] ?? '').trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/** Test-only escape hatch so each test file starts with a clean rate-limit state. */
export function resetRateLimitForTests(): void {
  hits.clear();
}
