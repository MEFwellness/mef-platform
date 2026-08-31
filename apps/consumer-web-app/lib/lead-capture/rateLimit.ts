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

/**
 * The public entry experience's own budget, and why it is not the chat
 * widget's (found by driving two complete journeys back to back on 2026-08-31,
 * where the second one was refused part way through the nine questions).
 *
 * One honest visitor answering nine questions makes about fourteen calls:
 * the arrival, the start, a save per question, the completion, and the
 * optional email step. Twenty was never a budget for that, and the failure
 * is invisible and total: her answers stop saving and her result never
 * builds. Worse, a rate limit is per IP, so a family, an office or anywhere
 * behind one NAT would have shared a budget that barely covers one person.
 *
 * Sixty in five minutes is roughly four complete journeys from one address,
 * which is what a small waiting room or a household actually looks like,
 * while still being far below what a script hammering the endpoint would
 * want. The two buckets are separate maps, so neither feature can spend the
 * other's budget.
 */
const PUBLIC_ENTRY_MAX_REQUESTS_PER_WINDOW = 60;

const hits = new Map<string, number[]>();
const publicEntryHits = new Map<string, number[]>();

function allow(store: Map<string, number[]>, ip: string, max: number, now: number): boolean {
  const timestamps = (store.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= max) {
    store.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return true;
}

/** Returns true if the request should be allowed, false if the IP is over the limit for this window. Also opportunistically prunes old entries so the map never grows unbounded. */
export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  return allow(hits, ip, MAX_REQUESTS_PER_WINDOW, now);
}

/** The same sliding window, its own budget and its own map. See PUBLIC_ENTRY_MAX_REQUESTS_PER_WINDOW. */
export function checkPublicEntryRateLimit(ip: string, now: number = Date.now()): boolean {
  return allow(publicEntryHits, ip, PUBLIC_ENTRY_MAX_REQUESTS_PER_WINDOW, now);
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
  publicEntryHits.clear();
}
