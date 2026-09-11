/**
 * THE BOT CHECK STARTS WHILE THE PAGE IS STILL PARSING, NOT AFTER IT
 * HYDRATES.
 *
 * THE FAILURE THIS EXISTS TO END, MEASURED RATHER THAN GUESSED. On
 * 2026-09-11, production, a throttled phone profile (Fast 3G, 4x CPU),
 * five cold runs of /login, scripts/measure-login-token-live.mjs:
 *
 *     time to first byte                    55 to 114 ms
 *     document parsed                    1193 to 1251 ms
 *     Cloudflare's api.js first ASKED FOR  1593 to 1640 ms
 *     Cloudflare's api.js in hand          2068 to 2124 ms
 *
 * Nothing about the bot check could begin for the first two seconds,
 * because components/auth/TurnstileGate.tsx appends the script from a
 * mount effect: the request for it was queued behind downloading, parsing
 * and hydrating the app's own JavaScript, and only then could Cloudflare
 * begin its own round trips towards a token.
 *
 * WHY THAT IS A LOGIN THAT FAILS, NOT JUST A SLOW ONE.
 * lib/turnstile/tokenLifecycle.ts waits TOKEN_WAIT_MS for a token, submits
 * without one when none arrives, Supabase refuses the request,
 * lib/turnstile/submit.ts tries once more, and when that also comes up
 * empty the member reads "We could not confirm that in time. Please try
 * again." with a correct email and a correct password in front of her.
 * Two seconds of that budget was being spent before she had typed
 * anything, and on a phone that is slower than the profile above it is
 * more than two.
 *
 * WHAT THIS DOES. Three tags in the server-rendered HTML:
 *
 *   preconnect     DNS, TCP and TLS to challenges.cloudflare.com happen
 *                  alongside the page's own downloads instead of after
 *                  them. `crossOrigin` is required, and matters: a
 *                  preconnect without it warms a different connection
 *                  from the one an anonymous script fetch then uses, so
 *                  the handshake is paid twice.
 *   dns-prefetch   the fallback for browsers that ignore preconnect.
 *   script         async and defer, so the browser starts fetching
 *                  api.js as it parses the head rather than when React
 *                  says so, and runs it without blocking the parser.
 *
 * IT IS THE SAME SCRIPT THE GATE ASKS FOR, BY THE SAME URL, AND THAT IS
 * THE CONTRACT. TurnstileGate's loadTurnstileScript() looks for exactly
 * this src and, finding it, waits on it instead of appending a second
 * one. The two must never drift apart, which is why the URL is exported
 * from one module (lib/turnstile/script.ts) and imported by both.
 *
 * NOTHING CHANGES WHEN BOT PROTECTION IS OFF. With no site key configured
 * this renders null, exactly as TurnstileGate does, so a deployment
 * without the key sends no tag, opens no connection and fetches nothing.
 *
 * SCOPED TO THE SCREENS THAT CARRY A WIDGET. It is in app/(auth)/layout.tsx
 * and in the one signed-in form that also carries one. Putting it in the
 * root layout would hand every screen in the app a 60 kB script it has no
 * use for, which is the opposite of the problem being fixed.
 */

import { TURNSTILE_SCRIPT_SRC } from '@/lib/turnstile/script';
import { isTurnstileConfigured } from '@/lib/turnstile/env';

export function TurnstilePreload() {
  if (!isTurnstileConfigured()) return null;
  return (
    <>
      <link rel="preconnect" href="https://challenges.cloudflare.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
      <script src={TURNSTILE_SCRIPT_SRC} async defer />
    </>
  );
}
