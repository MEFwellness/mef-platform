import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './env';

/**
 * Refreshes the Supabase session on every request and returns both the
 * response (with refreshed cookies attached) and the session, so the
 * calling middleware can make redirect decisions. This is UX routing only —
 * see the note in middleware.ts: the real access-control boundary is RLS,
 * not this function.
 *
 * Wrapped in try/catch: this runs on *every* request the matcher covers,
 * including the public /login and /signup pages themselves. Before this
 * fix, a missing/invalid Supabase URL never threw here at all — getUser()
 * returns { user: null, error } rather than throwing, so the site kept
 * rendering with everyone treated as signed-out. getSupabaseEnv() above now
 * throws eagerly for a clearer error, which would otherwise turn that same
 * misconfiguration into a hard 500 on every single page (including /login)
 * instead of the login page loading and only the submit failing. Catching
 * it here and falling back to "treat as signed out" preserves that
 * pre-existing, safer degradation — real authorization still comes from
 * RLS, never from this middleware.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  let supabase: SupabaseClient;
  try {
    const { url, anonKey } = getSupabaseEnv();
    supabase = createServerClient(url, anonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    });
  } catch (err) {
    console.error('updateSession: Supabase misconfigured, treating request as signed-out —', err);
    return { response, user: null, supabase: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
