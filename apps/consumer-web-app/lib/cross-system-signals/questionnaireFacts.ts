/**
 * Loading what the survey rule needs about a member's sittings, and judging
 * her rows with it. The impure half of ./questionnaireState.ts.
 *
 * READS ONLY, AND WORDLESS. Three reads, all of structure: her finished
 * sittings (answers and stored results, never red flag wording), the
 * survey's own content bundle (the same cached bundle her own screens load)
 * and the association TRIGGERS with no title or text. The caller passes the
 * connection: the trusted one inside her submit and the backfill, or a
 * coach's own session on the coach's screens.
 *
 * A FAILED READ IS NOT A VERDICT. If the sittings cannot be read, the rule
 * still runs on what the rows themselves carry (the points she answered and
 * other sources), which can only make an answer quieter, never louder: no
 * section and no related association can lend support that was not read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listAllBodySystemsSessions, type BodySystemsSessionRecord } from '@/lib/body-systems/data';
import {
  loadAssociationTriggers,
  loadMemberContent,
  type MemberContent,
} from '@/lib/body-systems/contentData';
import type { AssociationTriggerRow } from '@/lib/body-systems/triggerEvaluation';
import {
  applyQuestionnaireActivation,
  buildQuestionnaireFacts,
  buildSittingFacts,
  NO_QUESTIONNAIRE_FACTS,
  type QuestionnaireFacts,
} from './questionnaireState';
import type { SignalRecord } from './types';

export type LoadedQuestionnaire = {
  /** False when her sittings could not be read. */
  ok: boolean;
  facts: QuestionnaireFacts;
  /** Her finished sittings, oldest first. */
  sittings: BodySystemsSessionRecord[];
  content: MemberContent;
  associationTriggers: AssociationTriggerRow[];
};

/** Facts for sittings already in hand, with the content they are read against. */
export function factsFromSittings(
  sittings: readonly BodySystemsSessionRecord[],
  content: MemberContent,
  associationTriggers: readonly AssociationTriggerRow[]
): QuestionnaireFacts {
  const built = [];
  for (const sitting of sittings) {
    // A sitting with no completion instant or no stored reading is not a
    // finished sitting, whatever else is on it, and lends nothing.
    if (!sitting.completedAt || !sitting.results) continue;
    built.push(
      buildSittingFacts({
        sittingId: sitting.id,
        completedAt: sitting.completedAt,
        branch: sitting.results.branch,
        answers: sitting.answers,
        results: sitting.results,
        questions: content.questions,
        scale: content.scale,
        bands: content.bands,
        associationTriggers,
      })
    );
  }
  return built.length > 0 ? buildQuestionnaireFacts(built) : NO_QUESTIONNAIRE_FACTS;
}

export async function loadQuestionnaire(
  supabase: SupabaseClient,
  memberId: string
): Promise<LoadedQuestionnaire> {
  const [sittingRead, content, associationTriggers] = await Promise.all([
    listAllBodySystemsSessions(supabase, memberId),
    loadMemberContent(supabase),
    loadAssociationTriggers(supabase),
  ]);
  const sittings = sittingRead.records.filter(
    (record) => record.completedAt !== null && record.results !== null
  );
  return {
    ok: sittingRead.ok,
    facts: factsFromSittings(sittings, content, associationTriggers),
    sittings,
    content,
    associationTriggers,
  };
}

/** Her rows, with every survey answer judged. */
export function judgeRecords(
  records: readonly SignalRecord[],
  loaded: Pick<LoadedQuestionnaire, 'facts'>
): SignalRecord[] {
  return applyQuestionnaireActivation(records, loaded.facts);
}
