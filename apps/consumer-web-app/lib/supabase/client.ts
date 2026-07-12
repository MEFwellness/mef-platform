import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Anon key only — the same RLS policies that
 * gate the server client gate this one. This is the client used by any
 * Client Component that needs to read data reactively; all writes in
 * Sprint 1 go through Server Actions instead (see app/actions/*.ts), so the
 * mutation path is auditable server-side even though the read path can be
 * direct.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
