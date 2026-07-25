/**
 * WBSA safety escalation — reuses the existing Safety Escalation System
 * (lib/safety/service.ts::evaluateConcern) exactly the way
 * app/actions/body-assessment.ts already does for a 'significant' finding
 * (lib/body-assessment/findings.ts::isConcerningFinding). No new
 * classifier, no new escalation pipeline: this module only decides which
 * WBSA answers qualify and builds the text evaluateConcern's existing
 * deterministic keyword classifier can act on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FindingSeverity } from '../assessment-runtime/types';
import { recordSafetyRestrictionNarrative } from '../narrative/service';
import { evaluateConcern } from '../safety/service';
import { WBSA_RED_FLAG_QUESTION_KEYS, type WbsaRedFlagQuestionKey } from './constants';

/** Same confidence-per-severity scale lib/registry/adapters/unifiedAssessment.ts uses when publishing findings, restated here so this module doesn't depend on that file's private helper. */
function confidenceForSeverity(severity: FindingSeverity): number {
  if (severity === 'significant') return 0.75;
  if (severity === 'moderate') return 0.65;
  return 0.55;
}

/** Mirrors lib/body-assessment/findings.ts::isConcerningFinding's exact threshold. */
export function isWbsaConcerningFinding(severity: FindingSeverity, confidence: number): boolean {
  return severity === 'significant' && confidence >= 0.6;
}

function isRedFlagQuestionKey(questionKey: string): questionKey is WbsaRedFlagQuestionKey {
  return (WBSA_RED_FLAG_QUESTION_KEYS as readonly string[]).includes(questionKey);
}

export type WbsaRedFlagFinding = { questionKey: string; label: string; severity: FindingSeverity };

/**
 * The deterministic classifier (lib/safety/classifier.ts) matches
 * keywords in free text — a structured "yes/no" or single-select answer
 * has no free text of its own, so this restates each red-flag question's
 * real, honest content in the plain language a member might use, close
 * enough to the classifier's existing keyword list to actually route
 * correctly where a real category exists (e.g. chest pain, the phrase a
 * member selected for the worst headache of their life). Where no
 * existing category keyword genuinely applies (GI bleeding, jaundice,
 * palpitations, pelvic pain, numbness), this is honest about that gap
 * rather than stuffing in a keyword that doesn't truly match — those
 * still reach the coach via the runtime's own 'significant' finding
 * (Universal Registry + coach dashboard), just not via this specific
 * text classifier.
 */
const SAFETY_TEXT_BY_QUESTION_KEY: Record<WbsaRedFlagQuestionKey, string> = {
  wbsa_lowdig_redflag_bleeding: 'Blood in stool or unexplained rectal bleeding, reported on a whole-body assessment.',
  wbsa_liver_skin_tone: 'Yellowish tint to skin or eyes (possible jaundice), reported on a whole-body assessment.',
  wbsa_resp_redflag_chest: 'Chest pain, chest tightness, or a sudden inability to catch my breath.',
  wbsa_circ_redflag_palpitations: 'Heart racing, pounding, or skipping beats along with dizziness, reported on a whole-body assessment.',
  wbsa_repro_redflag_pain: 'New or worsening pelvic pain or unusual bleeding, reported on a whole-body assessment.',
  wbsa_neuro_redflag_severity: 'The worst headache of my life.',
  wbsa_neuro_balance: 'New numbness, tingling, weakness, or balance problems, reported on a whole-body assessment.',
};

/**
 * Runs evaluateConcern for every WBSA red-flag question that fired a
 * concerning finding on this completed session. Best-effort: a failure
 * here must never surface to the member as a failed assessment
 * completion, matching completeSession's own try/catch discipline around
 * publishUnifiedAssessmentFindings.
 */
export async function escalateWbsaRedFlags(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  findings: WbsaRedFlagFinding[]
): Promise<{ escalated: boolean }> {
  let escalated = false;

  for (const finding of findings) {
    if (!isRedFlagQuestionKey(finding.questionKey)) continue;
    const confidence = confidenceForSeverity(finding.severity);
    if (!isWbsaConcerningFinding(finding.severity, confidence)) continue;

    try {
      const evaluation = await evaluateConcern(supabase, {
        memberId,
        sourceFeature: 'unified_assessment',
        sourceRecordType: 'unified_assessment_answer',
        sourceRecordId: sessionId,
        text: SAFETY_TEXT_BY_QUESTION_KEY[finding.questionKey],
        newOrWorseningConcern: true,
      });
      if (evaluation) {
        escalated = true;
        // Same follow-up step app/actions/body-assessment.ts takes after a
        // concerning finding escalates — keeps the member's coaching
        // narrative consistent regardless of which surface triggered it.
        await recordSafetyRestrictionNarrative(
          supabase,
          memberId,
          'system',
          null,
          evaluation.classification
        );
      }
    } catch (err) {
      console.error('escalateWbsaRedFlags failed', err);
    }
  }

  return { escalated };
}
