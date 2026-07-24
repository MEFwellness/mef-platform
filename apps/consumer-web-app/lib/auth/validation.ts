const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export interface PasswordCheck {
  valid: boolean;
  message?: string;
}

/** Mirrors the signup form's existing minLength={8}, plus a minimal strength bar. */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one letter and one number.' };
  }
  return { valid: true };
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return confirmPassword.length > 0 && password === confirmPassword;
}

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

/**
 * The same two rules checkPasswordStrength() enforces on submit, broken
 * into individual checkmarks so a form can show what's still missing
 * *before* the member submits, instead of one combined error after a
 * failed attempt — see components/auth/PasswordStrengthHint.tsx.
 */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'A letter and a number', met: /[a-zA-Z]/.test(password) && /[0-9]/.test(password) },
  ];
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * A quick, unobtrusive visual read, not a security-scoring system —
 * rewards length and character variety beyond the bare minimum
 * checkPasswordStrength() requires, so a member typing a longer or more
 * varied password sees it reflected, without this ever being used to
 * block submission (checkPasswordStrength's binary valid/invalid is still
 * the only thing that gates the form).
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'weak';

  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^a-zA-Z0-9]/.test(password)) variety++;

  if (password.length >= 12 && variety >= 3) return 'strong';
  if (password.length >= 8 && variety >= 2) return 'fair';
  return 'weak';
}
