import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
