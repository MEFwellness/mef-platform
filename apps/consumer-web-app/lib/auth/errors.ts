export interface FriendlyAuthErrorOptions {
  /**
   * When a raw message doesn't match any known case below, the default
   * behavior hides it behind a fully generic message (kept as the default
   * so existing callers — login, reset-password, resend — are unaffected).
   * Signup opts in to this instead: GoTrue's error text is already
   * safe to show (it's the same text Supabase would have returned straight
   * to the browser had this been a client-side call), and surfacing it is
   * strictly more actionable than hiding it, per the account-creation-
   * failure UX this was added for.
   */
  includeRawOnFallback?: boolean;
  /** Prefix used when includeRawOnFallback applies, e.g. "Account creation failed". */
  fallbackPrefix?: string;
}

/**
 * Maps raw Supabase GoTrue error messages to member-friendly copy. Supabase
 * doesn't expose stable error codes through supabase-js on every version in
 * use here, so this matches on the (versioned, but slow-changing) message
 * text GoTrue actually returns rather than an error code.
 */
export function getFriendlyAuthError(
  rawMessage: string | undefined | null,
  options?: FriendlyAuthErrorOptions
): string {
  if (!rawMessage) return 'Something went wrong. Please try again.';
  const message = rawMessage.toLowerCase();

  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (message.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please verify your email before logging in. Check your inbox for the verification link.';
  }
  if (message.includes('invalid email') || message.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (
    message.includes('password') &&
    (message.includes('short') || message.includes('weak') || message.includes('at least'))
  ) {
    return 'Please choose a stronger password.';
  }
  if (
    message.includes('for security purposes') ||
    message.includes('rate limit') ||
    message.includes('only request this after')
  ) {
    return 'We recently sent a verification email. Please wait a moment before requesting another one.';
  }
  // GoTrue returns this when the auth.users row was created successfully but
  // the outbound email itself failed (e.g. SMTP misconfigured) — the account
  // exists, so this must read differently from every case above, all of
  // which mean no account was created.
  if (message.includes('error sending') && message.includes('email')) {
    return 'Your account was created, but the confirmation email could not be sent. You can request a new one from the sign-in page.';
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network')
  ) {
    return 'Unable to connect to the account service. Please try again in a moment.';
  }
  // Thrown by lib/supabase/env.ts before any request reaches Supabase — a
  // deployment/config problem, not something a member did wrong.
  if (message.includes('supabase is not configured')) {
    return 'Unable to connect to the account service. Please try again later.';
  }
  // Defense in depth: app/actions/auth.ts already substitutes a curated
  // message before this ever runs, but "{}" is specifically what
  // @supabase/auth-js's AuthRetryableFetchError carries for every 5xx (see
  // toResult() there for why) — never show that literal text to a member.
  if (/^\{.*\}$/.test(rawMessage.trim())) {
    return 'The account service is having a temporary problem on our end. Please try again in a few minutes.';
  }

  if (options?.includeRawOnFallback) {
    const prefix = options.fallbackPrefix ?? 'Something went wrong';
    return `${prefix}: ${rawMessage}`;
  }

  return 'Something went wrong. Please try again.';
}

/** Supabase's rate-limit message embeds the retry window, e.g. "...after 57 seconds." */
export function extractRetryAfterSeconds(rawMessage: string | undefined | null): number | null {
  if (!rawMessage) return null;
  const match = rawMessage.match(/after (\d+) seconds?/i);
  return match ? Number(match[1]) : null;
}
