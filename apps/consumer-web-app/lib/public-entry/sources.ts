/**
 * Reading a source code off an inbound link, and normalising it.
 *
 * WHY A CODE AND NOT A CHANNEL. The first hundred people will come from a
 * handful of individual referral partners, some past clients, a personal
 * network and a few social posts. "Social" is not an answer to the question
 * that matters, which is which specific person or partner sends people who
 * actually finish. So every link carries a code identifying ONE source, and
 * public_entry_sources (migration 197) is where a code becomes a human
 * label.
 *
 * TWO LINK SHAPES, ONE MEANING. A path segment reads better on a card and
 * over the phone, a query parameter is what an ad platform or a link
 * shortener will append. Both are accepted and both resolve to the same
 * code:
 *
 *     https://app.mefwellness.com/energy/dr-okafor
 *     https://app.mefwellness.com/energy?ref=dr-okafor
 *
 * A code that is not registered is still recorded, verbatim, in
 * public_entry_sessions.source_raw. It resolves to no source row, which is
 * what makes a mistyped or invented code show up in the funnel as
 * "Unregistered code" and be investigable, rather than being silently
 * folded into direct traffic.
 */

/** The shape a code must have to be storable. Same rule as the database's own check constraint on public_entry_sources.code. */
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Query parameters we accept a code in, in priority order. `ref` is ours; the utm ones exist because a partner will paste them without asking. */
export const SOURCE_QUERY_KEYS = ['ref', 'utm_source', 'source'] as const;

/**
 * Lowercases, trims and strips anything that is not allowed, then checks
 * the result against the same pattern the database enforces. Returns null
 * for anything that cannot be a code at all, so a junk value never becomes
 * a fake source row.
 */
export function normalizeSourceCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  if (!cleaned) return null;
  return CODE_PATTERN.test(cleaned) ? cleaned : null;
}

/**
 * The code this arrival carried, from the path segment first and the query
 * parameters second. A path segment is the deliberate, printed form and a
 * query parameter is what survives being pasted around, so when both are
 * present the printed one wins.
 */
export function resolveSourceCode(input: {
  pathSegment?: string | null;
  query?: Record<string, string | string[] | undefined>;
}): string | null {
  const fromPath = normalizeSourceCode(input.pathSegment ?? null);
  if (fromPath) return fromPath;

  const query = input.query ?? {};
  for (const key of SOURCE_QUERY_KEYS) {
    const value = query[key];
    const single = Array.isArray(value) ? value[0] : value;
    const code = normalizeSourceCode(single ?? null);
    if (code) return code;
  }
  return null;
}

/**
 * The host of the referring page, and never the page itself. The host
 * answers "which platform sent them" without recording what somebody was
 * reading immediately before they arrived, which is not ours to keep.
 * Our own host is dropped: an internal navigation is not a referral.
 */
export function referrerHostOf(referrer: string | null | undefined, selfHost?: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).host.toLowerCase();
    if (!host) return null;
    if (selfHost && host === selfHost.toLowerCase()) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** The link to hand a partner, built from the code alone so every one of them is built the same way. */
export function partnerLinkFor(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/energy/${code}`;
}
