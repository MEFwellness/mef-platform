'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const timezone = String(formData.get('timezone') ?? '').trim();

  if (!displayName) return { error: 'Display name is required.' };
  if (!timezone) return { error: 'Timezone is required.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName, timezone })
    .eq('id', user.id);

  if (error) return { error: error.message };
  return {};
}

/**
 * The one-time "what should we call you" prompt (app/name), reached via
 * the auth callback's redirect (app/api/auth/callback/route.ts) for a
 * brand-new member, or via lib/auth/postLoginRoute.ts on any later login
 * for an existing member whose profiles.display_name is still null (FIX 1,
 * 2026-08-03 — this used to be skippable, which is exactly how members
 * ended up seeing "Good afternoon, there" on the home screen). Distinct
 * from updateProfile() above (the /profile settings form): only ever sets
 * displayName, and redirects on success instead of returning a "Saved."
 * state — this is a one-time flow step, not a settings page. Still
 * editable later from /profile once set.
 */
export async function setDisplayName(formData: FormData): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return { error: 'Please enter a name.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', user.id);

  if (error) return { error: error.message };
  redirect('/');
}
