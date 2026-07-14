'use server';

/**
 * The Personal Wellness Intelligence Engine's server actions — the
 * reusable entry points the member-facing "Your Wellness Patterns"
 * section and the coach's Personal Wellness Intelligence panel both call
 * instead of reading `wellness_insights` directly. Recalculation is
 * cheap and idempotent-by-content (see lib/intelligence/service.ts's
 * docblock), so both surfaces simply recalculate then read, the same
 * "re-reads instead of regenerating" posture lib/feed/service.ts already
 * established for the Daily Coaching Feed.
 */

import { createClient } from '@/lib/supabase/server';
import type { WellnessInsight } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import { recalculateWellnessIntelligence } from '@/lib/intelligence/service';
import {
  listInsightsForMember,
  setInsightStatus,
  setInsightPinned,
  setInsightCoachContext,
} from '@/lib/intelligence/data';

async function localDateFor(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  const timezone = profile?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

const MEMBER_VISIBLE_STATUSES = ['active', 'confirmed'] as const;
/** Section 8: a restrained handful, never a dashboard — at most one improvement, one priority/pattern concern, and one meaningful pattern. */
const MAX_MEMBER_INSIGHTS = 3;

/** The signed-in member's own restrained "Your Wellness Patterns" set. */
export async function getMyWellnessPatterns(): Promise<WellnessInsight[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, user.id);
  await recalculateWellnessIntelligence(supabase, user.id, localDate);

  const all = await listInsightsForMember(supabase, user.id, {
    statusFilter: [...MEMBER_VISIBLE_STATUSES],
  });
  const visible = all.filter((i) => i.member_visible && i.insight_type !== 'priority_summary');

  const improvement = visible.find(
    (i) => i.trend_state === 'improving' || i.trend_state === 'resolved_or_inactive'
  );
  const priority = visible.find(
    (i) =>
      i.trend_state === 'declining' ||
      i.trend_state === 'recurring_pattern' ||
      i.trend_state === 'newly_emerging'
  );
  const pattern = visible.find(
    (i) => i.insight_type === 'pattern' || i.insight_type === 'strength'
  );

  const picked = [improvement, priority, pattern].filter(
    (i): i is WellnessInsight => i !== undefined
  );
  const deduped = picked.filter(
    (insight, index) => picked.findIndex((i) => i.id === insight.id) === index
  );

  if (deduped.length >= MAX_MEMBER_INSIGHTS) return deduped.slice(0, MAX_MEMBER_INSIGHTS);
  for (const insight of visible) {
    if (deduped.length >= MAX_MEMBER_INSIGHTS) break;
    if (!deduped.some((i) => i.id === insight.id)) deduped.push(insight);
  }
  return deduped;
}

/** The coach's full Personal Wellness Intelligence view of a client — every insight, including coach-only ones; RLS (migration 31) is what actually authorizes this. */
export async function getClientWellnessIntelligence(clientId: string): Promise<WellnessInsight[]> {
  const supabase = createClient();
  const localDate = await localDateFor(supabase, clientId);
  await recalculateWellnessIntelligence(supabase, clientId, localDate);
  return listInsightsForMember(supabase, clientId);
}

/** Section 9's "request recalculation when appropriate" — same recalculation, triggered explicitly rather than incidentally by a page view. */
export async function requestWellnessIntelligenceRecalculation(
  clientId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const localDate = await localDateFor(supabase, clientId);
  await recalculateWellnessIntelligence(supabase, clientId, localDate);
  return {};
}

async function currentCoachId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function confirmInsightAction(insightId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await setInsightStatus(supabase, insightId, 'confirmed', coachId);
  return ok ? {} : { error: 'Could not confirm this insight.' };
}

export async function dismissInsightAction(insightId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await setInsightStatus(supabase, insightId, 'dismissed', coachId);
  return ok ? {} : { error: 'Could not dismiss this insight.' };
}

export async function resolveInsightAction(insightId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await setInsightStatus(supabase, insightId, 'resolved', coachId);
  return ok ? {} : { error: 'Could not mark this insight resolved.' };
}

export async function pinInsightAction(insightId: string, pinned: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await setInsightPinned(supabase, insightId, pinned, coachId);
  return ok ? {} : { error: 'Could not update this insight.' };
}

export async function addInsightCoachContextAction(
  insightId: string,
  context: string
): Promise<ActionResult> {
  const trimmed = context.trim();
  if (!trimmed) return { error: 'Context cannot be empty.' };

  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await setInsightCoachContext(supabase, insightId, trimmed, coachId);
  return ok ? {} : { error: 'Could not save this context.' };
}
