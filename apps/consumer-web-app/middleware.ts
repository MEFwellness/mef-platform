import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { hasActiveRole } from '@/lib/auth/guards';

const PUBLIC_PATHS = ['/login', '/signup', '/verify', '/reset-password', '/api/auth/callback'];

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

  return response;
}

export const config = {
  // Excludes framework internals, the PWA manifest, and public/ static
  // assets (icons, images, and common file extensions) — none of these
  // should ever require a session, and previously didn't have one: an
  // unauthenticated request for any of them (e.g. the logo on /login, or
  // a browser's manifest fetch for install-eligibility) was being
  // redirected to /login instead of served, silently breaking both.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|images/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
