/**
 * What the signup form is allowed to tell the server about this browser's
 * public entry arrival, and why the answer changed on 2026-09-05.
 *
 * THE ORIGINAL RULE, WHICH STILL STANDS FOR THE VISITOR TOKEN.
 * The form says YES or NO and nothing else: not the token, not a session
 * id, not a source code. Anything a browser can name, a browser can invent,
 * and the visitor token is the browser's own property. It mints it, it
 * keeps it forever, and it can replay it without limit, so letting a form
 * hand one over would let any page claim any arrival it could guess or
 * copy. That has not changed and is not going to. `publicEntryArrival` is
 * still a bare yes or no, and it still decides only whether the server
 * falls back to matching her by email address.
 *
 * WHAT THE RULE COULD NOT DO, FOUND ON A REAL PHONE.
 * A visitor finished the quiz at 09:06, tapped the create-account button at
 * 09:11, and confirmed her email at 09:12. Her account came out bound to
 * nothing. The form had truthfully said YES, so the email match was
 * skipped; the browser claim that YES was deferring to needs somebody to be
 * signed in, and nobody was, because the confirmation link opened in her
 * mail app's own browser, which holds no token. A yes or no is enough to
 * decide which fallback to run, and it is not enough to carry an arrival
 * across a browser boundary. Nothing here could have carried it, because by
 * design nothing here names anything.
 *
 * THE RULE IS THEREFORE SUPERSEDED FOR ONE SHAPE, AND ONLY THAT SHAPE.
 * The form may also carry a REFERENCE the server itself issued. Not a
 * value the browser chose: a value it was handed, in the response that
 * finished its quiz. It is single use, it names exactly one finished
 * arrival, it expires within a day, it is stored only as a hash, and
 * redeeming it can only ever ADD a bind that does not exist yet, because
 * first bind wins is enforced by member_public_entry_origin's own keys.
 * Every property that made the token unsafe to name is absent from it. The
 * whole of the reasoning, and the measurement behind it, is in
 * lib/public-entry/signupRef.ts and in migration 208.
 *
 * The distinction to hold on to: the browser is still not trusted to say
 * WHICH arrival is hers. It is trusted only to hand back something the
 * server gave it, once, soon, and the server decides everything after that.
 *
 * Field and query names live in one file so the button that writes them,
 * the form that carries them and the action that reads them cannot spell
 * them three ways.
 */

export const PUBLIC_ENTRY_TOKEN_FIELD = 'publicEntryArrival';

/** What the form puts in the field. Only 'yes' is read as yes, so a missing field is safely "no token here". */
export function publicEntryArrivalValue(hasToken: boolean): 'yes' | 'no' {
  return hasToken ? 'yes' : 'no';
}

/**
 * The query parameter the create-account button on the result screen puts
 * the reference in, and the hidden field the signup form carries it
 * forward in. Short because it rides a URL a visitor can see.
 */
export const PUBLIC_ENTRY_REF_QUERY = 'k';
export const PUBLIC_ENTRY_REF_FIELD = 'publicEntryRef';

/**
 * The shape of a reference: url-safe base64 of thirty two random bytes,
 * which is forty three characters. Bounded either side so a hand-made
 * request cannot hand the database a megabyte to hash, and checked before
 * anything is read, so a malformed value costs one regex and no query.
 *
 * Shape is not authority. Passing this proves nothing at all except that
 * the value is worth looking up.
 */
export function isSignupRefShape(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** The reference a form carried, or null. Never throws, and never returns something malformed. */
export function readSignupRef(formData: FormData): string | null {
  const raw = formData.get(PUBLIC_ENTRY_REF_FIELD);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return isSignupRefShape(trimmed) ? trimmed : null;
}
