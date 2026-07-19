'use server';

/**
 * The MEF Wellness Intelligence Core's server actions (Milestone 9).
 * Mirrors app/actions/intelligence-engine.ts's shape exactly: recalculation
 * is cheap and safe to re-run on every coach page view, so "recalculate
 * then read" is used rather than a separate caching layer. The member
 * action (getMyWellnessIdentityHighlights) never returns confidence,
 * evidence, or domain codes — see lib/intelligence-core/memberView.ts.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import {
  recalculateIntelligenceCore,
  getIntelligenceCoreSummary,
} from '@/lib/intelligence-core/service';
import { listIdentityObservationsForMember } from '@/lib/intelligence-core/data';
import {
  toMemberWellnessHighlights,
  toMemberWellnessStorySummary,
} from '@/lib/intelligence-core/memberView';
import type {
  IntelligenceCoreSummary,
  MemberWellnessHighlight,
  MemberWellnessStorySummary,
} from '@/lib/intelligence-core/types';

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

async function currentCoachId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The signed-in member's own "Your Wellness Identity" — a handful of positive, plain-language patterns, never a score. */
export async function getMyWellnessIdentityHighlights(): Promise<MemberWellnessHighlight[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const observations = await listIdentityObservationsForMember(supabase, user.id, {
    statusFilter: ['active'],
  });
  return toMemberWellnessHighlights(observations);
}

/** The signed-in member's own Wellness Story summary — strengths, opportunities, priorities, recent wins, and motivation profile, run under the member's own session and stripped to plain-language titles only (see toMemberWellnessStorySummary). Recalculates first, same "cheap and safe to re-run" posture as getMyWellnessIdentityHighlights and every other member-facing intelligence action. */
export async function getMyWellnessStorySummary(): Promise<MemberWellnessStorySummary | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, user.id);
  await recalculateIntelligenceCore(supabase, user.id, localDate);
  const summary = await getIntelligenceCoreSummary(supabase, user.id, localDate);
  return toMemberWellnessStorySummary(summary);
}

/** The coach's full Intelligence Core summary for a client — RLS (migration 36, plus every table this composes) is what actually authorizes this, same trust boundary as getClientIntelligenceReport. */
export async function getClientIntelligenceCoreSummary(
  clientId: string
): Promise<IntelligenceCoreSummary | null> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return null;

  const localDate = await localDateFor(supabase, clientId);
  await recalculateIntelligenceCore(supabase, clientId, localDate);
  return getIntelligenceCoreSummary(supabase, clientId, localDate);
}

/** Explicit recalculation trigger — same recalculation getClientIntelligenceCoreSummary already runs on every page view, triggered on demand instead. */
export async function requestIntelligenceCoreRecalculation(
  clientId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId(supabase);
  if (!coachId) return { error: 'Not signed in.' };

  const localDate = await localDateFor(supabase, clientId);
  await recalculateIntelligenceCore(supabase, clientId, localDate);
  return {};
}
