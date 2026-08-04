import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

/**
 * Browser-side Supabase client. Anon key only — the same RLS policies that
 * gate the server client gate this one. This is the client used by any
 * Client Component that needs to read data reactively; all writes in
 * Sprint 1 go through Server Actions instead (see app/actions/*.ts), so the
 * mutation path is auditable server-side even though the read path can be
 * direct.
 *
 * `auth.experimental.passkey: true` opts in to Supabase Auth's passkey
 * (Face ID / fingerprint) support — required before `auth.registerPasskey()`
 * or `auth.signInWithPasskey()` (lib/passkey/*, components/profile/
 * PasskeyEnrollment.tsx, app/(auth)/login/page.tsx) will do anything but
 * throw. Passkey ceremonies only ever run in the browser (WebAuthn has no
 * server-side equivalent), so this flag only needs to live here, not on
 * lib/supabase/server.ts's client. Harmless for every other caller of this
 * client — it does not change the behavior of any non-passkey auth method.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey, {
    auth: { experimental: { passkey: true } },
  });
}
