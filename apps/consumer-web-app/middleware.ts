import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { hasActiveRole } from '@/lib/auth/guards';
import { decideEntryAnimationPlay } from '@/lib/entry-animation/rule';
import {
  ENTRY_ANIMATION_LAST_ACTIVE_COOKIE,
  ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S,
  ENTRY_ANIMATION_LOGIN_COOKIE,
  ENTRY_ANIMATION_PLAY_COOKIE,
  ENTRY_ANIMATION_PLAY_MAX_AGE_S,
} from '@/lib/entry-animation/cookies';

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
  // Public prospect landing page — same widget/endpoint as above, native
  // to our own domain instead of embedded on external Leadpages. Anonymous
  // visitors must always reach it, logged-in visitors are simply shown the
  // same standalone page (no redirect either way).
  '/start',
];

export async function middleware(request: NextRequest) {
  const sessionResult = await updateSession(request);
  const { user, supabase } = sessionResult;
  let response = sessionResult.response;
  const path = request.nextUrl.pathname;

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic && path !== '/') {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectedFrom', path);
    return NextResponse.redirect(redirectUrl);
  }

  // Branded "Reset" entry animation — the session-entry rule itself lives
  // in lib/entry-animation/rule.ts (pure, unit-tested); this just supplies
  // the two cookies it reads. mef_entry_last_active is refreshed to "now"
  // on every request a signed-in member makes (any request at all, not
  // just navigations — a real gap here only ever means "no requests were
  // made," i.e. the app was closed or backgrounded), which is what lets a
  // single middleware pass double as both "was this just a login" and
  // "was this a meaningful reopen" without any client-side storage. See
  // that file's own header comment for the full rule and the browser vs.
  // installed/PWA note.
  //
  // Sticky-once-decided: a genuine reopen that happens to land on the bare
  // '/' (rather than a specific deep link) can still trigger *multiple*
  // middleware passes for what a member experiences as one single
  // navigation — app/page.tsx (a pure routing hub, never rendered UI)
  // issues its own further redirect() to /dashboard (or /onboarding,
  // /welcome...), a brand-new request. (signIn() itself no longer does
  // this — lib/auth/postLoginRoute.ts's own header comment explains why
  // it now resolves and redirects to the real destination in one hop —
  // but the bare-'/' path remains for email-verify callbacks, password
  // resets, and anyone with '/' bookmarked.) Without this, the *second*
  // hop would see mef_entry_last_active already refreshed to "now" by the
  // *first* hop moments earlier (near-zero gap) and overwrite
  // mef_entry_play back to '0' before app/layout.tsx ever reads it on the
  // hop that actually renders. So: once a hop sets mef_entry_play=1, later
  // hops just carry that '1' forward untouched (and skip refreshing
  // mef_entry_last_active, so they can't erase the very gap that justified
  // the '1') until the client actually consumes it —
  // RootResetEntryGate.tsx calls consumeEntryAnimationTriggers() on mount
  // whenever it plays, which is what actually clears both cookies so the
  // *next* real navigation doesn't replay.
  if (user) {
    const now = Date.now();
    const alreadySticky = request.cookies.get(ENTRY_ANIMATION_PLAY_COOKIE)?.value === '1';

    let playValue: '1' | '0';
    let refreshLastActive = false;

    if (alreadySticky) {
      playValue = '1';
    } else {
      const justLoggedIn = request.cookies.get(ENTRY_ANIMATION_LOGIN_COOKIE)?.value === '1';
      const lastActiveRaw = request.cookies.get(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE)?.value;
      const lastActiveAtMs = lastActiveRaw && /^\d+$/.test(lastActiveRaw) ? Number(lastActiveRaw) : null;

      const shouldPlay = decideEntryAnimationPlay({
        hasUser: true,
        path,
        isPublicPath: isPublic,
        justLoggedIn,
        lastActiveAtMs,
        nowMs: now,
      });

      playValue = shouldPlay ? '1' : '0';
      refreshLastActive = true;
    }

    // Setting cookies on `response` alone only reaches the *browser's next*
    // request — app/layout.tsx's cookies().get() for THIS same request
    // still sees the original incoming request cookies, unchanged. Mutating
    // request.cookies and rebuilding response from request.headers (exactly
    // lib/supabase/middleware.ts's own technique, immediately above in this
    // same call chain, for the identical problem with Supabase's session
    // cookie) is what makes the value visible to this request's own render.
    // response.cookies.getAll() + re-applying them onto the rebuilt response
    // preserves any cookies updateSession() itself already set (a refreshed
    // Supabase session token) — rebuilding via NextResponse.next() otherwise
    // starts a brand-new response with no Set-Cookie headers of its own.
    request.cookies.set(ENTRY_ANIMATION_PLAY_COOKIE, playValue);
    if (refreshLastActive) {
      request.cookies.set(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE, String(now));
    }

    const preservedCookies = response.cookies.getAll();
    response = NextResponse.next({ request: { headers: request.headers } });
    for (const cookie of preservedCookies) {
      response.cookies.set(cookie);
    }

    // Deliberately does NOT re-send Set-Cookie for mef_entry_play while
    // already sticky (alreadySticky === true): the browser already has
    // '1', a fresh identical Set-Cookie would only refresh its Max-Age for
    // no benefit, and doing so raced against — and reliably beat —
    // RootResetEntryGate.tsx's own consumeEntryAnimationTriggers() clear
    // call on whichever request happened to land last, so the sticky
    // cookie was effectively never clearable. Only the transition to a
    // real decided value (the else branch above) needs to reach the
    // browser; every later hop of the same redirect chain just needs the
    // request-side mutation above for its own render.
    if (!alreadySticky) {
      response.cookies.set(ENTRY_ANIMATION_PLAY_COOKIE, playValue, {
        path: '/',
        maxAge: ENTRY_ANIMATION_PLAY_MAX_AGE_S,
        httpOnly: true,
        sameSite: 'lax',
      });
    }
    if (refreshLastActive) {
      response.cookies.set(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE, String(now), {
        path: '/',
        maxAge: ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S,
        httpOnly: true,
        sameSite: 'lax',
      });
    }
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
