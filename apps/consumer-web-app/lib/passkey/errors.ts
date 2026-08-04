/**
 * Passkey ceremonies raise two different kinds of error, both surfaced the
 * same way by supabase-js (`{ data: null, error }`): a `WebAuthnError`
 * (something about the *browser-side* ceremony — the member cancelled, the
 * device has no biometric enrolled, the request timed out) or a plain
 * `AuthError` (the *server* rejected it — passkeys not enabled for this
 * project yet, too many saved, etc.). Matched here by shape (`.code`,
 * `.message`) rather than the `WebAuthnError`/`isWebAuthnError` exports,
 * which @supabase/supabase-js does not re-export at the top level this app
 * imports from — see lib/auth/errors.ts's own header comment for the same
 * message-matching convention used for password auth.
 */

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

function codeOf(error: unknown): string | null {
  const code = (error as ErrorLike | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

function messageOf(error: unknown): string {
  const message = (error as ErrorLike | null | undefined)?.message;
  return typeof message === 'string' ? message : '';
}

/**
 * True when the member simply backed out — tapped "Cancel" on the Face ID
 * sheet, let it time out, or the OS declined without the member ever seeing
 * a prompt (e.g. no passkey saved for this site). None of these are errors
 * from the member's point of view; the login screen should just go quiet
 * and land back on the normal form, per this feature's own "no error drama"
 * requirement.
 */
export function isPasskeyCancelled(error: unknown): boolean {
  const code = codeOf(error);
  if (code === 'ERROR_CEREMONY_ABORTED') return true;
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
}

/** Maps a passkey registration/sign-in error to member-friendly copy. */
export function getFriendlyPasskeyError(error: unknown): string {
  const code = codeOf(error);

  switch (code) {
    case 'passkey_disabled':
      return "Face ID Login isn't turned on for this account yet. Please check back soon.";
    case 'too_many_passkeys':
      return "You've saved the most Face ID logins this account allows. Remove one to add another.";
    case 'webauthn_credential_exists':
      return 'This device is already set up for Face ID Login.';
    case 'webauthn_challenge_expired':
      return 'That took a little too long. Please try Face ID again.';
    case 'webauthn_verification_failed':
      return "We couldn't confirm that. Please try Face ID again.";
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
      return 'Please verify your email before signing in.';
    case 'user_banned':
      return 'This account is not available right now.';
    default:
      break;
  }

  const message = messageOf(error).toLowerCase();
  if (message.includes('not supported') || message.includes('not allowed')) {
    return "Face ID isn't available on this device right now.";
  }

  return 'Face ID did not go through. Please try again or use your password.';
}
