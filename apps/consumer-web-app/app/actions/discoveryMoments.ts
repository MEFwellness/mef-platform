'use server';

/**
 * Root Presence System (Prompt 4), requirement 6: Discovery Moments. The
 * member's own view over a single, real, genuinely-new correlation
 * finding worth announcing — RLS (migration 143's member-own policies on
 * member_discovery_moments, plus the pre-existing member_pattern_states
 * policy this reads through lib/case-view/findings.ts) is what actually
 * scopes every read here to this member's own rows.
 */

import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { findNewDiscoveryCandidate, markDiscoveryCandidateSurfaced } from '@/lib/discovery-moments/service';
import type { FindingView } from '@/lib/case-view/types';

/**
 * Marks the finding surfaced the instant this action decides to return it
 * — same "write the moment it's decided to show, not only on an explicit
 * dismiss" precedent already used correctly by the Root pop-up system's
 * own offer-dismissal fix (app/actions/rootPopupMessages.ts). A member
 * who never taps the resulting card still only ever sees it announced
 * once; from the next render on it simply lives in Case View's own list,
 * exactly like every other earned finding.
 */
export async function getMyNewDiscoveryAction(): Promise<FindingView | null> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  const finding = await findNewDiscoveryCandidate(supabase, user.id);
  if (!finding) return null;

  await markDiscoveryCandidateSurfaced(supabase, user.id, finding);

  return finding;
}
