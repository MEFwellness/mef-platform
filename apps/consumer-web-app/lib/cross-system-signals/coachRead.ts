/**
 * THE SIGNALS SECTION'S READ. Her rows, judged by the survey rule, then the
 * pure view (./coachView.ts). Coach side only, and reads only.
 *
 * Separate from the server action for the reason lib/cross-system-root/
 * noticedRead.ts is: the action proves who is asking, and this is what a
 * test runs against a stand-in database to see what the coach would see.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { todaysLocalDate } from '@/lib/time/localDate';
import { memberTimezone } from '@/lib/time/memberToday';
import { buildCoachSignalsView, type CoachSignalsView } from './coachView';
import { loadSignalLibrary } from './contentData';
import { listAllSignalsForMember } from './data';
import { judgeRecords, loadQuestionnaire } from './questionnaireFacts';

export async function readCoachSignalsView(
  supabase: SupabaseClient,
  clientId: string,
  options: { today?: string } = {}
): Promise<CoachSignalsView> {
  const [library, signalRead, questionnaire, timezone] = await Promise.all([
    loadSignalLibrary(supabase),
    listAllSignalsForMember(supabase, clientId),
    loadQuestionnaire(supabase, clientId),
    memberTimezone(supabase, clientId),
  ]);

  // HER SURVEY ANSWERS, JUDGED BY THE SAME RULE ROOT READS THEM WITH, so this
  // list and Root Noticed can never disagree about what is current.
  const records = judgeRecords(signalRead.records, questionnaire);
  return buildCoachSignalsView(records, library, {
    referenceDay: options.today ?? todaysLocalDate(timezone),
  });
}
