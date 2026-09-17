/**
 * ROOT READS THE BODY SYSTEMS SURVEY. The impure half, and the only place a
 * survey sitting consults the Association Map.
 *
 * WHAT IT DOES. Her newest completed sitting has been filed into the Signal
 * Library as ordinary rows. This takes the rows from that sitting that the
 * survey rule treats as active signals now, hands them to the SAME pure
 * lookup a sentence goes through (./lookup.ts), and stores what Root noticed
 * through the SAME store (./data.ts), under the sitting rather than under a
 * complaint. There is no second lookup, no second map and no second store.
 *
 * ONLY THE NEWEST SITTING SPEAKS. Asked about an older sitting, it does
 * nothing: a retake is what replaces a survey's findings, and the older
 * sitting's stored findings are left in place as the record of what Root
 * noticed at the time rather than deleted to make today look tidy. The
 * coach's screen reads the newest sitting only.
 *
 * THE SAFETY OVERRIDE IS RESOLVED HERE, BEFORE ANY FINDING IS BUILT, by the
 * survey's own red flag layer, exactly as for a complaint. A sitting that
 * fired a red flag withholds every finding it would otherwise have written.
 *
 * A RENDER NEVER DECIDES ANYTHING. This runs from the explicit act of
 * finishing a sitting, and from the backfill. It is BEST EFFORT AND NEVER
 * THROWS, because the first of those is a member's own submit, and her
 * results are already saved and already built by the time it is called.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listAllSignalsForMember } from '@/lib/cross-system-signals/data';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import { SOURCE_BODY_SYSTEMS } from '@/lib/cross-system-signals/constants';
import { judgeRecords, loadQuestionnaire } from '@/lib/cross-system-signals/questionnaireFacts';
import { currentTriggerRows } from '@/lib/cross-system-signals/questionnaireState';
import { QUESTIONNAIRE_RULE_REVISION } from '@/lib/cross-system-signals/questionnaireRules';
import { signalLibraryServiceRoleClient } from '@/lib/cross-system-signals/serviceRole';
import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import { localDateStringFor } from '@/lib/time/localDate';
import { memberTimezone } from '@/lib/time/memberToday';
import { replaceFindings } from './data';
import { lookupForComplaint } from './lookup';

export type QuestionnaireLookupOutcome = {
  /** The sitting Root read, or null when it read none. */
  sittingId: string | null;
  /** How many of that sitting's answers are active signals now. */
  activeSignals: number;
  /** How many map entries they triggered. */
  findings: number;
  /** True when the stored findings already matched and nothing was written. */
  unchanged: boolean;
  skipped:
    | null
    | 'no_service_role'
    | 'read_failed'
    | 'no_completed_sitting'
    | 'not_latest_sitting'
    | 'write_failed';
};

function outcome(partial: Partial<QuestionnaireLookupOutcome>): QuestionnaireLookupOutcome {
  return {
    sittingId: null,
    activeSignals: 0,
    findings: 0,
    unchanged: false,
    skipped: null,
    ...partial,
  };
}

export async function runQuestionnaireLookup(input: {
  memberId: string;
  /** The sitting just completed. Omitted, the newest one is read. */
  sittingId?: string | null;
  trigger: 'sitting_ingested' | 'backfill';
  client?: SupabaseClient;
  /** Overridden only by tests, so a run can be driven at a known instant. */
  now?: string;
}): Promise<QuestionnaireLookupOutcome> {
  const supabase = input.client ?? signalLibraryServiceRoleClient();
  if (!supabase) return outcome({ skipped: 'no_service_role' });

  try {
    const [signalRead, relationshipRead, questionnaire, timezone] = await Promise.all([
      listAllSignalsForMember(supabase, input.memberId),
      listRelationships(supabase),
      loadQuestionnaire(supabase, input.memberId),
      memberTimezone(supabase, input.memberId),
    ]);
    if (!signalRead.ok || !relationshipRead.ok || !questionnaire.ok) {
      return outcome({ skipped: 'read_failed' });
    }

    const latestId = questionnaire.facts.latestSittingId;
    if (!latestId) return outcome({ skipped: 'no_completed_sitting' });
    if (input.sittingId && input.sittingId !== latestId) {
      return outcome({ sittingId: input.sittingId, skipped: 'not_latest_sitting' });
    }
    const sitting = questionnaire.sittings.find((record) => record.id === latestId);
    if (!sitting?.completedAt) return outcome({ skipped: 'no_completed_sitting' });

    const records = judgeRecords(signalRead.records, questionnaire);
    const triggers = currentTriggerRows(records, latestId);
    const triggerIds = new Set(triggers.map((record) => record.id));

    // THE EXISTING RED FLAG LAYER DECIDES, not this feature.
    const flaggedSittings = flaggedSittingIds(
      questionnaire.sittings.map((record) => ({
        sittingId: record.id,
        redFlagAnswers: record.redFlagAnswers,
      })),
      questionnaire.content.redFlags,
      questionnaire.content.safetyLevels
    );
    const flaggedSignals = redFlaggedSignalIds(records, flaggedSittings);

    // HER DAY, the day the sitting completed in her own zone. It is both the
    // day the finding is dated and the day its evidence is measured from,
    // the same way a complaint's evidence is measured from the day she
    // wrote it.
    const noticedOn = localDateStringFor(sitting.completedAt, timezone);
    const findings = lookupForComplaint(
      relationshipRead.summaries,
      triggerIds,
      records,
      noticedOn,
      flaggedSignals
    );

    const written = await replaceFindings(supabase, {
      memberId: input.memberId,
      cause: { kind: 'sitting', sourceKey: SOURCE_BODY_SYSTEMS, sessionId: latestId },
      findings,
      trigger: input.trigger,
      noticedOn,
      noticedAt: input.now ?? new Date().toISOString(),
      ruleRevision: QUESTIONNAIRE_RULE_REVISION,
    });
    if (!written.ok) {
      return outcome({
        sittingId: latestId,
        activeSignals: triggers.length,
        findings: findings.length,
        skipped: 'write_failed',
      });
    }
    return outcome({
      sittingId: latestId,
      activeSignals: triggers.length,
      findings: findings.length,
      unchanged: written.unchanged === true,
    });
  } catch (error) {
    console.error('runQuestionnaireLookup failed', error);
    return outcome({ skipped: 'write_failed' });
  }
}
