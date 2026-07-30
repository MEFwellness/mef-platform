/**
 * Env var access for the Lead Capture Agent — kept in one file, same
 * "read at point of need, throw/guard with a clear message" convention as
 * lib/supabase/env.ts, rather than a central validated schema (this repo
 * has none). See apps/consumer-web-app/.env.local.example for the full
 * list with explanations.
 */

/**
 * Comma-separated list of exact origins (scheme + host [+ port]) allowed
 * to call POST /api/lead-capture from the browser — the Leadpages domain(s)
 * this widget will actually be embedded on. Deliberately not wide open
 * (`*`): this is a public, unauthenticated, write-capable endpoint, so an
 * unrestricted allowlist would let any site on the internet embed the
 * widget and spend this app's Anthropic/Supabase quota.
 */
export function getLeadWidgetAllowedOrigins(): string[] {
  return (process.env.LEAD_WIDGET_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** High-intent (pain + expressed readiness) destination — a Calendly link, filled in later by the user. */
export function getDiscoveryCallUrl(): string {
  return process.env.LEAD_DISCOVERY_CALL_URL ?? 'https://calendly.com/mefwellness/discovery-assessment';
}

/** Softer-lead destination — the quiz or free guide, filled in later by the user. */
export function getQuizGuideUrl(): string {
  return process.env.LEAD_QUIZ_GUIDE_URL ?? 'https://mefwellness.com/quiz';
}
