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
 * The one-time post-signup "what should we call you" prompt (app/name),
 * reached via the auth callback's redirect (app/api/auth/callback/route.ts)
 * for a brand-new member whose profiles.display_name is still null.
 * Distinct from updateProfile() above (the /profile settings form): only
 * ever sets displayName, and redirects on success instead of returning a
 * "Saved." state — this is a one-time flow step, not a settings page.
 * Skippable by design (the page itself offers a "Skip for now" link that
 * never calls this action) since display_name has always been optional —
 * nullable in the profiles table (migration 2), and editable later from
 * /profile regardless.
 */
export async function setDisplayName(formData: FormData): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return { error: 'Please enter a name, or skip for now.' };

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
