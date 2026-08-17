/**
 * The single read of the Cloudflare Turnstile site key, and the single
 * definition of "is bot protection turned on for this deployment".
 *
 * One environment variable is the whole switch. When
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, every auth form in this app
 * renders exactly what it rendered before this existed, sends exactly the
 * fields it sent before, and every Server Action calls Supabase with
 * exactly the arguments it called before. Nothing about the signed-out
 * experience changes until the key is present.
 *
 * The site key is public by design (it is embedded in the page HTML that
 * every visitor downloads) — that is why it carries the NEXT_PUBLIC_
 * prefix. The matching SECRET key is never read here, never referenced
 * anywhere in this repository, and is never set in Vercel: it is pasted
 * directly into the Supabase dashboard, and Supabase's own auth server is
 * the only thing that ever holds it. That separation is deliberate. This
 * app hands Supabase a token; Supabase, not this app, decides whether the
 * token is genuine.
 *
 * The literal `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` expression
 * below matters: Next.js substitutes NEXT_PUBLIC_ variables into client
 * bundles by textual replacement at build time, so it has to appear
 * spelled out rather than read through a computed key.
 */

/** The public site key, or null when bot protection is not configured. */
export function getTurnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True only when a site key is configured. Every widget and every token
 * read is gated on this, so "dormant" is one condition rather than a habit
 * each call site has to remember.
 */
export function isTurnstileConfigured(): boolean {
  return getTurnstileSiteKey() !== null;
}

/**
 * What a member is told when the check could not be completed. Deliberately
 * says nothing about Cloudflare, tokens, captchas or bots: it names the
 * outcome ("we could not confirm that") and the remedy ("try again"), which
 * is all a real person can act on. Never replaced by a raw error string.
 */
export const TURNSTILE_UNVERIFIED_MESSAGE =
  'We could not confirm that in time. Please try again.';
