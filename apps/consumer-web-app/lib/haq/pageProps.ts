/**
 * Everything /health-appraisal hands her screen, built in one place so the
 * page and the payload test read the same thing.
 *
 * Her state, her own answers as response names, her own marks on her open
 * instance, and the screen she picks up on. Nothing numeric about the
 * instrument can be in here: this module reads only the runtime's answer
 * rows, which hold response names, and the body map.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HaqState } from './access';
import { haqRuntimeDefinitionId, listHaqBodyMarks, readOpenHaqAnswers } from './data';
import { buildHaqScreens, resumeHaqScreenIndex, type HaqAnswers } from './walk';
import type { HaqBodyMark } from './bodyMap';

export type HaqPageProps = {
  status: HaqState['status'];
  initialAnswers: HaqAnswers;
  initialMarks: HaqBodyMark[];
  initialScreenIndex: number;
};

export async function buildHaqPageProps(
  supabase: SupabaseClient,
  memberId: string,
  state: HaqState
): Promise<HaqPageProps> {
  if (state.status !== 'in_progress') {
    return { status: state.status, initialAnswers: {}, initialMarks: [], initialScreenIndex: 0 };
  }

  const definitionId = await haqRuntimeDefinitionId(supabase);
  const [answers, marks] = await Promise.all([
    definitionId ? readOpenHaqAnswers(supabase, memberId, definitionId) : Promise.resolve({}),
    listHaqBodyMarks(supabase, memberId, state.sessionId),
  ]);

  return {
    status: 'in_progress',
    initialAnswers: answers,
    initialMarks: marks,
    initialScreenIndex: resumeHaqScreenIndex(buildHaqScreens(), answers),
  };
}
