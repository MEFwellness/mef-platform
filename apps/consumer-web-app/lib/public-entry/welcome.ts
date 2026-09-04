/**
 * Whether Root has something to say to this member about how she arrived,
 * and what.
 *
 * ONE ACCESSOR, ONE RULE. The condition is "she came in through the public
 * entry experience AND she has not yet completed her Baseline Assessment",
 * and it lives here rather than being spelled out in the pop-up chain, for
 * the same reason every other gate in that chain lives behind one accessor:
 * the branch asks one question, the answer is decided in one place, and a
 * test can put a member on either side of it without standing up two
 * unrelated fakes.
 *
 * THE CLOSER IS THE BASELINE, NOT A DISMISSAL. The whole message is an
 * invitation to start the real assessment, so the moment one exists there
 * is nothing to invite her to and this returns null whether or not she ever
 * dismissed the pop-up. A rule that only fires while something is missing
 * needs the thing arriving to end it.
 *
 * WHAT IT MAY SAY. The pattern her nine public answers resolved to, named
 * as the first impression it is. It reads member_public_entry_origin, whose
 * own `origin` and `preliminary` columns are check-constrained by the
 * database to say exactly that (migration 197). It does not read
 * public_entry_answers, and nothing downstream of it carries a public
 * answer into an assessment.
 *
 * THE TRIAL ARC HANDOVER (2026-09-04). For an account the trial arc is
 * genuinely launched for, this handshake is day 1 of her paced week: it
 * carries the arc's framing, points at Core Values Snapshot as the week's
 * first step, and is recorded on the arc's own delivery receipt under the
 * arc's own key. From day 2 onward it stands down entirely, because the
 * week is what speaks to her and this message, whose closer is "she has no
 * Baseline Assessment yet", would otherwise win the single pop-up slot
 * every morning until she had one and the arc would never say a word.
 *
 * NOTHING CHANGES FOR ANYBODY ELSE. `arc` is null for every account outside
 * the arc, which today is every account in the system, and the message,
 * the copy, the closer and the button are exactly what they were.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicEntryArcHandover, TrialArcMessage } from '../trial-arc/engine';
import { ENERGY_PATTERN_COPY } from './copy';
import { getMemberOrigin } from './data';

export type PublicEntryWelcome = {
  /** The public arrival this member came from. The pop-up's message key is built from it, so a dismissal is scoped to this one arrival. */
  readonly sessionId: string;
  /** Null when she created an account without finishing the nine questions. The copy branches on that rather than inventing something to have noticed. */
  readonly patternTitle: string | null;
  /**
   * The trial arc's day 1 message, when this welcome is carrying it. Null
   * for every account outside the arc, and the pop-up then renders exactly
   * the copy and the button it always has.
   */
  readonly arc: TrialArcMessage | null;
};

export async function getPublicEntryWelcome(
  supabase: SupabaseClient,
  memberId: string,
  arc: PublicEntryArcHandover = null
): Promise<PublicEntryWelcome | null> {
  // The arc owns this account's week and today is not its first day. See
  // this file's header: standing down here is what stops a message with no
  // closer from starving a paced sequence that has one.
  if (arc?.kind === 'retired') return null;

  const origin = await getMemberOrigin(supabase, memberId);
  if (!origin) return null;

  // Existence check, not maybeSingle: onboarding_submissions has no unique
  // constraint on user_id by design (lib/onboarding/baseline.ts), so a
  // reassessment adding a second row must never turn this into an error.
  const { data, error } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', memberId)
    .limit(1);
  if (error) {
    // Fail towards silence. An unreadable submissions table is not evidence
    // that she has no baseline, and the wrong direction here is Root
    // inviting somebody to start something she already finished.
    console.error('getPublicEntryWelcome baseline read failed', error);
    return null;
  }
  if ((data ?? []).length > 0) return null;

  return {
    sessionId: origin.sessionId,
    patternTitle: origin.patternKey ? ENERGY_PATTERN_COPY[origin.patternKey].title : null,
    arc: arc?.kind === 'day_one' ? arc.message : null,
  };
}
