/**
 * The server side of the bot check: turning a token that may or may not
 * exist into the exact `options` object a Supabase auth call should carry.
 *
 * Supabase enforces captcha per endpoint, not per project call — when the
 * dashboard switch is on, GoTrue rejects any request to a protected
 * endpoint whose body has no `gotrue_meta_security.captcha_token`. supabase-js
 * builds that body from `options.captchaToken`, and — this is the part that
 * makes dormancy work — it sends the field as `undefined` when the option is
 * absent, which JSON.stringify drops entirely. So passing an option object
 * with no captchaToken produces a byte-identical request to passing no
 * option at all.
 *
 * That is why every call site can spread this unconditionally instead of
 * branching: with no key configured the request Supabase receives is exactly
 * the request it received before this feature existed.
 *
 * Nothing here validates the token. Validation is Supabase's job, using the
 * secret key that lives only in its dashboard. A token this app cannot
 * verify is still worth forwarding; a token this app pretended to verify
 * would be worth nothing.
 */

/** The form field every auth form uses to carry its token to the server. */
export const CAPTCHA_TOKEN_FIELD = 'captchaToken';

/**
 * Reads the token out of a submitted form. Returns undefined for the two
 * cases that mean the same thing — the field was never added (bot
 * protection is off) and the field was added but empty (the widget did not
 * produce a token in time) — so neither ever reaches Supabase as an empty
 * string, which GoTrue would treat as a present-but-invalid token.
 */
export function readCaptchaToken(formData: FormData): string | undefined {
  const raw = formData.get(CAPTCHA_TOKEN_FIELD);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The options fragment to spread into a Supabase auth call. Empty object
 * when there is no token, which is what keeps the dormant path identical.
 */
export function captchaOptions(token: string | undefined | null): { captchaToken?: string } {
  if (typeof token !== 'string') return {};
  const trimmed = token.trim();
  return trimmed.length > 0 ? { captchaToken: trimmed } : {};
}

/**
 * True when a Supabase auth error is the captcha check refusing the
 * request, rather than anything the member typed. GoTrue's wording for
 * this has changed across versions ("captcha protection: request
 * disallowed", "captcha verification process failed"), so this matches the
 * one word common to all of them rather than a full sentence.
 */
export function isCaptchaError(rawMessage: string | undefined | null): boolean {
  if (!rawMessage) return false;
  return rawMessage.toLowerCase().includes('captcha');
}
