/**
 * Pure copy logic for the branded "Reset" entry animation's Stage 4
 * (Welcome), split out from components/entry/RootResetEntryAnimation.tsx
 * so it's unit-testable without rendering a 'use client' component.
 */
export function resetEntryGreetingLines(firstName: string | null | undefined): [string, string] {
  const name = firstName && firstName.trim().length > 0 ? firstName.trim() : null;
  return [name ? `Welcome back, ${name}.` : 'Welcome back.', "Let's begin your reset."];
}
