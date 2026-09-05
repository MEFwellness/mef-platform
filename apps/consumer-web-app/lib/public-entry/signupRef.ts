/**
 * THE SIGNUP LINK: a one-time, server-minted reference that carries a
 * finished arrival into the request that creates her account.
 *
 * WHY IT HAD TO EXIST, MEASURED RATHER THAN IMAGINED. On 2026-09-05 a real
 * phone finished the quiz at 09:06, tapped the create-account button at
 * 09:11, and confirmed the email at 09:12. The account came out bound to
 * nothing. Neither of the two joins that existed could reach it:
 *
 *   The BROWSER TOKEN join lives in the claim route, and the claim route
 *   needs somebody to be signed in. Between the button and the confirmation
 *   she is signed in nowhere, and the confirmation link opens in whatever
 *   browser her mail app uses, which holds no token of its own. The token
 *   sits in the browser that took the quiz, on a verify screen, signed out.
 *
 *   The EMAIL MATCH join needs an address on the finished session, and the
 *   email step on the result screen is optional. She skipped it, which is
 *   what most people do.
 *
 * So this route binds where neither of those can: server side, inside
 * signUp(), before any email is confirmed and before any browser holds a
 * session.
 *
 * THE RULE THIS SUPERSEDES, AND ONLY FOR THIS SHAPE. The standing rule was
 * that a browser may never name an arrival at signup, because anything a
 * browser can name, a browser can invent. That is exactly right about the
 * visitor token, which the browser mints itself, keeps forever and can
 * replay without limit. It is not true of this object, which the browser
 * receives rather than chooses:
 *
 *   SERVER MINTED. Issued by the server in the response that finished the
 *   quiz, from the platform's own random source, thirty two bytes wide. Not
 *   guessable and not walkable.
 *   SINGLE USE. Redeemed by one conditional UPDATE that only matches an
 *   unused row, so two requests carrying the same reference cannot both
 *   win.
 *   SESSION SPECIFIC. It names one finished arrival for its whole life.
 *   EXPIRING. See PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS.
 *   POWERLESS ALONE. Redeeming one can only ADD a bind that does not exist
 *   yet. First bind wins is enforced by member_public_entry_origin's own
 *   keys, so a reference to an arrival somebody else already claimed loses,
 *   finally, with nothing left to retry.
 *   NOT A SECRET ABOUT ANYBODY. It encodes no answer, no pattern, no email
 *   and no member. It is an opaque handle.
 *
 * WHAT IT IS STILL NOT. Proof of identity. It says "the browser that
 * finished this quiz is the browser that started this signup", which is a
 * statement about a device, and bind_method records it as exactly that.
 *
 * ONLY THE HASH IS STORED. The value itself lives in the response that
 * issued it and in the link in her browser, nowhere else. A copy of
 * public_entry_signup_refs is therefore not a bag of working references.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicEntrySessionRecord } from '@mef/shared-types-contracts';
import { bindOriginToSession, getSessionById } from './data';
import { isSignupRefShape } from './signupField';

/**
 * How long a reference stays redeemable.
 *
 * TWENTY FOUR HOURS, AND THE WINDOW ONLY HAS ONE JOB. It has to cover the
 * gap between tapping the button on the result screen and finishing the
 * signup form, which is normally two minutes and is occasionally "I will
 * do this tonight". It deliberately does NOT have to cover the email
 * confirmation, because the bind happens in the signup request itself and
 * is already done by the time any confirmation link is opened. That is the
 * whole point of this route, and it is why the window can be short.
 *
 * A day is also short enough that a reference left sitting in a browser
 * history, a screenshot or a shared link is dead by the next morning.
 */
export const PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** Thirty two bytes of platform randomness, url safe, so it can ride a query string untouched. */
function mintValue(): string {
  return randomBytes(32).toString('base64url');
}

/** What is stored. The reference itself is never written anywhere. */
export function hashSignupRef(ref: string): string {
  return createHash('sha256').update(ref, 'utf8').digest('hex');
}

/**
 * Issues one reference for one finished arrival.
 *
 * CALLED FROM THE COMPLETION, NOT FROM A RENDER AND NOT FROM THE TAP.
 * The `complete` action on /api/public-entry is the request that produces
 * her result, so it is an explicit thing she did rather than a page being
 * drawn, which is the standing rule about renders that write. Minting there
 * also means the reference is already in her browser's hands before she
 * taps anything, so tapping the button never waits on a network round trip
 * on a phone.
 *
 * NEVER THROWS. A reference that could not be issued costs this one route;
 * the email match and the browser token are both still there, and the
 * result screen must never fail because of a bind.
 */
export async function mintSignupRef(
  supabase: SupabaseClient,
  sessionId: string
): Promise<string | null> {
  try {
    const ref = mintValue();
    const now = Date.now();
    const { data, error } = await supabase
      .from('public_entry_signup_refs')
      .insert({
        ref_hash: hashSignupRef(ref),
        session_id: sessionId,
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS * HOUR_MS).toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error('mintSignupRef failed', error);
      return null;
    }
    // ONE LIVE REFERENCE PER ARRIVAL, and the newest is it. Somebody who
    // steps back through the questions, changes an answer and finishes
    // again gets a new result and a new reference, and the one that went
    // with the result she is no longer reading stops working. Done after
    // the insert so a failed sweep can never cost her a live reference, and
    // it also keeps this table from growing a row per re-finish.
    const { error: sweepError } = await supabase
      .from('public_entry_signup_refs')
      .delete()
      .eq('session_id', sessionId)
      .neq('id', (data as { id: string }).id);
    if (sweepError) console.error('mintSignupRef sweep failed', sweepError);
    return ref;
  } catch (err) {
    console.error('mintSignupRef threw', err);
    return null;
  }
}

/**
 * Every way redeeming a reference can end. Only the first one writes a row.
 *
 *   'bound'                 This call wrote the bind.
 *   'invalid'               Not the shape a reference has. Nothing was read
 *                           and nothing was spent.
 *   'not_found'             A well shaped reference that names nothing.
 *                           Forged, or from a purged arrival.
 *   'expired'               Past its window.
 *   'used'                  Already redeemed once. This is what the second
 *                           use of the same reference always gets.
 *   'member_already_bound'  She already has an arrival. First bind wins and
 *                           this route never overwrites, so the reference
 *                           is left unspent rather than burned for nothing.
 *   'session_taken'         The arrival belongs to another account. FINAL,
 *                           in exactly the sense the 2026-09-05 fix made
 *                           the browser claim final: nothing to retry, ever.
 *   'session_unfinished'    The arrival has no result to carry.
 *   'failed'                A read or a write genuinely broke.
 */
export type SignupRefOutcome =
  | 'bound'
  | 'invalid'
  | 'not_found'
  | 'expired'
  | 'used'
  | 'member_already_bound'
  | 'session_taken'
  | 'session_unfinished'
  | 'failed';

export interface SignupRefRedemption {
  bound: boolean;
  outcome: SignupRefOutcome;
  /** The arrival that was bound, so the caller can attach her attribution from the same row it just used. Null on every outcome but 'bound'. */
  session: PublicEntrySessionRecord | null;
}

/** The outcomes worth recording on the row. 'bound' and the three that mean a real reference was spent on nothing. */
const RECORDED: ReadonlySet<SignupRefOutcome> = new Set<SignupRefOutcome>([
  'bound',
  'session_taken',
  'session_unfinished',
  'failed',
]);

/**
 * Redeems one reference, at most once, for one member.
 *
 * THE ORDER OF THE CHECKS IS THE POINT.
 *
 *   1. Her own side of never-overwrite comes first, so a member who is
 *      already bound never burns a reference and never risks a second row.
 *   2. Redemption is ONE conditional UPDATE against `used_at is null` and a
 *      live expiry. That single statement is what makes single use a
 *      property of the database rather than of which request arrived first.
 *      Everything after it is working with a reference that is already
 *      spent, which is why a losing bind is final rather than retryable.
 *   3. Only then is the arrival read and bound, through the same insert
 *      every other route uses.
 *
 * NEVER THROWS, AND NEVER FAILS A SIGNUP. Creating the account is the thing
 * she came to do. A bind is a sentence Root gets to say afterwards, and
 * losing it must never cost her the account.
 */
export async function redeemSignupRef(
  supabase: SupabaseClient,
  input: { memberId: string; ref: string }
): Promise<SignupRefRedemption> {
  const ref = input.ref.trim();
  if (!isSignupRefShape(ref)) return { bound: false, outcome: 'invalid', session: null };

  try {
    const { data: existing, error: existingError } = await supabase
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('member_id', input.memberId)
      .maybeSingle();
    if (existingError) {
      console.error('redeemSignupRef member read failed', existingError);
      return { bound: false, outcome: 'failed', session: null };
    }
    if (existing) return { bound: false, outcome: 'member_already_bound', session: null };

    const hash = hashSignupRef(ref);
    const now = new Date().toISOString();

    const { data: spent, error: spendError } = await supabase
      .from('public_entry_signup_refs')
      .update({ used_at: now, used_by_member_id: input.memberId })
      .eq('ref_hash', hash)
      .is('used_at', null)
      .gt('expires_at', now)
      .select('id, session_id');

    if (spendError) {
      console.error('redeemSignupRef spend failed', spendError);
      return { bound: false, outcome: 'failed', session: null };
    }

    const row = (spent ?? [])[0] as { id: string; session_id: string } | undefined;
    if (!row) {
      // Nothing was spent. Which of the three reasons it was is worth
      // knowing and is worth nothing to the caller, so it is resolved here
      // and reported, never acted on.
      const { data: known } = await supabase
        .from('public_entry_signup_refs')
        .select('used_at, expires_at')
        .eq('ref_hash', hash)
        .maybeSingle();
      if (!known) return { bound: false, outcome: 'not_found', session: null };
      const dead = (known as { used_at: string | null }).used_at !== null;
      return { bound: false, outcome: dead ? 'used' : 'expired', session: null };
    }

    const session = await getSessionById(supabase, row.session_id);
    if (!session) return await settle(supabase, row.id, 'failed', null);
    if (!session.completedAt) return await settle(supabase, row.id, 'session_unfinished', null);

    const { outcome } = await bindOriginToSession(supabase, input.memberId, session, 'signup_link');
    if (outcome === 'claimed') return await settle(supabase, row.id, 'bound', session);
    // 'already_bound' can only happen if something bound her between the
    // check above and here, which is a correct outcome for her and a lost
    // reference for us. 'session_taken' is the honest final loss.
    if (outcome === 'already_bound') {
      return await settle(supabase, row.id, 'member_already_bound', null);
    }
    if (outcome === 'session_taken') return await settle(supabase, row.id, 'session_taken', null);
    return await settle(supabase, row.id, 'failed', null);
  } catch (err) {
    console.error('redeemSignupRef threw', err);
    return { bound: false, outcome: 'failed', session: null };
  }
}

/** Writes what redeeming resolved to onto the spent row, so a member with no arrival has an answer behind her instead of a silence. */
async function settle(
  supabase: SupabaseClient,
  id: string,
  outcome: SignupRefOutcome,
  session: PublicEntrySessionRecord | null
): Promise<SignupRefRedemption> {
  if (RECORDED.has(outcome)) {
    const { error } = await supabase
      .from('public_entry_signup_refs')
      .update({ outcome })
      .eq('id', id);
    if (error) console.error('redeemSignupRef outcome write failed', error);
  }
  return { bound: outcome === 'bound', outcome, session };
}
