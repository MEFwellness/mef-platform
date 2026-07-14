'use server';

/**
 * Read-only member actions for the persisted Longitudinal Health Profile,
 * the Universal Registry, and the Personal Health Timeline — the first
 * action-layer surface for supabase/migrations/00000000000040-043. RLS on
 * all three tables already scopes every read to the signed-in member's own
 * rows; these are thin `auth.getUser()` + data.ts wrappers, same shape as
 * every other member-facing action file.
 */

import { createClient } from '@/lib/supabase/server';
import { getMemberHealthProfile } from '@/lib/health-profile/data';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { listTimelineEvents } from '@/lib/timeline/data';
import type {
  HealthProfileSummary,
  HealthTimelineEvent,
  RegistryEntry,
} from '@mef/shared-types-contracts';

export async function getMyHealthProfileSummary(): Promise<HealthProfileSummary | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getMemberHealthProfile(supabase, user.id);
  return profile?.summary ?? null;
}

export async function getMyActiveRegistryFindings(): Promise<RegistryEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listRegistryEntriesForMember(supabase, user.id, { statusFilter: ['active'] });
}

export async function getMyTimelineEvents(limit = 100): Promise<HealthTimelineEvent[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listTimelineEvents(supabase, user.id, { limit });
}
