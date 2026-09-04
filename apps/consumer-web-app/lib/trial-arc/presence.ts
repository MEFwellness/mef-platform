/**
 * One read of member_return_greetings (migration 143), so the arc can tell
 * whether Root Presence is speaking on this visit without ever claiming the
 * greeting for itself.
 *
 * WHY THIS IS NOT tryMarkReturnGreetingShown. That function is the atomic
 * CLAIM, and it is owned by the Morning Brief. Calling it from here would
 * spend the greeting: the arc would learn that the gap was ungreeted by
 * greeting it, and the member would never see the sentence, because nothing
 * in this feature renders it. So this reads the same row and writes
 * nothing.
 *
 * KEYED ON THE GAP EPISODE, exactly as the claim is: gap_start_local_date
 * is her last real check-in date before the gap. A later, genuinely new gap
 * has a different key and is a different episode, which is why this takes
 * the date rather than answering "has she ever been greeted".
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** When the greeting for this gap episode was shown, or null when it has not been. */
export async function lastReturnGreetingForGap(
  supabase: SupabaseClient,
  memberId: string,
  gapStartLocalDate: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('member_return_greetings')
    .select('shown_at')
    .eq('member_id', memberId)
    .eq('gap_start_local_date', gapStartLocalDate)
    .maybeSingle();

  if (error) {
    console.error('lastReturnGreetingForGap failed', error);
    // Fail towards silence for the arc: an unreadable greeting row is not
    // evidence that nothing is about to greet her, and the wrong direction
    // here is two welcomes on one screen.
    return null;
  }
  return (data as { shown_at: string | null } | null)?.shown_at ?? null;
}
