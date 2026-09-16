'use server';

/**
 * The Whole-Body Patterns section's one read.
 *
 * COACH ONLY, AND CHECKED HERE AS WELL AS IN THE DATABASE. The function
 * below establishes the caller as a coach or an administrator before it
 * reads anything, and then asks lib/staff/testAccounts.ts whether this
 * member may be shown to this viewer at all. Row level security is the
 * real boundary: migration 245 gives the ledger no member policy of any
 * kind, and migrations 240 and 243 do the same for the signals and the
 * definitions this reads.
 *
 * NOTHING HERE IS REACHABLE FROM A MEMBER SURFACE. There is no member
 * facing action in this file, no member facing route imports it, and a
 * member's own session could not read one of the three tables behind it
 * even if a screen tried to draw one.
 *
 * NOTHING HERE RUNS ON A RENDER, in the sense that matters: this is a
 * READ. It computes, it does not write. The ledger is written by the three
 * explicit events in lib/cross-system-patterns/evaluate.ts, never from
 * here, so opening a client's page cannot manufacture an evaluation and a
 * Next prefetch of the page cannot either.
 *
 * WHY IT COMPUTES RATHER THAN READING THE LEDGER BACK. One source of truth
 * per number: the pure matcher is that source, and the card a coach reads
 * is the matcher's own answer about her signals as they stand right now. A
 * card drawn from a stored row would be a second account of the same fact,
 * and the two would eventually disagree.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { listSignalsForMember } from '@/lib/cross-system-signals/data';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import { loadMemberContent } from '@/lib/body-systems/contentData';
import { listBodySystemsSessions } from '@/lib/body-systems/data';
import { matchMemberSignals } from '@/lib/cross-system-patterns/match';
import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import { buildWholeBodyPatternsView } from '@/lib/cross-system-patterns/view';
import type { WholeBodyPatternsView } from '@/lib/cross-system-patterns/types';

/** Everything the Whole-Body Patterns section draws, in one read. */
export type WholeBodyPatternsPanelState = {
  /** False for a caller who is not staff, so the section draws nothing rather than an empty library. */
  allowed: boolean;
  view: WholeBodyPatternsView;
};

const EMPTY_PANEL: WholeBodyPatternsPanelState = {
  allowed: false,
  view: { cards: [], patternCount: 0, suppressedCount: 0, activeRelationshipCount: 0 },
};

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}

/**
 * This member's signals, read against every ACTIVE definition, with the
 * safety override applied before a single card is built.
 *
 * THE FOUR READS, and why each is here:
 *
 *   her stored signals, which are what a definition is tested against;
 *   the definitions, filtered to the active ones by the matcher itself;
 *   her finished Body Systems sittings, for their red flag answers;
 *   the survey's own flag and safety level rows, so the existing red flag
 *     layer decides what fired rather than this feature guessing.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 */
export async function getClientWholeBodyPatternsAction(
  clientId: string
): Promise<WholeBodyPatternsPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [signalRead, relationshipRead, sittingRead, content] = await Promise.all([
    listSignalsForMember(supabase, clientId),
    listRelationships(supabase),
    listBodySystemsSessions(supabase, clientId),
    loadMemberContent(supabase),
  ]);

  const active = relationshipRead.summaries.filter((summary) => summary.head.isActive);

  // THE SAFETY OVERRIDE IS RESOLVED BEFORE ANY CARD IS BUILT, and it is
  // the survey's own layer that decides which sittings fired.
  const flaggedSittings = flaggedSittingIds(
    sittingRead.records.map((record) => ({
      sittingId: record.id,
      redFlagAnswers: record.redFlagAnswers,
    })),
    content.redFlags,
    content.safetyLevels
  );
  const flaggedSignals = redFlaggedSignalIds(signalRead.records, flaggedSittings);

  return {
    allowed: true,
    view: buildWholeBodyPatternsView({
      matches: matchMemberSignals(active, signalRead.records),
      records: signalRead.records,
      flaggedSignalIds: flaggedSignals,
      activeRelationshipCount: active.length,
    }),
  };
}
