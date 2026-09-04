/**
 * DAY 5: HER TOP VALUE AND HER LOUDEST SIGNAL, FROM HER OWN SCORED ROWS.
 *
 * NOTHING IS COMPUTED HERE. Both halves come from the scoring engines that
 * already own them: lib/core-values-snapshot/scoring.ts decides her top
 * value and her branch, lib/life-signal-check/scoring.ts decides her
 * loudest signal and whether Body-Value Echo fires. This module reads her
 * two most recently completed sessions, hands them to those engines exactly
 * as the results screens do, and reports the answer.
 *
 * ECHO IS NOT RE-DERIVED, AND CANNOT BE. `echoFires` is a real condition
 * with three parts (a Core Values Snapshot exists, its branch is not
 * 'aligned', and her loudest signal is genuinely adjacent to her top value
 * per lib/life-signal-check/adjacency.ts). The day 5 copy branches on the
 * scoring's own answer, so the arc can never claim an echo that her results
 * screen did not show her, and can never miss one it did.
 *
 * NULL RATHER THAN A GUESS. A missing definition, a missing session, or an
 * unreadable one all return null, and the day 5 branch nudges toward the
 * missing half instead of manufacturing a finding. That is the surprise
 * insight guardrail: an observation is worth having only when it is real.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnifiedAssessmentDefinitionByKey } from '../assessment-foundation/repository';
import { findLatestCompletedSession, getSessionById } from '../assessment-runtime';
import { CVS_KEY, AREA_LABEL } from '../core-values-snapshot/constants';
import { computeCvsScoring } from '../core-values-snapshot/scoring';
import { LSC_KEY, SIGNAL_LABEL } from '../life-signal-check/constants';
import { computeLscScoring } from '../life-signal-check/scoring';

export interface TrialArcConnection {
  /** "Health & Energy". The same label her Core Values Snapshot result screen used. */
  valueLabel: string;
  /** "Tension". The same label her Life Signal Check result screen used. */
  signalLabel: string;
  /** True only when Life Signal Check's own scoring says Body-Value Echo fired for her. */
  echoFired: boolean;
}

export async function resolveTrialArcConnection(
  supabase: SupabaseClient,
  memberId: string
): Promise<TrialArcConnection | null> {
  const [cvsDefinition, lscDefinition] = await Promise.all([
    getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY),
    getUnifiedAssessmentDefinitionByKey(supabase, LSC_KEY),
  ]);
  if (!cvsDefinition || !lscDefinition) return null;

  const [cvsLatest, lscLatest] = await Promise.all([
    findLatestCompletedSession(supabase, memberId, cvsDefinition.id),
    findLatestCompletedSession(supabase, memberId, lscDefinition.id),
  ]);
  if (!cvsLatest || !lscLatest) return null;

  const [cvsSession, lscSession] = await Promise.all([
    getSessionById(supabase, cvsLatest.id),
    getSessionById(supabase, lscLatest.id),
  ]);
  if (!cvsSession || !lscSession) return null;

  const cvsScoring = computeCvsScoring(cvsSession.answers);
  // The identical context her own results screen passes, which is what makes
  // the echo answer here and the echo she was shown the same answer.
  const lscScoring = computeLscScoring(lscSession.answers, {
    topValue: cvsScoring.topValue,
    branch: cvsScoring.branch,
  });

  return {
    valueLabel: AREA_LABEL[cvsScoring.topValue],
    signalLabel: SIGNAL_LABEL[lscScoring.loudestSignal],
    echoFired: lscScoring.echoFires,
  };
}
