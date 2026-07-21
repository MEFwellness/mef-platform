'use server';

/**
 * Member Experience — "What We're Noticing" (Prompt 6). The member's own
 * view over their own active, member-visible Universal Registry findings —
 * RLS (migration 40's member_read_own_registry_entries) is what actually
 * restricts this to member_visible=true, status='active' rows; this
 * action makes no additional visibility decision of its own.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { suggestAssessmentsFromFindings } from '@/lib/assessment-registry/findingRecommendations';
import {
  buildMemberFacingNoticing,
  type MemberNoticingView,
} from '@/lib/intelligence-engine/memberFacingNoticing';

export async function getMyNoticingView(): Promise<MemberNoticingView | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const entries = await listRegistryEntriesForMember(supabase, user.id);
  const activeFindings = entries.filter((e) => e.status === 'active' && e.entry_kind === 'finding');
  const suggestions = suggestAssessmentsFromFindings(activeFindings);

  return buildMemberFacingNoticing(entries, suggestions);
}
