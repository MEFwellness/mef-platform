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
