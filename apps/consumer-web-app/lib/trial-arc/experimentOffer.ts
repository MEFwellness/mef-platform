/**
 * WHERE TO SEND HER FOR THE SEVEN DAY EXPERIMENT.
 *
 * The arc never starts an experiment, never restates its protocol and never
 * duplicates the panel that offers it. It only has to know which screen is
 * genuinely carrying that offer for this member right now, and the answer is
 * her own most recently completed results screen: Life Signal Check's if she
 * has one, Core Values Snapshot's otherwise.
 *
 * See trialArcExperimentHref in ./constants.ts for why it is not the page
 * called /experiment, which was a live dead end.
 *
 * READS NOTHING IT DOES NOT NEED. It is only called for a member who has
 * genuinely finished one of the two conversations, so a member on day 1 with
 * nothing behind her pays for none of it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnifiedAssessmentDefinitionByKey } from '../assessment-foundation/repository';
import { findLatestCompletedSession } from '../assessment-runtime';
import { CVS_KEY } from '../core-values-snapshot/constants';
import { LSC_KEY } from '../life-signal-check/constants';
import { trialArcExperimentHref } from './constants';

export async function resolveExperimentOfferHref(
  supabase: SupabaseClient,
  memberId: string,
  completed: { cvs: boolean; lsc: boolean }
): Promise<string | null> {
  // The most recent conversation first: an experiment offered off the back
  // of Life Signal Check is the one the day map is about.
  const order: Array<{ key: string; experience: 'life-signal-check' | 'core-values-snapshot' }> = [
    ...(completed.lsc ? [{ key: LSC_KEY, experience: 'life-signal-check' as const }] : []),
    ...(completed.cvs ? [{ key: CVS_KEY, experience: 'core-values-snapshot' as const }] : []),
  ];

  for (const { key, experience } of order) {
    const definition = await getUnifiedAssessmentDefinitionByKey(supabase, key);
    if (!definition) continue;
    const session = await findLatestCompletedSession(supabase, memberId, definition.id);
    if (session) return trialArcExperimentHref(experience, session.id);
  }
  return null;
}
