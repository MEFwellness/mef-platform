'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface ActionResult {
  error?: string;
}

/**
 * createClient() now throws (see lib/supabase/env.ts) when
 * NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY aren't set,
 * instead of silently constructing a client that only fails later, deep
 * inside a fetch, as an opaque "fetch failed". Every action below used to
 * have no try/catch at all, so that throw would have escaped as an
 * unhandled Server Action error (Next's generic error boundary) instead of
 * the normal inline {error} the login/signup forms already know how to
 * render. This wraps that one failure mode — a genuine misconfiguration —
 * the same way every other Supabase error already surfaces here.
 */
function toActionError(err: unknown): ActionResult {
  const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  console.error('Auth action failed:', message);
  return { error: message };
}

/**
 * Sign up. No role field accepted from the form, ever — role assignment is
 * exclusively the handle_new_user() database trigger (migration 17), which
 * hardcodes 'member'. This function has no code path that could grant
 * anything else, by construction, not just by validation.
 */
export async function signUp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('displayName') ?? '');
  const timezone = String(formData.get('timezone') ?? 'America/New_York');

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
        data: { display_name: displayName, timezone },
      },
    });
    if (error) return { error: error.message };
  } catch (err) {
    return toActionError(err);
  }
  redirect('/verify');
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
  } catch (err) {
    return toActionError(err);
  }
  redirect('/');
}

export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error('signOut failed:', err instanceof Error ? err.message : err);
  }
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password/confirm`,
    });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '');
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
  } catch (err) {
    return toActionError(err);
  }
  redirect('/login');
}
