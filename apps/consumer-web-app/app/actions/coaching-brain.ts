'use server';

/**
 * The Coaching Brain's two session-scoped entry points.
 *
 * The composition itself — lib/brain/service.ts's content-agnostic Daily
 * Decision Object combined with today's actually-selected MefContentItem,
 * to produce the full object the milestone describes (Focus, Reason,
 * Coaching Mode, Challenge Level, Lesson, Action, Reflection Prompt,
 * Coach Insight, Encouragement, Risk Level) — now lives in
 * lib/brain/composition.ts, because it has a third caller that has no
 * session at all: the daily notification job, which runs on a schedule
 * under the service role. A 'use server' module may not export a function
 * taking a SupabaseClient, so the shared piece had to move somewhere a
 * plain library could reach. Nothing either of these returns changed.
 *
 * These two remain here because each is exactly the thing a 'use server'
 * module is for: resolve WHO is asking from the session, and WHEN in
 * their own timezone, then hand both to the shared composition.
 */

import { createClient, getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from './checkin';
import { getFullCoachingDecision, type CoachingDecision } from '@/lib/brain/composition';
import { memberTimezone } from '@/lib/time/memberToday';

export type { CoachingDecision };

async function currentMemberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  timezoneOverride?: string
): Promise<string> {
  const timezone = timezoneOverride ?? (await memberTimezone(supabase, userId));
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

/**
 * The signed-in member's own full Daily Decision Object. `timezone` is an
 * optional caller-supplied value (e.g. the Dashboard already fetched its
 * own profile row), passing it skips this function's own redundant
 * profiles query for the exact same row; omit it and behavior is
 * unchanged from before.
 */
export async function getMyCoachingDecision(timezone?: string): Promise<CoachingDecision | null> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  const localDate = await currentMemberLocalDate(supabase, user.id, timezone);
  return getFullCoachingDecision(supabase, user.id, localDate);
}

/** A coach's read of a client's Daily Decision Object — RLS (the same policies lib/feed/service.ts and lib/narrative/data.ts already rely on) is what actually authorizes this; an unassigned clientId simply yields empty signals throughout. */
export async function getClientCoachingDecision(
  clientId: string
): Promise<CoachingDecision | null> {
  const supabase = createClient();
  // The row's EXISTENCE is the guard here, not its timezone: a coach who
  // cannot read this client at all gets no row back and no decision. That
  // is a different question from "what is her timezone", so this one read
  // deliberately stays rather than folding onto memberTimezone.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (!profile) return null;

  const localDate = await resolveLocalDate(
    new Date(
      new Date().toLocaleString('en-US', { timeZone: await memberTimezone(supabase, clientId) })
    ),
    false
  );
  return getFullCoachingDecision(supabase, clientId, localDate);
}
