/**
 * The one thing the signup form tells the server about this browser's
 * public entry arrival.
 *
 * IT SAYS "YES" OR "NO", AND NOTHING ELSE. Not the token, not a session id,
 * not a source code. The browser is not allowed to name an arrival at
 * signup, for exactly the reason the claim route does not let it either:
 * anything a browser can name, a browser can invent. The only question it
 * answers is whether it is holding a visitor token of its own, and the only
 * decision that answer makes is whether the server falls back to matching
 * her lead by email address.
 *
 * WHEN IT SAYS YES, the browser-carried attribution wins and the email
 * match is skipped, so the claim in the root layout binds her to the
 * arrival she actually took. When it says no, the email match is the only
 * join left. Claiming "yes" falsely costs an attribution row; it can never
 * attach anybody to anything.
 *
 * A field name in its own file so the form that writes it and the action
 * that reads it cannot spell it two ways.
 */
export const PUBLIC_ENTRY_TOKEN_FIELD = 'publicEntryArrival';

/** What the form puts in the field. Only 'yes' is read as yes, so a missing field is safely "no token here". */
export function publicEntryArrivalValue(hasToken: boolean): 'yes' | 'no' {
  return hasToken ? 'yes' : 'no';
}
