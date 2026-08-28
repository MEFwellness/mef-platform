'use server';

/**
 * The MEF Intelligence Engine's server actions — the reusable entry
 * points the Coach Dashboard calls instead of reading
 * intelligence_profile_snapshots/intelligence_coach_alerts directly.
 * Mirrors app/actions/wellness-intelligence.ts's shape exactly:
 * recalculation is cheap and safe to re-run on every coach page view
 * (buildMemberIntelligence persists a fresh append-only snapshot and
 * upserts the alert queue), so this "recalculate then read" posture is
 * used rather than a separate caching layer.
 */

import { createClient } from '@/lib/supabase/server';
import type { IntelligenceCoachAlert } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import { buildMemberIntelligence } from '@/lib/intelligence-engine/engine';
import type { MemberIntelligenceReport } from '@/lib/intelligence-engine/types';
import {
  listCoachAlertsForMember,
  acknowledgeCoachAlert,
  resolveCoachAlert,
  dismissCoachAlert,
} from '@/lib/intelligence-engine/data';
import { memberTimezone } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

async function localDateFor(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const timezone = await memberTimezone(supabase, userId);
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

async function currentCoachId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/** The coach's full Intelligence Engine report for a client — RLS (migration 34, plus every table this composes) is what actually authorizes this, same trust boundary as getClientWellnessIntelligence. */
export async function getClientIntelligenceReport(
  clientId: string
): Promise<MemberIntelligenceReport | null> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return null;

  const localDate = await localDateFor(supabase, clientId);
  return buildMemberIntelligence(supabase, clientId, localDate);
}

/** Explicit recalculation trigger — same recalculation getClientIntelligenceReport already runs on every page view, triggered on demand instead. */
export async function requestIntelligenceRecalculation(clientId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return { error: 'Not signed in.' };

  const localDate = await localDateFor(supabase, clientId);
  await buildMemberIntelligence(supabase, clientId, localDate);
  return {};
}

export async function getClientCoachAlerts(clientId: string): Promise<IntelligenceCoachAlert[]> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return [];
  return listCoachAlertsForMember(supabase, clientId);
}

export async function acknowledgeCoachAlertAction(alertId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await acknowledgeCoachAlert(supabase, alertId, coachId);
  return ok ? {} : { error: 'Could not acknowledge this alert.' };
}

export async function resolveCoachAlertAction(
  alertId: string,
  note: string
): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await resolveCoachAlert(supabase, alertId, coachId, note.trim() || null);
  return ok ? {} : { error: 'Could not resolve this alert.' };
}

export async function dismissCoachAlertAction(alertId: string): Promise<ActionResult> {
  const supabase = createClient();
  const coachId = await currentCoachId();
  if (!coachId) return { error: 'Not signed in.' };
  const ok = await dismissCoachAlert(supabase, alertId, coachId);
  return ok ? {} : { error: 'Could not dismiss this alert.' };
}
