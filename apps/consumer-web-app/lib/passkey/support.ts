/**
 * Whether this browser can actually complete a Face ID / fingerprint /
 * device-PIN passkey ceremony right now — not just whether the WebAuthn API
 * exists (every modern browser has that), but whether a *platform*
 * authenticator (the device's own biometric/PIN, as opposed to a separate
 * security key) is available. That's the specific thing "Face ID Login"
 * promises, so that's the specific thing this checks.
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof window.PublicKeyCredential === 'undefined') return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    // Some browsers throw rather than resolve false in locked-down contexts
    // (e.g. a cross-origin iframe) — either way, there is nothing to offer.
    return false;
  }
}
