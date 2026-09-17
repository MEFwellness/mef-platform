'use server';

/**
 * THE COACH READING ONE CLIENT'S HEALTH APPRAISALS.
 *
 * A THIRD FILE, AND EVERY SPLIT IS PAID FOR BY A GUARD.
 * app/actions/haq.ts is the member's, so nothing with a number may be in
 * it. app/actions/haqCoach.ts is the Assign, which the coach's Assessment
 * Status block imports from a CLIENT component through the shared row-assign
 * action. This one reaches lib/haq/coachData.ts and lib/haq/coachView.ts,
 * which carry the raw totals and the hidden value behind every answer, so it
 * must be reachable from the coach's own server rendered surfaces and from
 * nothing else. tests/haq-member-safety.test.ts refuses any other path,
 * member route and client component alike, and it is what found the leak
 * that made this file exist.
 *
 * EVERY PERMISSION CHECK IS HERE AND ALSO IN THE DATABASE. The role check
 * below refuses early; migration 262's own policies on haq_section_results,
 * haq_question_responses and haq_body_map_entries are what actually refuse a
 * client this coach is not assigned to (has_active_role plus
 * is_active_coach_for). A member session has no policy on any of the three,
 * so she reads zero rows from them whatever she asks.
 *
 * NOTHING HERE WRITES. Reading a finished sitting cannot disturb it: it is
 * write once in the database, and a retake is a new instance beside it.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { haqRuntimeDefinitionId } from '@/lib/haq/data';
import {
  listHaqCoachInstances,
  listHaqCoachSectionResults,
  readHaqCoachBodyMarks,
  readHaqCoachQuestionResponses,
  readHaqCoachSectionResults,
} from '@/lib/haq/coachData';
import {
  EMPTY_HAQ_PANEL,
  buildCoachHaqSitting,
  buildHaqSittingSummaries,
  type CoachHaqPanelState,
  type CoachHaqSitting,
} from '@/lib/haq/coachView';

export type { CoachHaqPanelState, CoachHaqSitting };

/**
 * A coach or an administrator, and this client actually visible to him.
 *
 * FAILS SHUT, AND IS NOT THE ONLY CHECK. The database refuses the rows
 * themselves; this refuses early so a screen shows nothing rather than an
 * error, and so a test account never reaches a staff surface.
 */
async function staffMayReadClient(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  clientId: string
): Promise<boolean> {
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, userId, 'coach'),
    hasActiveRole(supabase, userId, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return false;
  return isMemberVisibleToStaff(supabase, clientId, userId);
}

/**
 * Every finished Health Appraisal sitting this client has, newest first,
 * with what each one read.
 *
 * NOTHING IS EVER HIDDEN OR REPLACED. A retake adds a sitting; it never
 * overwrites one, and this list never drops an older one.
 */
export async function getClientHaqPanelAction(clientId: string): Promise<CoachHaqPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_HAQ_PANEL;

  const supabase = createClient();
  if (!(await staffMayReadClient(supabase, user.id, clientId))) return EMPTY_HAQ_PANEL;

  const definitionId = await haqRuntimeDefinitionId(supabase);
  if (!definitionId) return EMPTY_HAQ_PANEL;

  const [instances, results] = await Promise.all([
    listHaqCoachInstances(supabase, clientId, definitionId),
    listHaqCoachSectionResults(supabase, clientId),
  ]);

  return { memberId: clientId, sessions: buildHaqSittingSummaries(instances, results) };
}

/**
 * One sitting, end to end: the 21 sections loudest first, every answer with
 * the value it was worth, the body map, and the same sections in the sitting
 * before it when there is one.
 *
 * Null means there is nothing he may read: not a coach, not this client's
 * coach, no such sitting, or a sitting that is not finished.
 */
export async function getClientHaqSittingAction(sessionId: string): Promise<CoachHaqSitting | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = createClient();
  const definitionId = await haqRuntimeDefinitionId(supabase);
  if (!definitionId) return null;

  // scale-exempt: one instance by its own primary key
  const { data, error } = await supabase
    .from('unified_assessment_sessions')
    .select('member_id')
    .eq('id', sessionId)
    .eq('assessment_definition_id', definitionId)
    .eq('status', 'completed')
    .maybeSingle();
  if (error || !data) return null;

  const memberId = (data as { member_id: string }).member_id;
  if (!(await staffMayReadClient(supabase, user.id, memberId))) return null;

  const instances = await listHaqCoachInstances(supabase, memberId, definitionId);
  const at = instances.findIndex((instance) => instance.sessionId === sessionId);
  if (at === -1) return null;
  const instance = instances[at]!;
  // Newest first, so the sitting after this one in the list is the one before it in time.
  const previousInstance = instances[at + 1] ?? null;

  const [results, responses, marks, previousResults] = await Promise.all([
    readHaqCoachSectionResults(supabase, sessionId),
    readHaqCoachQuestionResponses(supabase, sessionId),
    readHaqCoachBodyMarks(supabase, sessionId),
    previousInstance ? readHaqCoachSectionResults(supabase, previousInstance.sessionId) : Promise.resolve(null),
  ]);
  if (results.length === 0) return null;

  return buildCoachHaqSitting({ instance, results, responses, marks, previousInstance, previousResults });
}
