'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { ENTRY_ANIMATION_LOGIN_COOKIE, ENTRY_ANIMATION_PLAY_COOKIE } from '@/lib/entry-animation/cookies';

/**
 * Called by RootResetEntryGate.tsx on mount, exactly once, whenever it's
 * about to actually play the animation (either trigger). This is what
 * makes the sticky mef_entry_play cookie middleware.ts sets (see that
 * file's own comment on why it's sticky across a redirect chain) a true
 * one-shot: without an explicit consume step, the sticky '1' would still
 * be sitting in the browser's cookie jar on the member's very next
 * ordinary navigation and replay the animation again.
 */
export async function consumeEntryAnimationTriggers(): Promise<void> {
  cookies().set(ENTRY_ANIMATION_PLAY_COOKIE, '', { path: '/', maxAge: 0 });
  cookies().set(ENTRY_ANIMATION_LOGIN_COOKIE, '', { path: '/', maxAge: 0 });
}

export interface EntryAnimationGreeting {
  authenticated: boolean;
  firstName: string | null;
}

/**
 * Used by RootResetEntryGate.tsx's live re-trigger path (the member
 * backgrounds an already-open tab for a while, then returns — no page
 * navigation happens, so there's no fresh server-rendered layout to read
 * the name from). Root layout's own initial SSR pass covers the same
 * lookup inline for the common case (fresh login / hard reload), reusing
 * getCachedUser()'s request memoization so that pass never double-queries
 * auth. This action is a second, genuinely new request by construction
 * (it only fires on a real backgrounding event, not on every navigation),
 * so there's nothing to memoize it against.
 *
 * Returns authenticated: false rather than throwing when the session has
 * actually expired while backgrounded — the caller must never show
 * "Welcome back" in that case; the underlying page's own auth check will
 * handle the redirect to /login on its own.
 */
export async function getEntryAnimationGreeting(): Promise<EntryAnimationGreeting> {
  const user = await getCachedUser();
  if (!user) return { authenticated: false, firstName: null };

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  return { authenticated: true, firstName: profile?.display_name?.split(' ')[0] ?? null };
}
