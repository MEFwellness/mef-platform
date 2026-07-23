'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface ActionResult {
  error?: string;
}

type AuthStage = 'client_init' | 'supabase_request' | 'unexpected';

/**
 * Server-side-only diagnostic log (never sent to the browser — the client
 * only ever gets the curated message an ActionResult carries). Captures
 * exactly what's needed to debug a failed auth call from Vercel's function
 * logs without ever logging the password/token/PII that produced it:
 * which action, which stage of the request it failed at (before Supabase
 * was even reached vs. a response Supabase itself returned), plus
 * Supabase's own message/status/code when available.
 */
function logAuthFailure(stage: AuthStage, action: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown })?.status;
  const code = (err as { code?: unknown })?.code;
  console.error('[auth]', {
    action,
    stage,
    message,
    status: typeof status === 'number' ? status : undefined,
    code: typeof code === 'string' ? code : undefined,
  });
}

/**
 * Catches anything thrown *before* or *instead of* a structured Supabase
 * `{ error }` response — createClient() throwing because
 * NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY aren't set (see
 * lib/supabase/env.ts), or the request itself never completing (DNS/network
 * failure, wrong project host, etc.). Every path that reaches this function
 * is necessarily pre-account-creation — no user row can exist if the
 * request never reached Supabase — so it always returns the same safe,
 * generic "service" message rather than the underlying exception text,
 * which may name env vars or internals members shouldn't see. The full
 * detail still goes to logAuthFailure for Vercel's function logs.
 */
function toActionError(action: string, err: unknown): ActionResult {
  logAuthFailure('client_init', action, err);
  return { error: 'Unable to connect to the account service. Please try again in a moment.' };
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
    if (error) {
      logAuthFailure('supabase_request', 'signUp', error);
      return { error: error.message };
    }
  } catch (err) {
    return toActionError('signUp', err);
  }
  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

/** Re-sends the signup confirmation email. Supabase enforces its own resend cooldown. */
export async function resendVerificationEmail(email: string): Promise<ActionResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
      },
    });
    if (error) {
      logAuthFailure('supabase_request', 'resendVerificationEmail', error);
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return toActionError('resendVerificationEmail', err);
  }
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logAuthFailure('supabase_request', 'signIn', error);
      return { error: error.message };
    }
  } catch (err) {
    return toActionError('signIn', err);
  }
  redirect('/');
}

export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch (err) {
    logAuthFailure('unexpected', 'signOut', err);
  }
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Routes through the same code-exchange callback signup already uses
      // (app/api/auth/callback/route.ts) so the recovery code becomes a real
      // session before the confirm page calls updateUser() — without this,
      // Supabase's PKCE-style recovery link lands on reset-password/confirm
      // with only an unexchanged `?code=`, no session, and updateUser fails.
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?next=/reset-password/confirm`,
    });
    if (error) {
      logAuthFailure('supabase_request', 'requestPasswordReset', error);
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return toActionError('requestPasswordReset', err);
  }
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '');
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logAuthFailure('supabase_request', 'updatePassword', error);
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return toActionError('updatePassword', err);
  }
}
