/**
 * Where "Continue with Rooted Reset" goes.
 *
 * THERE IS NO PRICING PAGE URL IN THIS CODEBASE. Searched for at build
 * time: no Leadpages pricing link, no Stripe payment link, no marketing
 * config, no environment variable in the repo or in the deployed Vercel
 * project. The only external marketing URLs that exist anywhere here are
 * the Lead Capture Agent's two (LEAD_DISCOVERY_CALL_URL, a Calendly link,
 * and LEAD_QUIZ_GUIDE_URL, the quiz), and neither of them is a place to
 * buy a membership.
 *
 * So the link is an environment variable with a visible placeholder as its
 * fallback, on the same "read at point of need" pattern as
 * lib/lead-capture/env.ts. Setting MEMBERSHIP_PRICING_URL in Vercel points
 * the button at the real Leadpages pricing page with no code change and no
 * deploy. Until it is set, the button renders as unresolved rather than
 * pretending to work, and app/trial-ended/page.tsx shows the support email
 * beneath it either way, so a member who reaches this screen always has a
 * way to continue.
 */

/** What the button href is when nothing has been configured. Deliberately conspicuous. */
export const PRICING_LINK_PLACEHOLDER = '#PRICING_LINK';

export function getPricingUrl(): string {
  const configured = process.env.MEMBERSHIP_PRICING_URL?.trim();
  return configured ? configured : PRICING_LINK_PLACEHOLDER;
}

export function isPricingUrlConfigured(): boolean {
  return getPricingUrl() !== PRICING_LINK_PLACEHOLDER;
}
