/**
 * lib/passkey/errors.ts — pure unit tests. Local Supabase's GoTrue (the
 * Docker image this repo's supabase/config.toml pulls) predates passkey
 * support entirely, so the real cancel/WebAuthn-ceremony path can only be
 * driven against a project with passkeys enabled — which, per this task's
 * own instructions, means production, which this session is not allowed to
 * log into or test against. Confirmed instead, by hand, that the *disabled*
 * path (registerPasskey() against local Supabase, which behaves the same
 * way a not-yet-enabled production project would) surfaces exactly the
 * `passkey_disabled` copy this file pins below — see BUILD_STATUS.md for
 * that walkthrough. These tests cover the rest of the mapping table plus
 * the "no error drama" cancel/timeout detection directly, against the
 * documented Supabase error shapes.
 */
import { describe, expect, it } from 'vitest';
import { getFriendlyPasskeyError, isPasskeyCancelled } from '../lib/passkey/errors';

describe('isPasskeyCancelled — given error shape X, the decision is always Y', () => {
  it('treats the documented WebAuthn ceremony-aborted code as a cancel', () => {
    expect(isPasskeyCancelled({ code: 'ERROR_CEREMONY_ABORTED' })).toBe(true);
  });

  it('treats a raw DOMException-style NotAllowedError (member declined/timed out) as a cancel', () => {
    expect(isPasskeyCancelled({ name: 'NotAllowedError' })).toBe(true);
  });

  it('treats a raw DOMException-style AbortError as a cancel', () => {
    expect(isPasskeyCancelled({ name: 'AbortError' })).toBe(true);
  });

  it('does not treat a server-side rejection as a cancel', () => {
    expect(isPasskeyCancelled({ code: 'passkey_disabled' })).toBe(false);
  });

  it('does not treat a genuine verification failure as a cancel', () => {
    expect(isPasskeyCancelled({ code: 'webauthn_verification_failed' })).toBe(false);
  });

  it('handles null/undefined/non-object input without throwing', () => {
    expect(isPasskeyCancelled(null)).toBe(false);
    expect(isPasskeyCancelled(undefined)).toBe(false);
    expect(isPasskeyCancelled('nope')).toBe(false);
  });
});

describe('getFriendlyPasskeyError — pinned copy per documented Supabase error code', () => {
  it('passkey_disabled — the "flip the dashboard toggle" case', () => {
    expect(getFriendlyPasskeyError({ code: 'passkey_disabled' })).toBe(
      "Face ID Login isn't turned on for this account yet. Please check back soon."
    );
  });

  it('too_many_passkeys', () => {
    expect(getFriendlyPasskeyError({ code: 'too_many_passkeys' })).toMatch(/most Face ID logins/);
  });

  it('webauthn_credential_exists', () => {
    expect(getFriendlyPasskeyError({ code: 'webauthn_credential_exists' })).toBe(
      'This device is already set up for Face ID Login.'
    );
  });

  it('webauthn_challenge_expired', () => {
    expect(getFriendlyPasskeyError({ code: 'webauthn_challenge_expired' })).toMatch(/too long/);
  });

  it('webauthn_verification_failed', () => {
    expect(getFriendlyPasskeyError({ code: 'webauthn_verification_failed' })).toMatch(/try Face ID again/);
  });

  it('falls back to a generic, calm message for an unrecognized code', () => {
    expect(getFriendlyPasskeyError({ code: 'something_new_supabase_added' })).toBe(
      'Face ID did not go through. Please try again or use your password.'
    );
  });

  it('falls back the same way for a completely malformed error value', () => {
    expect(getFriendlyPasskeyError(null)).toBe(
      'Face ID did not go through. Please try again or use your password.'
    );
    expect(getFriendlyPasskeyError('a plain string')).toBe(
      'Face ID did not go through. Please try again or use your password.'
    );
  });

  it('every mapped message is non-empty and contains no em dash', () => {
    const codes = [
      'passkey_disabled',
      'too_many_passkeys',
      'webauthn_credential_exists',
      'webauthn_challenge_expired',
      'webauthn_verification_failed',
      'email_not_confirmed',
      'user_banned',
      'unknown_code',
    ];
    for (const code of codes) {
      const message = getFriendlyPasskeyError({ code });
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('—');
    }
  });
});
