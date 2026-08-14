import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_S,
  RESET_CONFIRM_PATH,
  expiredLinkPath,
  parseRecoveryLanding,
} from '@/lib/auth/recovery';

/**
 * The single address every password-reset email points at
 * (recoveryRedirectTo() in lib/auth/recovery.ts). Separate from
 * /api/auth/callback on purpose: that route's job is "finish a sign-in and
 * send them wherever they were going", and a recovery is the one case where
 * finishing the sign-in is exactly the wrong outcome. Keeping them apart
 * means the recovery intent lives in the path itself and cannot be lost the
 * way a `?next=` parameter could.
 *
 * Handles both server-visible shapes of a recovery link and hands the
 * browser-only one off to the page. See lib/auth/recovery.ts for why there
 * are three shapes to begin with.
 *
 * The origin comes from NEXT_PUBLIC_SITE_URL rather than request.url for
 * the same reason app/api/auth/callback/route.ts does it: the session
 * cookie is scoped to the configured site origin, and deriving the redirect
 * from the request's own host has already broken this exact flow once.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  // The fragment is never transmitted, so `hash` is always empty here. It is
  // passed anyway so this route and the browser use one detection function
  // with one set of rules, rather than two that can drift apart.
  const landing = parseRecoveryLanding(searchParams.toString(), '');

  const expired = () => NextResponse.redirect(`${origin}${expiredLinkPath()}`);

  const granted = () => {
    const response = NextResponse.redirect(`${origin}${RESET_CONFIRM_PATH}`);
    // Read by middleware.ts to gate every other route until the password is
    // actually changed, and cleared by updatePassword() on success. Just an
    // opaque marker; the session itself is what carries any authority.
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, crypto.randomUUID(), {
      path: '/',
      maxAge: PASSWORD_RECOVERY_MAX_AGE_S,
      httpOnly: true,
      sameSite: 'lax',
    });
    return response;
  };

  if (landing.kind === 'expired') return expired();

  try {
    const supabase = createClient();

    if (landing.kind === 'code') {
      const { error } = await supabase.auth.exchangeCodeForSession(landing.code);
      // A code that will not exchange is, from the member's side, simply a
      // dead link, most often because it was already used, it timed out, or
      // it was opened on a different device from the one that requested it.
      // All of those deserve the same honest screen and a way to get a fresh
      // link, never a bare login form.
      return error ? expired() : granted();
    }

    if (landing.kind === 'token_hash') {
      const { error } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: landing.tokenHash,
      });
      return error ? expired() : granted();
    }
  } catch (err) {
    console.error('[auth]', {
      action: 'recoveryCallback',
      stage: 'client_init',
      message: err instanceof Error ? err.message : String(err),
    });
    return expired();
  }

  // Nothing the server can see. Either the tokens are in the fragment
  // (implicit flow) or this is a dead link whose error is also in the
  // fragment. The browser can tell the two apart and this redirect preserves
  // the fragment on the way, so the confirm page finishes the job.
  return NextResponse.redirect(`${origin}${RESET_CONFIRM_PATH}`);
}
