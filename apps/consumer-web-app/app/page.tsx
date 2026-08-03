import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginPath } from '@/lib/auth/postLoginRoute';
import { redirect } from 'next/navigation';

/**
 * Pure routing hub, never rendered UI — always ends in a redirect. This
 * used to be an "internal dev build" placeholder page that required a
 * manual click through to reach a dashboard; every email-verify callback
 * and password-reset flow still converges here first (signIn() itself now
 * resolves and redirects directly, see lib/auth/postLoginRoute.ts's own
 * header comment for why), so this stays the fallback entry point for
 * every other authenticated arrival that doesn't already know its
 * destination.
 */
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  redirect(await resolvePostLoginPath(supabase, user));
}
