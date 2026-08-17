'use server';

/**
 * The friction question's one write.
 *
 * Session-scoped client, RLS as the real authorization boundary: migration
 * 150 already grants a member update on her own `member_coaching_decisions`
 * rows and nobody else's, so this action does not re-check ownership, it
 * relies on the policy. Same trust boundary every other member action here
 * uses.
 *
 * Validation is narrow on purpose. The reason must be one of the five in the
 * closed set, which the database also enforces as a check constraint, so a
 * value that got past this could still not be stored. The note is her own
 * words, trimmed and length-capped, and is never parsed: the ENGINE reads
 * only the tapped reason (see lib/coaching-direction/friction.ts's
 * `approachForFrictionReason`), so free text can never become a decision
 * about her.
 */

import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from './checkin';
import { isFrictionReason } from '@/lib/coaching-direction/friction';
import { recordFrictionAnswer } from '@/lib/coaching-direction/frictionData';

export async function answerPriorityFrictionAction(
  reason: string,
  note: string | null
): Promise<{ ok: boolean }> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return { ok: false };

  if (!isFrictionReason(reason)) return { ok: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  const timezone = (profile as { timezone: string | null } | null)?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );

  const ok = await recordFrictionAnswer(supabase, user.id, localDate, reason, note);
  return { ok };
}
