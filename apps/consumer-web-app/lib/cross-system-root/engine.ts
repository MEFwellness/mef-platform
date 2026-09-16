/**
 * RUNNING THE LOOKUP. The impure half, and the only place it touches a
 * database.
 *
 * A RENDER NEVER DECIDES ANYTHING, so none of this happens on one. It is
 * called by an explicit act: a member wrote a sentence, a coach wrote one
 * down, a sitting was ingested, or a map entry was saved or switched off.
 *
 * THE SAFETY OVERRIDE IS RESOLVED HERE, BEFORE ANY FINDING IS BUILT, by
 * asking the Body Systems Survey's own red flag layer through
 * lib/cross-system-patterns/safety.ts. Nothing in this folder defines a
 * flag, changes one or reads a keyword. A finding touching a flagged
 * response is built with no areas and no rows at all, so there is nothing
 * in the database for a screen to leak.
 *
 * BEST EFFORT AND NEVER THROWS, for the same reason ingestion is: this can
 * run while a member's own check-in is completing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listSignalsForMember } from '@/lib/cross-system-signals/data';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import { listBodySystemsSessions } from '@/lib/body-systems/data';
import { loadMemberContent } from '@/lib/body-systems/contentData';
import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import { signalLibraryServiceRoleClient } from '@/lib/cross-system-signals/serviceRole';
import { replaceFindings, type FindingTrigger } from './data';
import { lookupForComplaint } from './lookup';

export type LookupOutcome = {
  findings: number;
  skipped: null | 'no_service_role' | 'read_failed' | 'no_map_entries' | 'no_trigger_rows' | 'write_failed';
};

/**
 * One complaint, read against the whole Association Map.
 *
 * The trigger rows are named by FINGERPRINT rather than by id, because the
 * caller has just written them through an upsert that returns nothing for a
 * row that already existed, and re-running over one note must consult the
 * map about exactly the same rows the first run did.
 */
export async function runComplaintLookup(input: {
  memberId: string;
  reportId: string;
  triggerFingerprints: ReadonlySet<string>;
  trigger: FindingTrigger;
  noticedOn: string;
  noticedAt: string;
  client?: SupabaseClient;
}): Promise<LookupOutcome> {
  const supabase = input.client ?? signalLibraryServiceRoleClient();
  if (!supabase) return { findings: 0, skipped: 'no_service_role' };

  try {
    const [signalRead, relationshipRead, sittingRead, content] = await Promise.all([
      listSignalsForMember(supabase, input.memberId),
      listRelationships(supabase),
      listBodySystemsSessions(supabase, input.memberId),
      loadMemberContent(supabase),
    ]);
    if (!signalRead.ok || !relationshipRead.ok) return { findings: 0, skipped: 'read_failed' };

    const triggerIds = new Set(
      signalRead.records
        .filter(
          (record) =>
            record.ingestFingerprint !== null &&
            input.triggerFingerprints.has(record.ingestFingerprint)
        )
        .map((record) => record.id)
    );
    if (triggerIds.size === 0) return { findings: 0, skipped: 'no_trigger_rows' };

    // THE EXISTING RED FLAG LAYER DECIDES, not this feature.
    const flaggedSittings = flaggedSittingIds(
      sittingRead.records.map((record) => ({
        sittingId: record.id,
        redFlagAnswers: record.redFlagAnswers,
      })),
      content.redFlags,
      content.safetyLevels
    );
    const flaggedSignals = redFlaggedSignalIds(signalRead.records, flaggedSittings);

    const findings = lookupForComplaint(
      relationshipRead.summaries,
      triggerIds,
      signalRead.records,
      input.noticedOn,
      flaggedSignals
    );

    const written = await replaceFindings(supabase, {
      memberId: input.memberId,
      reportId: input.reportId,
      findings,
      trigger: input.trigger,
      noticedOn: input.noticedOn,
      noticedAt: input.noticedAt,
    });
    if (!written.ok) return { findings: findings.length, skipped: 'write_failed' };
    return { findings: written.written, skipped: null };
  } catch (error) {
    console.error('runComplaintLookup failed', error);
    return { findings: 0, skipped: 'write_failed' };
  }
}
