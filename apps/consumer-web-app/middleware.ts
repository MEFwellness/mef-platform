import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { hasActiveRole } from '@/lib/auth/guards';
import { decideEntryAnimationPlay } from '@/lib/entry-animation/rule';
import {
  ENTRY_ANIMATION_LAST_ACTIVE_COOKIE,
  ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S,
  ENTRY_ANIMATION_PLAY_COOKIE,
  ENTRY_ANIMATION_PLAY_MAX_AGE_S,
} from '@/lib/entry-animation/cookies';
import {
  PASSWORD_RECOVERY_COOKIE,
  RESET_CONFIRM_PATH,
  shouldGateToPasswordReset,
} from '@/lib/auth/recovery';

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
  // Where every password-reset email now lands. Necessarily reachable
  // without a session: the whole point is that the member cannot sign in.
  // Its own protection is the one-time GoTrue token in the link, which the
  // route verifies before it grants anything.
  '/api/auth/recovery',
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

  // Password recovery gate. A session established by a reset-email link is
  // indistinguishable from an ordinary sign-in once it exists, which is
  // exactly why members were being signed straight into the app and never
  // shown a set-new-password screen. app/api/auth/recovery/route.ts (and,
  // for the fragment-only landing, beginPasswordRecovery()) mark such a
  // session with a cookie, and this sends it to that screen and nowhere
  // else until the password has genuinely been changed.
  //
  // Placed above every other check so it beats the role gates and the entry
  // animation: mid-recovery there is exactly one place to be. It is a
  // routing rule, not an authorization boundary — RLS still decides what
  // this session may actually touch. See lib/auth/recovery.ts.
  if (
    shouldGateToPasswordReset({
      hasUser: Boolean(user),
      recoveryPending: Boolean(request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value),
      path,
    })
  ) {
    return NextResponse.redirect(new URL(RESET_CONFIRM_PATH, request.url));
  }

  // Branded "Reset" entry animation, the *reopened-after-a-gap* trigger
  // only — the session-entry rule itself lives in lib/entry-animation/
  // rule.ts (pure, unit-tested). The *login* trigger is handled entirely
  // by signIn() (app/actions/auth.ts) instead, setting mef_entry_login
  // directly to a fresh token; see that action's own comment for why:
  // confirmed directly against production that a cookie middleware sets
  // here does not reliably reach the browser on the RSC-fetch response
  // Next.js's client router uses to follow a Server Action's redirect()
  // (unlike a plain HTTP redirect, e.g. a hard reload or reopening the
  // app after being closed — both confirmed working correctly). Every
  // other real navigation *does* correctly receive a middleware-set
  // cookie, which is why this block still owns the gap-based case: a
  // reopen, by definition, is never a client-router-followed redirect —
  // there's no prior router state to continue from.
  //
  // mef_entry_play holds an opaque, random *token* (crypto.randomUUID()),
  // not a boolean — app/layout.tsx prefers mef_entry_login's own token
  // when present (the login case), falling back to this one.
  // RootResetEntryGate.tsx compares whichever it receives against the
  // last token it already consumed (sessionStorage, never sent over the
  // network) and only plays when they differ.
  //
  // Excludes its own API route and prefetches/self-revalidation fetches,
  // neither of which represent a real arrival on `path`: Next.js's own
  // internal RSC/prefetch protocol headers (`RSC`, `Next-Router-Prefetch`,
  // `Next-Router-State-Tree`) are stripped before user middleware ever
  // sees them — confirmed directly, a full header dump of a real prefetch
  // request showed only `next-url` surviving. That header's mere presence
  // is still enough: a genuine fresh top-level navigation never carries it
  // at all, while every router-issued fetch does — both a prefetch of a
  // *different* link (next-url pointing at the current page while the
  // request targets another) and a self-referential revalidation fetch
  // for the *current* page (next-url identical to this request's own
  // path).
  const isEntryAnimationApiRoute = path.startsWith('/api/entry-animation/');
  const isPrefetch = request.headers.get('next-url') !== null;
  if (user && !isEntryAnimationApiRoute && !isPrefetch) {
    const now = Date.now();
    const existingToken = request.cookies.get(ENTRY_ANIMATION_PLAY_COOKIE)?.value || null;
    const lastActiveRaw = request.cookies.get(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE)?.value;
    const lastActiveAtMs = lastActiveRaw && /^\d+$/.test(lastActiveRaw) ? Number(lastActiveRaw) : null;

    // justLoggedIn is deliberately always false here — see this block's
    // own header comment for why that trigger is decided by signIn()
    // itself now, not here. decideEntryAnimationPlay() still takes the
    // parameter (it's shared, tested logic) but this call site only ever
    // exercises its gap branch.
    const shouldPlay = decideEntryAnimationPlay({
      hasUser: true,
      path,
      isPublicPath: isPublic,
      justLoggedIn: false,
      lastActiveAtMs,
      nowMs: now,
    });

    // Reuses an already-minted token across a multi-hop redirect chain
    // (app/page.tsx's own further redirect(), reached when a reopen lands
    // on the bare '/' — see lib/auth/postLoginRoute.ts) instead of
    // minting a new one per hop, so the client's later comparison sees
    // one consistent value for what's really one trigger, not several.
    const playToken = !shouldPlay ? '' : (existingToken ?? crypto.randomUUID());

    // Always refreshed on every real (non-prefetch, non-API) authenticated
    // request, independent of shouldPlay — this is the "was there any
    // request at all recently" bookkeeping a *future* gap calculation
    // depends on, not something to skip just because this particular
    // request didn't itself trigger the animation.
    //
    // Setting cookies on `response` alone only reaches the *browser's
    // next* request — app/layout.tsx's cookies().get() for THIS same
    // request still sees the original incoming request cookies, unchanged.
    // Mutating request.cookies and rebuilding response from request.headers
    // (exactly lib/supabase/middleware.ts's own technique, immediately
    // above in this same call chain, for the identical problem with
    // Supabase's session cookie) is what makes the value visible to this
    // request's own render — a genuinely separate concern from whether
    // the browser's *next* request receives it, which is what the
    // response.cookies.set() calls below are for. preservedCookies keeps
    // any cookie updateSession() itself already set on `response` (a
    // refreshed Supabase session token) from being dropped by the rebuild.
    request.cookies.set(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE, String(now));
    request.cookies.set(ENTRY_ANIMATION_PLAY_COOKIE, playToken);
    const preservedCookies = response.cookies.getAll();
    response = NextResponse.next({ request: { headers: request.headers } });
    for (const cookie of preservedCookies) {
      response.cookies.set(cookie);
    }

    // Not httpOnly, matching mef_entry_login (app/actions/auth.ts) — see
    // that cookie's own comment for why RootResetEntryGate.tsx needs to
    // be able to fall back to reading this directly from document.cookie.
    // Just a random token, never anything sensitive.
    response.cookies.set(ENTRY_ANIMATION_PLAY_COOKIE, playToken, {
      path: '/',
      maxAge: ENTRY_ANIMATION_PLAY_MAX_AGE_S,
      httpOnly: false,
      sameSite: 'lax',
    });
    response.cookies.set(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE, String(now), {
      path: '/',
      maxAge: ENTRY_ANIMATION_LAST_ACTIVE_MAX_AGE_S,
      httpOnly: true,
      sameSite: 'lax',
    });
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
