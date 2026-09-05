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
 *
 * THE SECOND READ, AND WHY IT IS NOT OPTIONAL (2026-09-04, found by driving
 * the presence collision on the live site). "There is no greeting row yet"
 * is NOT the same as "one is about to be written". The claim happens in one
 * place and one place only: the moment the Morning Brief for today is
 * CREATED (lib/coaching-engine/service.ts). If today's brief already exists,
 * nothing will claim the greeting today at all, and an arc that stayed
 * silent on the strength of a greeting that is never coming would leave the
 * member with neither message, on every visit, for the rest of the gap.
 *
 * So the arc yields only when the greeting is genuinely landing on this
 * visit: either it has already been claimed today, or it has not been
 * claimed and today's brief has not been written yet, which is the visit
 * that will write it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Whether today's Morning Brief has already been written, which is the only thing that ever claims the greeting. */
export async function morningBriefExistsToday(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('coach_morning_briefs')
    .select('member_id')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('morningBriefExistsToday failed', error);
    // Fail towards the arc staying silent, which is the direction that can
    // never put two welcomes on one screen.
    return false;
  }
  return data !== null;
}

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
