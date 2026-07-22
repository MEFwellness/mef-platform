/**
 * Pure-logic unit tests for the auth hardening work: client-side validation,
 * Supabase error-message friendliness mapping, and the resend-cooldown
 * timer's persistence math. These have no Supabase dependency (unlike
 * tests/auth.test.ts), but still load through the shared vitest setup file,
 * so a local Supabase instance must be running to execute this file too.
 */
import { describe, it, expect } from 'vitest';
import { isValidEmail, checkPasswordStrength, passwordsMatch } from '../lib/auth/validation';
import { getFriendlyAuthError, extractRetryAfterSeconds } from '../lib/auth/errors';
import {
  readNextAllowedAt,
  writeNextAllowedAt,
  clearCooldown,
  secondsRemaining,
  type CooldownStorage,
} from '../lib/auth/resendCooldown';

function fakeStorage(): CooldownStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe('isValidEmail', () => {
  it('accepts a normal email', () => {
    expect(isValidEmail('member@example.com')).toBe(true);
  });

  it('rejects a string with no @', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('rejects a string with no domain', () => {
    expect(isValidEmail('member@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('checkPasswordStrength', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const result = checkPasswordStrength('abc123');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 characters/);
  });

  it('rejects a password with only letters', () => {
    const result = checkPasswordStrength('abcdefgh');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/letter and one number/);
  });

  it('rejects a password with only numbers', () => {
    const result = checkPasswordStrength('12345678');
    expect(result.valid).toBe(false);
  });

  it('accepts a password with letters and numbers of sufficient length', () => {
    const result = checkPasswordStrength('abcd1234');
    expect(result.valid).toBe(true);
    expect(result.message).toBeUndefined();
  });
});

describe('passwordsMatch', () => {
  it('returns true when both fields are identical and non-empty', () => {
    expect(passwordsMatch('Secret123', 'Secret123')).toBe(true);
  });

  it('returns false when confirm password is empty', () => {
    expect(passwordsMatch('Secret123', '')).toBe(false);
  });

  it('returns false when passwords differ', () => {
    expect(passwordsMatch('Secret123', 'Secret124')).toBe(false);
  });
});

describe('getFriendlyAuthError', () => {
  it('maps "User already registered" to a friendly duplicate-account message', () => {
    expect(getFriendlyAuthError('User already registered')).toMatch(/already exists/);
  });

  it('maps "Invalid login credentials" to a friendly incorrect-login message', () => {
    expect(getFriendlyAuthError('Invalid login credentials')).toBe('Incorrect email or password.');
  });

  it('maps a rate-limit message to a friendly cooldown message', () => {
    expect(
      getFriendlyAuthError('For security purposes, you can only request this after 57 seconds.')
    ).toMatch(/wait a moment/);
  });

  it('maps a network failure to a friendly connectivity message', () => {
    expect(getFriendlyAuthError('fetch failed')).toBe('Unable to connect. Please try again.');
  });

  it('falls back to a generic message for unrecognized errors', () => {
    expect(getFriendlyAuthError('some unrecognized internal error')).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('falls back to a generic message for null/undefined', () => {
    expect(getFriendlyAuthError(undefined)).toBe('Something went wrong. Please try again.');
    expect(getFriendlyAuthError(null)).toBe('Something went wrong. Please try again.');
  });
});

describe('extractRetryAfterSeconds', () => {
  it('extracts the seconds from a Supabase rate-limit message', () => {
    expect(
      extractRetryAfterSeconds('For security purposes, you can only request this after 42 seconds.')
    ).toBe(42);
  });

  it('returns null when no retry window is present', () => {
    expect(extractRetryAfterSeconds('Invalid login credentials')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extractRetryAfterSeconds(null)).toBeNull();
  });
});

describe('resend cooldown persistence', () => {
  it('returns 0 for an email with no stored cooldown', () => {
    const storage = fakeStorage();
    expect(readNextAllowedAt(storage, 'new@example.com')).toBe(0);
  });

  it('round-trips a stored next-allowed timestamp', () => {
    const storage = fakeStorage();
    const when = Date.now() + 60_000;
    writeNextAllowedAt(storage, 'Member@Example.com', when);
    expect(readNextAllowedAt(storage, 'member@example.com')).toBe(when);
  });

  it('clearCooldown removes the stored timestamp', () => {
    const storage = fakeStorage();
    writeNextAllowedAt(storage, 'member@example.com', Date.now() + 60_000);
    clearCooldown(storage, 'member@example.com');
    expect(readNextAllowedAt(storage, 'member@example.com')).toBe(0);
  });

  it('secondsRemaining rounds up and never goes negative', () => {
    const now = 1_000_000;
    expect(secondsRemaining(now + 30_500, now)).toBe(31);
    expect(secondsRemaining(now - 5_000, now)).toBe(0);
    expect(secondsRemaining(now, now)).toBe(0);
  });
});
