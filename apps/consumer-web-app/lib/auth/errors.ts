/**
 * Maps raw Supabase GoTrue error messages to member-friendly copy. Supabase
 * doesn't expose stable error codes through supabase-js on every version in
 * use here, so this matches on the (versioned, but slow-changing) message
 * text GoTrue actually returns rather than an error code.
 */
export function getFriendlyAuthError(rawMessage: string | undefined | null): string {
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
  if (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network')
  ) {
    return 'Unable to connect. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}

/** Supabase's rate-limit message embeds the retry window, e.g. "...after 57 seconds." */
export function extractRetryAfterSeconds(rawMessage: string | undefined | null): number | null {
  if (!rawMessage) return null;
  const match = rawMessage.match(/after (\d+) seconds?/i);
  return match ? Number(match[1]) : null;
}
