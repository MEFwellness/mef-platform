import type { Metadata } from 'next';
import { StartPageClient } from './StartPageClient';

/**
 * Public prospect landing page on our own domain — the on-domain
 * counterpart to the external Leadpages embed (public/lead-widget.js +
 * app/lead-widget-test/page.tsx). Same agent, same endpoint
 * (app/api/lead-capture/route.ts), same widget script; this page is just a
 * native host for it instead of a plain marketing page bolted on from
 * outside. Standalone — no member chrome, not linked from BottomNav or any
 * member screen. Exempted from the auth redirect in middleware.ts the same
 * way /lead-widget-test already is.
 */
export const metadata: Metadata = {
  title: 'Start the Conversation | MEF Wellness',
  description:
    'Tell us what has been going on — fatigue, pain, sleep, stress, or weight — and get a real, connected answer in about two minutes.',
  robots: { index: true, follow: true },
};

export default function StartPage() {
  return <StartPageClient />;
}
