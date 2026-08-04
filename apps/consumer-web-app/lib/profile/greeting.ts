/**
 * The member's own first name for greetings/avatars — never a placeholder
 * like "there". Returns null when profiles.display_name is empty/unset;
 * every call site renders its own honest fallback for that case (see
 * greetingHeadline below for the canonical "no name" wording) instead of
 * inventing one. Never rewrites capitalization — used exactly as typed.
 */
export function firstNameFrom(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed.split(' ')[0]! : null;
}

/**
 * "Good afternoon, Sarah" once a name is on file, "Good afternoon." (period,
 * no comma, no name) until it is — the one fallback FIX 1 requires instead
 * of a placeholder word.
 */
export function greetingHeadline(greetingWord: string, firstName: string | null): string {
  return firstName ? `${greetingWord}, ${firstName}` : `${greetingWord}.`;
}
