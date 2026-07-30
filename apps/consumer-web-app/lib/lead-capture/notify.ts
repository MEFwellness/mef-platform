/**
 * Notifies every active coach when a lead's email is captured, reusing
 * the existing generic in-app notifications table/helper
 * (lib/notifications/data.ts's insertNotification, migration 39/45/53,
 * extended by migration 123 with a 'new_lead_captured' type) rather than
 * building a parallel notification mechanism. There is no existing
 * "list all active coaches" data-access helper outside a 'use server'
 * admin action file (app/actions/admin.ts's listActiveCoachUserIds, which
 * can't be imported here — it uses the cookie-scoped client and this
 * route runs with the service-role client) — same query, duplicated here
 * as a plain function taking a client, matching this file's own
 * conventions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotification } from '@/lib/notifications/data';
import type { LeadTopic, LeadTemperature } from '@mef/shared-types-contracts';

async function listActiveCoachUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'coach')
    .is('revoked_at', null);

  if (error) {
    console.error('lead-capture: listActiveCoachUserIds failed', error);
    return [];
  }
  return (data ?? []).map((row) => row.user_id as string);
}

export async function notifyCoachesOfNewLead(
  supabase: SupabaseClient,
  lead: {
    firstName: string | null;
    email: string;
    topic: LeadTopic | null;
    leadTemperature: LeadTemperature | null;
    capturedLeadId: string;
  }
): Promise<void> {
  const coachIds = await listActiveCoachUserIds(supabase);
  if (coachIds.length === 0) {
    console.error('lead-capture: no active coach found to notify about a new lead');
    return;
  }

  const name = lead.firstName ?? 'A new lead';
  const topicLabel = lead.topic ?? 'general';
  const temperatureLabel = lead.leadTemperature === 'hot' ? 'Hot' : 'Warm';
  const title = `${temperatureLabel} lead: ${name} (${topicLabel})`;
  const body = `${name} (${lead.email}) came in through the Lead Capture Agent about ${topicLabel}.`;

  await Promise.all(
    coachIds.map((coachId) =>
      insertNotification(supabase, {
        memberId: coachId,
        type: 'new_lead_captured',
        title,
        body,
        sourceFeature: 'lead_capture',
        sourceRecordId: lead.capturedLeadId,
      })
    )
  );
}
