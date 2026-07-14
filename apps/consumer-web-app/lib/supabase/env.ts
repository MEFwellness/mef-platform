/**
 * Single source of truth for reading the two Supabase env vars every
 * client-construction site in this app needs. Every one of
 * lib/supabase/{server,client,middleware}.ts previously read
 * `process.env.NEXT_PUBLIC_SUPABASE_URL!` directly — the `!` only silences
 * TypeScript; at runtime, an unset var becomes `undefined`, which
 * `createServerClient`/`createBrowserClient` accept without complaint and
 * only fail much later, deep inside an actual auth call, as an opaque
 * `TypeError: fetch failed` with no indication of *why*. Centralizing the
 * read here means that failure now happens at client-construction time
 * with a message that says exactly what's missing and where to fix it.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Supabase is not configured: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing. ` +
        'Set them in .env.local for local development, or in your hosting ' +
        "provider's project environment variables (e.g. Vercel → Project " +
        'Settings → Environment Variables) for a deployed environment, then ' +
        'redeploy.'
    );
  }

  return { url: url!, anonKey: anonKey! };
}
