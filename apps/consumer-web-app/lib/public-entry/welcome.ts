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
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ENERGY_PATTERN_COPY } from './copy';
import { getMemberOrigin } from './data';

export type PublicEntryWelcome = {
  /** The public arrival this member came from. The pop-up's message key is built from it, so a dismissal is scoped to this one arrival. */
  readonly sessionId: string;
  /** Null when she created an account without finishing the nine questions. The copy branches on that rather than inventing something to have noticed. */
  readonly patternTitle: string | null;
};

export async function getPublicEntryWelcome(
  supabase: SupabaseClient,
  memberId: string
): Promise<PublicEntryWelcome | null> {
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
  };
}
