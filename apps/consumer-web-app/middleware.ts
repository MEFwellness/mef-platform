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
  // the data these pages read/write; see lib/auth/guards.ts.
  if (user && path.startsWith('/admin')) {
    const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
    if (!isAdmin) return NextResponse.redirect(new URL('/', request.url));
  }

  if (user && path.startsWith('/coach')) {
    const isCoach = await hasActiveRole(supabase, user.id, 'coach');
    if (!isCoach) return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
