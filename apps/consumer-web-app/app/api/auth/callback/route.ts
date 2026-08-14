import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_S,
  RESET_CONFIRM_PATH,
  RESET_REQUEST_PATH,
  expiredLinkPath,
} from '@/lib/auth/recovery';

// The exchange sets its session cookie on whatever host actually received
// this request. Deriving the redirect target from request.url's origin
// instead of the app's own configured site URL previously sent the browser
// to a different host than the one the cookie was scoped to (e.g. this
// project's own `next dev -H 0.0.0.0` binds the server to 0.0.0.0, and
// request.url's origin resolved to http://0.0.0.0:3000 instead of
// http://localhost:3000) — the browser then correctly withheld the
// localhost-scoped cookie from the 0.0.0.0 origin, silently discarding the
// session and breaking updateUser() in the password-recovery flow right
// after a successful exchange. NEXT_PUBLIC_SITE_URL is the same fixed
// origin every other action in app/actions/auth.ts already redirects to.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Only on the default post-signup-verification landing — never the
      // password-reset flow, which explicitly passes
      // next=/reset-password/confirm through this same route (see
      // requestPasswordReset() in app/actions/auth.ts) — send a brand-new
      // member who hasn't told us their name yet to do that first. One
      // extra stop, then straight into the normal routing hub (app/page.tsx),
      // which is otherwise completely unchanged.
      if (next === '/' && data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', data.user.id)
          .single();
        if (!profile?.display_name) {
          return NextResponse.redirect(`${origin}/name`);
        }
      }
      // Reset emails sent before app/api/auth/recovery/route.ts existed
      // still point here, carrying their intent in `next`. Those links stay
      // in inboxes for days, so they have to keep working: honour the same
      // recovery marker the new route sets, otherwise an old link would
      // exchange its code, find no marker on the confirm screen, and be
      // reported as expired while quietly leaving the member signed in.
      // New emails never take this path.
      if (next.startsWith(RESET_REQUEST_PATH)) {
        const response = NextResponse.redirect(`${origin}${RESET_CONFIRM_PATH}`);
        response.cookies.set(PASSWORD_RECOVERY_COOKIE, crypto.randomUUID(), {
          path: '/',
          maxAge: PASSWORD_RECOVERY_MAX_AGE_S,
          httpOnly: true,
          sameSite: 'lax',
        });
        return response;
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Same reasoning in the failure direction: an old reset link that has
    // expired or already been used must say so, not present a login form.
    if (next.startsWith(RESET_REQUEST_PATH)) {
      return NextResponse.redirect(`${origin}${expiredLinkPath()}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
