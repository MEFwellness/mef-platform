import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';

/**
 * Server-side Supabase client, used in Server Components and Server
 * Actions. Always uses the anon key — RLS is the actual authorization
 * boundary, never a client-side or trusted-server assumption. There is no
 * service-role client used anywhere in the request path this sprint; the
 * service role is reserved for the seed script and future background jobs.
 */
export function createClient() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component during render — the middleware
            // is what actually persists the refreshed session cookie in
            // that case. Safe to ignore here.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // See note above.
          }
        },
      },
    }
  );
}
