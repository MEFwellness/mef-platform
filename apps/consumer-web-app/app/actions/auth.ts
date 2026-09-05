'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createStandaloneClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_S,
  recoveryRedirectTo,
} from '@/lib/auth/recovery';
import {
  ENTRY_ANIMATION_LAST_ACTIVE_COOKIE,
  ENTRY_ANIMATION_LOGIN_COOKIE,
  ENTRY_ANIMATION_LOGIN_MAX_AGE_S,
  ENTRY_ANIMATION_PLAY_COOKIE,
} from '@/lib/entry-animation/cookies';
import { resolvePostLoginPath, isSafePostLoginRedirect } from '@/lib/auth/postLoginRoute';
import { captchaOptions, readCaptchaToken } from '@/lib/turnstile/captcha';
import { PUBLIC_ENTRY_TOKEN_FIELD, readSignupRef } from '@/lib/public-entry/signupField';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackProductEvent, resolveMemberTimezone } from '@/lib/analytics/track';

export interface ActionResult {
  error?: string;
}

/**
 * One behavioral session_started row per completed sign-in, whatever
 * method got the member here. This is the raw event return frequency is
 * derived from; nothing computes daily/weekly actives at write time.
 * Never throws (trackProductEvent swallows everything) and never blocks
 * the redirect that follows it.
 */
async function recordSessionStarted(
  supabase: SupabaseClient,
  memberId: string,
  method: 'password' | 'passkey'
): Promise<void> {
  await trackProductEvent(supabase, {
    memberId,
    eventType: 'session_started',
    timezone: await resolveMemberTimezone(supabase, memberId),
    payload: { method },
  });
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
 * Turns a structured Supabase AuthError into the client-facing result.
 *
 * For any 5xx, @supabase/auth-js's fetch layer (lib/fetch.js `handleError`)
 * deliberately never reads the response body — it throws
 * `AuthRetryableFetchError(JSON.stringify(rawResponse), status)`, and
 * `JSON.stringify` on a fetch `Response` object (all getters, no own
 * enumerable properties) always evaluates to the literal string "{}"
 * regardless of what Supabase's server actually said. So `error.message`
 * is never anything but "{}" for a 5xx — showing it to a member would be
 * showing them garbage, and the real cause lives only in Supabase's own
 * server-side logs, not in anything this client can see. `error.status` is
 * unaffected (read directly off the real Response, not JSON.stringify'd)
 * and is the one signal from a 5xx worth keeping.
 */
function toResult(error: { message: string; status?: number | undefined }): ActionResult {
  if (typeof error.status === 'number' && error.status >= 500) {
    return {
      error:
        'The account service is having a temporary problem on our end. Please try again in a few minutes.',
    };
  }
  return { error: error.message };
}

/**
 * Sign up. No role field accepted from the form, ever — role assignment is
 * exclusively the handle_new_user() database trigger (migration 17), which
 * hardcodes 'member'. This function has no code path that could grant
 * anything else, by construction, not just by validation.
 *
 * Deliberately does not collect display_name — the signup form only asks
 * for email/password now (per the "reduce friction" account-creation
 * brief); handle_new_user() inserts profiles.display_name as null when
 * it's absent from user_metadata, and the auth callback
 * (app/api/auth/callback/route.ts) redirects a brand-new member with no
 * display_name to app/name/page.tsx once, right after their account
 * actually exists, instead of asking for it before it does.
 *
 * Signup is the endpoint bot protection exists for — it is the one that
 * creates rows and sends email on an anonymous request. The captcha token
 * rides in the same FormData as everything else and is absent whenever
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, in which case captchaOptions()
 * contributes nothing and this call is unchanged.
 */
export async function signUp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const timezone = String(formData.get('timezone') ?? 'America/New_York');
  const captchaToken = readCaptchaToken(formData);
  // What this browser is holding, and the ONE thing it decides. See
  // linkArrival below.
  const browserCarriesArrival = String(formData.get(PUBLIC_ENTRY_TOKEN_FIELD) ?? '') === 'yes';
  // The one-time reference her own create-account button carried, when
  // there was one. Null for every signup that did not come from a finished
  // result screen, and null for anything that is not the right shape.
  const signupRef = readSignupRef(formData);

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
        data: { timezone },
        ...captchaOptions(captchaToken),
      },
    });
    if (error) {
      logAuthFailure('supabase_request', 'signUp', error);
      return toResult(error);
    }
    await linkArrival(data.user, email, { signupRef, browserCarriesArrival });
  } catch (err) {
    return toActionError('signUp', err);
  }
  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

/**
 * EVERYTHING HER ARRIVAL PRODUCED, ATTACHED TO THE ACCOUNT THAT WAS JUST
 * CREATED: what she told the quiz, and where she came from.
 *
 * THREE ROUTES, IN ONE ORDER, AND NEVER MORE THAN ONE BIND.
 *
 *   1. THE BROWSER TOKEN, and it is still the strongest thing there is. It
 *      is not attempted here, because it physically cannot be: it runs from
 *      the claim in the root layout, which needs somebody to be signed in,
 *      and nobody is signed in until an email is confirmed. It keeps its
 *      priority the only way that means anything, which is that it can
 *      never be overwritten and never overwrites: member_public_entry_origin
 *      has member_id as its primary key and session_id unique, so whichever
 *      route arrives first is the one that stands, and every other route
 *      reads back "already bound" and writes nothing.
 *
 *   2. THE SIGNUP LINK, which is the route this function exists for.
 *      Her own create-account button carried a one-time, server-issued
 *      reference to the arrival she had just finished, and it is redeemed
 *      right here, in the same request that creates the account. That is
 *      what makes it independent of which browser confirms the email, which
 *      is the whole gap it closes. See lib/public-entry/signupRef.ts.
 *
 *   3. HER EMAIL ADDRESS, last, and only when nothing was carried. The
 *      weakest of the three, because a lead email is self-entered and
 *      unverified, and it is skipped whenever a stronger route is in play:
 *      when the reference already bound her, and when the browser said it
 *      is holding a token, in which case the claim route owns the outcome
 *      and runs this same match itself if the token turns out to bind
 *      nothing (settleByEmail).
 *
 * WHY THIS ORDER LEAVES NOTHING UNCOVERED, WHICH IT DID NOT BEFORE. Three
 * real signups broke on production in one day, each one a different path
 * closing while the others were being skipped on its behalf: a stale token
 * that named somebody else's session (migration 207), a quiz on a phone and
 * a signup on a laptop (migration 207), and a confirmation email opened in
 * a mail app's own browser (migration 208). Every one of them now has a
 * route that does not depend on the browser that comes back.
 *
 * WHY IT RUNS HERE AND NOT ON A PAGE. Creating an account is the explicit
 * thing she did, this is the server that did it, and both the address and
 * the reference are already in hand. No render decides anything, no extra
 * request is made from any screen, and nothing runs at all for the members
 * who never took the public experience.
 *
 * WHY data.user IS CHECKED THE WAY IT IS. When the address already belongs
 * to somebody, GoTrue deliberately returns a user shaped object with no
 * identities rather than admitting the account exists. That object names
 * nobody, so it is not somebody to attach an origin to, and no reference is
 * spent on it.
 *
 * NEVER ALLOWED TO FAIL A SIGNUP. An attribution row is a business record
 * about where somebody came from and a bind is a record of what she already
 * told us. Losing one costs a number on an admin screen and a sentence Root
 * could have said; failing the signup costs the member.
 */
async function linkArrival(
  user: { id: string; created_at?: string; identities?: unknown[] | null } | null,
  email: string,
  options: { signupRef: string | null; browserCarriesArrival: boolean }
): Promise<void> {
  if (!user?.id) return;
  if (!Array.isArray(user.identities) || user.identities.length === 0) return;
  if (!options.signupRef && options.browserCarriesArrival) return;
  try {
    const { attachUserAcquisitionFromArrival, attachUserAcquisitionFromLead } = await import(
      '@/lib/acquisition/data'
    );
    const { bindOriginFromEmailMatch } = await import('@/lib/public-entry/data');
    const { redeemSignupRef } = await import('@/lib/public-entry/signupRef');
    const { serviceRoleClient } = await import('@/lib/supabase/serviceRole');
    const service = serviceRoleClient();
    const accountCreatedAt = user.created_at ?? null;

    // ROUTE 2. Redeeming is single use and final: whatever it resolves to,
    // there is nothing here to ask again about.
    let bound = false;
    if (options.signupRef) {
      const redeemed = await redeemSignupRef(service, {
        memberId: user.id,
        ref: options.signupRef,
      });
      bound = redeemed.bound;
      if (redeemed.bound && redeemed.session) {
        await attachUserAcquisitionFromArrival(service, {
          memberId: user.id,
          session: redeemed.session,
          experienceKey: redeemed.session.experienceKey,
          accountCreatedAt,
        });
      }
    }

    // ROUTE 3. Only when the reference bound nothing AND this browser is
    // carrying no token of its own. A browser that says yes is deferring to
    // the claim route, which runs this same match itself the moment the
    // token turns out to be unable to bind.
    if (bound || options.browserCarriesArrival) return;
    // Sequential rather than concurrent on purpose: the bind is the one a
    // member can actually see the result of, and it should not be racing an
    // analytics write for the same connection.
    await bindOriginFromEmailMatch(service, { memberId: user.id, email, accountCreatedAt });
    await attachUserAcquisitionFromLead(service, { memberId: user.id, email, accountCreatedAt });
  } catch (err) {
    console.error('linkArrival failed', err);
  }
}

/**
 * Re-sends the signup confirmation email. Supabase enforces its own resend
 * cooldown. Takes the captcha token as a plain argument rather than reading
 * FormData, because the verify screen's resend is a button, not a form —
 * the token is still the same one the widget on that screen produced, and
 * is undefined whenever bot protection is not configured.
 */
export async function resendVerificationEmail(
  email: string,
  captchaToken?: string
): Promise<ActionResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
        ...captchaOptions(captchaToken),
      },
    });
    if (error) {
      logAuthFailure('supabase_request', 'resendVerificationEmail', error);
      return toResult(error);
    }
    return {};
  } catch (err) {
    return toActionError('resendVerificationEmail', err);
  }
}

/**
 * One-shot token for app/layout.tsx / RootResetEntryGate.tsx: the very next
 * request (the redirect this always precedes) always plays the branded
 * entry animation, regardless of how recently this browser last talked to
 * the server — see lib/entry-animation/rule.ts. Deliberately set here (a
 * Server Action), not minted by middleware.ts the way the gap-triggered
 * reopen case is: confirmed directly against production that a cookie
 * middleware sets does not reliably reach the browser on the RSC-fetch
 * response Next.js's client router uses to follow *this specific* redirect.
 * Deliberately NOT httpOnly, unlike this app's other session cookies: also
 * confirmed directly against production that app/layout.tsx's own server
 * render of this exact redirect's destination is inconsistent about seeing
 * this cookie at all (Next.js appears to render the root layout more than
 * once for one Server-Action-triggered redirect, only one of which reliably
 * carries the freshly-set cookie) — RootResetEntryGate.tsx falls back to
 * reading it directly from document.cookie for exactly this reason. The
 * value is a random token, never anything sensitive, so client-JS
 * readability carries no real risk.
 *
 * Shared by every server-side login completion (password, passkey) so the
 * entry animation always plays the same way regardless of which method a
 * member used — always called last, after every other check has passed,
 * since redirect() throws and must never run inside the try/catch above it.
 */
function redirectWithEntryAnimation(destination: string): never {
  cookies().set(ENTRY_ANIMATION_LOGIN_COOKIE, crypto.randomUUID(), {
    path: '/',
    maxAge: ENTRY_ANIMATION_LOGIN_MAX_AGE_S,
    httpOnly: false,
    sameSite: 'lax',
  });
  redirect(destination);
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const redirectedFrom = formData.get('redirectedFrom');
  const captchaToken = readCaptchaToken(formData);

  let destination = '/';
  try {
    const supabase = createClient();
    // One login screen serves members, coaches and administrators (role is
    // resolved afterwards by resolvePostLoginPath), so this single call is
    // every password sign-in in the app and carrying the token here covers
    // all three roles at once.
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaOptions(captchaToken),
    });
    if (error) {
      logAuthFailure('supabase_request', 'signIn', error);
      return toResult(error);
    }
    // Resolve the real destination here, in this same request, instead of
    // redirecting to '/' and letting app/page.tsx (a second, separate
    // request) resolve it — see lib/auth/postLoginRoute.ts's own header
    // comment for why that extra hop mattered (a deep link never survived
    // it, and it was a real source of double-counting for the branded
    // entry animation's session-entry cookie). Falls back to the plain
    // '/' hub on the (never expected in practice) case that signIn
    // somehow returns no user, so behavior degrades to exactly what it
    // was before rather than crashing.
    if (data.user) {
      // Product analytics, the raw event return frequency is derived
      // from (daily/weekly actives, days between visits). Deliberately
      // recorded here rather than inventing a separate "session" concept:
      // this and completePasskeyLogin below are the only two places a
      // real, completed sign-in exists server-side, so one row here is
      // one genuine return visit. See docs/PRODUCT_ANALYTICS.md for the
      // derivation queries. Must be before redirectWithEntryAnimation,
      // which throws.
      await recordSessionStarted(supabase, data.user.id, 'password');

      destination = await resolvePostLoginPath(supabase, data.user);
      if (destination === '/dashboard' && isSafePostLoginRedirect(redirectedFrom?.toString())) {
        destination = redirectedFrom!.toString();
      }
    }
  } catch (err) {
    return toActionError('signIn', err);
  }
  redirectWithEntryAnimation(destination);
}

/**
 * Completes a passkey ("Sign in with Face ID") sign-in. The WebAuthn
 * ceremony itself only runs in the browser (components/PasskeyLoginButton
 * or wherever calls `supabase.auth.signInWithPasskey()` from
 * lib/supabase/client.ts's client) — that already establishes a real
 * session, synced into cookies by @supabase/ssr's browser storage adapter
 * before this action is ever called. This just does the same server-side
 * tail signIn() does once a session exists: resolve where the member
 * actually belongs (role/onboarding/consent) and mint the same one-shot
 * entry-animation token, so a Face ID login looks identical to a password
 * login from that point on. Takes a plain string rather than FormData —
 * unlike signIn(), this is never called from a native <form action>,
 * since the WebAuthn ceremony has to run first.
 */
export async function completePasskeyLogin(redirectedFrom?: string | null): Promise<ActionResult> {
  let destination = '/';
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      logAuthFailure('supabase_request', 'completePasskeyLogin', error ?? new Error('no session after passkey sign-in'));
      return { error: 'Face ID sign-in did not go through. Please try again or use your password.' };
    }
    await recordSessionStarted(supabase, user.id, 'passkey');

    destination = await resolvePostLoginPath(supabase, user);
    if (destination === '/dashboard' && isSafePostLoginRedirect(redirectedFrom)) {
      destination = redirectedFrom;
    }
  } catch (err) {
    return toActionError('completePasskeyLogin', err);
  }
  redirectWithEntryAnimation(destination);
}

/**
 * Ends the session for every role: member, coach and administrator all
 * reach this same action (components/SignOutButton.tsx is the only control
 * that calls it, from the member profile sheet, the member Profile page,
 * the trial-ended lock screen and the staff navigation bar).
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch (err) {
    logAuthFailure('unexpected', 'signOut', err);
  }
  // Clear the entry-animation session state so a future login on this
  // browser always replays it, rather than inheriting a stale
  // mef_entry_last_active gap from whoever was signed in before.
  cookies().set(ENTRY_ANIMATION_LAST_ACTIVE_COOKIE, '', { path: '/', maxAge: 0 });
  cookies().set(ENTRY_ANIMATION_LOGIN_COOKIE, '', { path: '/', maxAge: 0 });
  cookies().set(ENTRY_ANIMATION_PLAY_COOKIE, '', { path: '/', maxAge: 0 });
  // Abandoning a recovery by signing out must not leave the next session on
  // this browser gated behind a set-new-password screen it never triggered.
  cookies().set(PASSWORD_RECOVERY_COOKIE, '', { path: '/', maxAge: 0 });
  // Back button after signing out. Ending the Supabase session is what
  // makes the next REQUEST bounce to /login (middleware.ts), but the
  // browser going Back does not necessarily make a request: Next.js keeps
  // a client side Router Cache of the RSC payloads for screens visited in
  // this session, and Back is exactly the navigation it is designed to
  // serve from memory. Without this, tapping Back after signing out could
  // repaint the previous screen, name, numbers and all, from a payload
  // rendered while the session was still alive. Invalidating from the root
  // layout down empties that cache for every route at once, so Back has
  // nothing cached to show and has to ask the server, which redirects it.
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '');
  const captchaToken = readCaptchaToken(formData);
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      ...captchaOptions(captchaToken),
      // A bare path, with the recovery intent carried by the path itself
      // rather than a `?next=` parameter — see recoveryRedirectTo()'s own
      // comment for why that parameter was the thing turning a reset link
      // into a plain sign-in whenever it failed to survive the round trip.
      redirectTo: recoveryRedirectTo(process.env.NEXT_PUBLIC_SITE_URL ?? ''),
    });
    if (error) {
      logAuthFailure('supabase_request', 'requestPasswordReset', error);
      return toResult(error);
    }
    return {};
  } catch (err) {
    return toActionError('requestPasswordReset', err);
  }
}

/**
 * Raises the recovery gate from the browser.
 *
 * Only used for the implicit-flow landing, where the tokens arrive in the
 * URL fragment and the server never sees them: by the time the page can act
 * on them a session already exists, which is exactly the silent sign-in this
 * build removes. The two server-visible shapes set the same cookie inside
 * app/api/auth/recovery/route.ts instead, before any redirect happens.
 *
 * Safe to call with no session — the cookie alone grants nothing, and
 * shouldGateToPasswordReset() ignores it unless a real user is present.
 */
export async function beginPasswordRecovery(): Promise<void> {
  cookies().set(PASSWORD_RECOVERY_COOKIE, crypto.randomUUID(), {
    path: '/',
    maxAge: PASSWORD_RECOVERY_MAX_AGE_S,
    httpOnly: true,
    sameSite: 'lax',
  });
}

function clearRecoveryCookie(): void {
  cookies().set(PASSWORD_RECOVERY_COOKIE, '', { path: '/', maxAge: 0 });
}

/**
 * Completes a reset-by-email. The caller must already hold the recovery
 * session that app/api/auth/recovery/route.ts (or beginPasswordRecovery)
 * established — this refuses rather than silently doing nothing if it
 * doesn't, so an expired link can never present a form that appears to work.
 */
export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '');
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: 'This reset link has expired. Request a new one and it will work straight away.',
      };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logAuthFailure('supabase_request', 'updatePassword', error);
      return toResult(error);
    }
    // Lower the gate only once the password has genuinely changed, so an
    // abandoned or failed attempt still can't wander off into the app.
    clearRecoveryCookie();
    return {};
  } catch (err) {
    return toActionError('updatePassword', err);
  }
}

/** Distinguishes a wrong current password from every other failure. */
export interface ChangePasswordResult extends ActionResult {
  field?: 'currentPassword' | 'password';
}

/**
 * Changes the password of an already-signed-in account. One flow for every
 * role: it asks Supabase who the caller is and never reads a role, so a
 * member, a coach and an administrator all run the same code path.
 *
 * The current password is verified by actually attempting a sign-in with it,
 * because Supabase has no "check this password" endpoint — updateUser() will
 * happily change the password of whoever holds the session without ever
 * asking what the old one was. That check is what stops a borrowed or
 * unattended session from being turned into a permanent takeover.
 *
 * The verification runs on a throwaway client with persistSession off, so it
 * cannot touch the cookies carrying the caller's real session. Signing that
 * throwaway session out uses scope 'local' deliberately: the default is
 * 'global', which would revoke every session this account holds, including
 * the one making this request, and log the member out mid-change.
 *
 * That verification step is why this screen carries a captcha token even
 * though changing a password is something only a signed-in person can do.
 * The token is not for the password change itself — updateUser() is not one
 * of the endpoints Supabase protects with a captcha, and takes no token —
 * it is for the signInWithPassword() call one line above it, which is the
 * same protected endpoint the login screen uses. Without a token here, this
 * screen would start reporting "that is not your current password" to
 * everybody the moment captcha was switched on, for a password that was
 * correct.
 */
export async function changePassword(formData: FormData): Promise<ChangePasswordResult> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const password = String(formData.get('password') ?? '');
  const captchaToken = readCaptchaToken(formData);

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return { error: 'You are signed out. Please sign in again and retry.' };
    }

    const { url, anonKey } = getSupabaseEnv();
    const verifier = createStandaloneClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
      options: captchaOptions(captchaToken),
    });
    if (verifyError) {
      logAuthFailure('supabase_request', 'changePassword.verify', verifyError);
      // Anything other than a genuine credential rejection (a rate limit, a
      // 5xx, a refused captcha) must not be reported as "wrong password" —
      // that would send a member round in circles retyping a password that
      // was correct.
      if (verifyError.message.toLowerCase().includes('invalid login credentials')) {
        return { error: 'That is not your current password.', field: 'currentPassword' };
      }
      return toResult(verifyError);
    }
    await verifier.auth.signOut({ scope: 'local' });

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      logAuthFailure('supabase_request', 'changePassword', error);
      return { ...toResult(error), field: 'password' };
    }
    return {};
  } catch (err) {
    return toActionError('changePassword', err);
  }
}
