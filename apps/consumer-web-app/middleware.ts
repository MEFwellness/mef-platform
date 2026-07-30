import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { hasActiveRole } from '@/lib/auth/guards';

// /api/cron/* routes authenticate their own way (a CRON_SECRET bearer
// token checked inside each route handler — see
// app/api/cron/wearable-daily/route.ts and
// app/api/cron/daily-coaching-scan/route.ts), not a session cookie.
// Vercel's own scheduled invocations never carry a session cookie, so
// without this exclusion every cron request was being 307-redirected to
// /login by the check below before it ever reached the route handler's
// own auth check — silently preventing every cron job in this app from
// running on schedule. Scoped to exactly this one path prefix, not all of
// /api/, so no other route's behavior changes.
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/verify',
  '/reset-password',
  '/api/auth/callback',
  '/api/cron/',
  // Pre-signup Quick Wellness Check — reached from marketing/campaign
  // links, not the default login route. Its own page component
  // (app/wellness-check/page.tsx) redirects an already-signed-in visitor
  // straight into the app, so this exemption only ever matters for a
  // genuine guest.
  '/wellness-check',
  // Onboarding assessment — publicly reachable so a guest can take it
  // before creating an account; app/onboarding/page.tsx itself branches
  // on whether a session exists (guest vs. member flow). The other
  // /onboarding check below only ever fires `if (user && ...)`, so it's
  // unaffected by this exemption.
  '/onboarding',
  // Lead Capture Agent (app/api/lead-capture/route.ts) — a public,
  // unauthenticated, cross-origin-callable API for the embeddable widget
  // (public/lead-widget.js) used on external Leadpages landing pages.
  // Anonymous prospects have no session cookie at all, and a
  // cross-origin fetch wouldn't carry one even if they did; without this
  // exemption every request was being 307-redirected to /login before
  // ever reaching the route's own CORS/rate-limit handling. The route's
  // own auth boundary is its origin allowlist + rate limit, not a
  // session — see lib/lead-capture/cors.ts. /lead-widget-test is the
  // same-origin manual test harness page for this widget (not linked
  // from anywhere in the member-facing app).
  '/api/lead-capture',
  '/lead-widget-test',
];

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic && path !== '/') {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectedFrom', path);
    return NextResponse.redirect(redirectUrl);
  }

  // Role-gated routes — redirect-only (UX). RLS is what actually protects
  // the data these pages read/write; see lib/auth/guards.ts. A signed-in
  // user who lacks the role sent here goes to their own dashboard, not the
  // unstyled internal "/" dev-build page — a member clicking the (now
  // role-hidden, see BottomNav) Coach link or hitting /coach directly
  // should land back in their normal member experience, not a dead end.
  // supabase is only ever null when updateSession's try/catch caught a
  // Supabase misconfiguration — in that same failure path user is always
  // null too (see lib/supabase/middleware.ts), so every branch below that
  // dereferences supabase is already unreachable when it's null. The
  // assertion just tells TypeScript what's already true by construction.
  if (user && path.startsWith('/admin')) {
    const isAdmin = await hasActiveRole(supabase!, user.id, 'platform_administrator');
    if (!isAdmin) return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (user && path.startsWith('/coach')) {
    const isCoach = await hasActiveRole(supabase!, user.id, 'coach');
    if (!isCoach) return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Coaches never go through the member consent/onboarding assessment —
  // app/page.tsx already keeps them from ever landing here post-login, but
  // a coach manually navigating to /onboarding (bookmark, typed URL) should
  // bounce straight to their own dashboard rather than see the member flow.
  if (user && path.startsWith('/onboarding')) {
    const isCoach = await hasActiveRole(supabase!, user.id, 'coach');
    if (isCoach) return NextResponse.redirect(new URL('/coach', request.url));
  }

  // Reserved for the future welcome flow (app/welcome/page.tsx), not yet
  // linked from anywhere, but protected the same way /onboarding is: a
  // coach or admin who manually navigates here bounces to their own
  // dashboard rather than seeing a member-only route. The page itself
  // handles the eligibility check (not a role, so it belongs there).
  if (user && path.startsWith('/welcome')) {
    const isCoach = await hasActiveRole(supabase!, user.id, 'coach');
    if (isCoach) return NextResponse.redirect(new URL('/coach', request.url));

    const isAdmin = await hasActiveRole(supabase!, user.id, 'platform_administrator');
    if (isAdmin) return NextResponse.redirect(new URL('/admin', request.url));
  }

  return response;
}

export const config = {
  // Excludes framework internals, the PWA manifest, and public/ static
  // assets (icons, images, and common file extensions) — none of these
  // should ever require a session, and previously didn't have one: an
  // unauthenticated request for any of them (e.g. the logo on /login, or
  // a browser's manifest fetch for install-eligibility) was being
  // redirected to /login instead of served, silently breaking both.
  // lead-widget.js is the Lead Capture Agent's embeddable widget script
  // (public/lead-widget.js) — a <script src> load from an external
  // Leadpages page is always unauthenticated, so it needs the same
  // exclusion as every other public/ static asset here.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|lead-widget\\.js|icons/|images/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
