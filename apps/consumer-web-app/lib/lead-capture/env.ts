/**
 * Env var access for the Lead Capture Agent — kept in one file, same
 * "read at point of need, throw/guard with a clear message" convention as
 * lib/supabase/env.ts, rather than a central validated schema (this repo
 * has none). See apps/consumer-web-app/.env.local.example for the full
 * list with explanations.
 */

import { discoveryCallUrl } from '../config/conversionLinks';

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

/**
 * High-intent (pain + expressed readiness) destination: the booking page for
 * a real conversation.
 *
 * READ FROM THE SHARED CONFIG, NOT FROM process.env HERE. The trial arc's
 * day 7 close invites somebody into the same conversation this agent routes
 * a hot lead to, and two modules reading the same variable independently is
 * two places a future change can disagree. lib/config/conversionLinks.ts is
 * the one source of truth for every outbound conversion link in this app.
 * The URL itself did not change when it moved: the same environment
 * variable, the same shipped fallback.
 */
export function getDiscoveryCallUrl(): string {
  return discoveryCallUrl();
}

/** Softer-lead destination — the quiz or free guide, filled in later by the user. */
export function getQuizGuideUrl(): string {
  return process.env.LEAD_QUIZ_GUIDE_URL ?? 'https://mefwellness.com/quiz';
}
