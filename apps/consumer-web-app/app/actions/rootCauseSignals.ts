'use server';

/**
 * Coach Dashboard — Root Cause Signals (Prompt 6). Coach-only, same trust
 * boundary as app/actions/intelligence-engine.ts: RLS on every table this
 * composes (registry_entries, intelligence_profile_snapshots,
 * reassessment_schedules) is the real authorization, this action makes no
 * role decision of its own beyond confirming a coach session exists.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveLocalDate } from './checkin';
import { buildMemberIntelligence } from '@/lib/intelligence-engine/engine';
import {
  buildRootCauseSignalsView,
  type RootCauseSignalsView,
} from '@/lib/intelligence-engine/rootCauseSignals';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { listPendingReassessments } from '@/lib/reassessment-intelligence/data';

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

export async function getClientRootCauseSignals(
  clientId: string
): Promise<RootCauseSignalsView | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, clientId);
  const [report, allRegistryEntries, activeRegistryEntries, pendingReassessments] =
    await Promise.all([
      buildMemberIntelligence(supabase, clientId, localDate),
      listRegistryEntriesForMember(supabase, clientId),
      listRegistryEntriesForMember(supabase, clientId, { statusFilter: ['active'] }),
      listPendingReassessments(supabase, clientId),
    ]);

  return buildRootCauseSignalsView(
    report,
    allRegistryEntries,
    activeRegistryEntries,
    pendingReassessments.map((r) => ({
      assessmentKey: r.assessmentKey,
      displayName: r.displayName,
      reason:
        r.triggerSource === 'finding_change'
          ? 'Suggested after recent worsening findings.'
          : `Due ${new Date(r.dueAt).toLocaleDateString()}.`,
    }))
  );
}
