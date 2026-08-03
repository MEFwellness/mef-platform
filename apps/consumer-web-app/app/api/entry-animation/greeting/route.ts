import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';

/**
 * Used by RootResetEntryGate.tsx's live re-trigger path (the member
 * backgrounds an already-open tab for a while, then returns — no page
 * navigation happens, so there's no fresh server-rendered layout to read
 * the name from). A plain Route Handler for the same reason
 * app/api/entry-animation/consume/route.ts is: see that file's own
 * header comment for why a Server Action isn't used here.
 *
 * Returns authenticated: false rather than a 401 when the session has
 * actually expired while backgrounded — the caller must never show
 * "Welcome back" in that case; the underlying page's own auth check will
 * handle the redirect to /login on its own.
 */
export async function GET() {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ authenticated: false, firstName: null });

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    firstName: profile?.display_name?.split(' ')[0] ?? null,
  });
}
