/**
 * Member Interpretation Layer — the one entry point.
 *
 * Every surface that used to read raw member data and reach its own verdict
 * calls this instead. Raw data flows in here; verdicts flow out of here and
 * nowhere else.
 *
 * Request-memoized (lib/reactRequestCache.ts), for the same reason
 * app/actions/rootMap.ts's gather step is: Home alone renders four
 * independent Suspense boundaries that each want the member's findings, and
 * without memoization each one would re-run the whole gather. One
 * computation per request, handed to every caller as the identical object,
 * which is also the cheapest possible guarantee that two cards on one
 * screen cannot disagree.
 *
 * Best-effort throughout: a failure resolves to an empty interpretation
 * rather than an exception, because every caller is a page render the
 * member is already waiting on. An empty interpretation renders as "still
 * gathering", which is the honest thing to say when the layer genuinely
 * could not read anything.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { createClient } from '../supabase/server';
import { getCachedUser } from '../supabase/currentUser';
import { requestCache } from '../reactRequestCache';
import { addDaysToLocalDate } from '../feed/dateMath';
import { listRegistryEntriesForMember } from '../registry/data';
import { getMemberRestrictedTopics } from '../feed/data';
import { fetchDomainCoverage } from '../root-map/coverage';
import type { CoachingDomain } from '../investigation-engine/domains';
import { todaysLocalDate } from '../time/localDate';
import { EVIDENCE_WINDOW_DAYS } from './config';
import { computeDataFloor } from './dataFloor';
import { countLoggedDays } from '@/lib/member-counts/checkinCounts';
import { buildDomainInterpretations } from './domains';
import { INTERPRETATION_CHECKIN_COLUMNS, type InterpretationCheckin } from './evidence';
import { buildCanonicalFindings } from './findings';
import { getMemberFocus } from './focus';
import type { MemberInterpretation } from './types';

function emptyInterpretation(localDate: string): MemberInterpretation {
  return {
    findings: [],
    domains: buildDomainInterpretations({
      findings: [],
      loggedDaysByDomain: {},
      suppressed: false,
    }),
    focus: null,
    dataFloor: computeDataFloor(0),
    safetyGated: false,
    localDate,
  };
}

/** The member's own logged check-ins over the evidence window, oldest first. */
export async function fetchInterpretationCheckins(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<InterpretationCheckin[]> {
  const since = addDaysToLocalDate(localDate, -(EVIDENCE_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select(INTERPRETATION_CHECKIN_COLUMNS)
    .eq('user_id', memberId)
    .gte('local_date', since)
    .lte('local_date', localDate)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('fetchInterpretationCheckins failed', error);
    return [];
  }
  return (data ?? []) as InterpretationCheckin[];
}

/**
 * The whole interpretation for one member, without the focus.
 *
 * Split out from `getMemberInterpretation` so a coach surface, a test, or a
 * server-role script can build the same canonical set for a member who is
 * not the signed-in user, which is exactly what the coach's client detail
 * page needs and exactly what the finding-migration audit script needs.
 */
export async function buildMemberInterpretation(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  options: { coachView?: boolean } = {}
): Promise<Omit<MemberInterpretation, 'focus'>> {
  const [entries, checkins, coverage, restrictedTopics] = await Promise.all([
    listRegistryEntriesForMember(supabase, memberId, { statusFilter: ['active'] }),
    fetchInterpretationCheckins(supabase, memberId, localDate),
    fetchDomainCoverage(supabase, memberId, localDate),
    getMemberRestrictedTopics(supabase, memberId),
  ]);

  // Safety mirrors the posture the recommendation engine and the Root Map
  // builder already share: suppress detail entirely for the member, never
  // partially, and never for a coach who is the person doing the reviewing.
  const suppressed = !options.coachView && restrictedTopics.length > 0;

  const findings = buildCanonicalFindings({
    entries: entries as RegistryEntry[],
    checkins,
  });

  const loggedDaysByDomain: Partial<Record<CoachingDomain, number | null>> = {};
  for (const [domain, value] of Object.entries(coverage)) {
    loggedDaysByDomain[domain as CoachingDomain] = value?.count ?? null;
  }

  // The one definition of the count (lib/member-counts/checkinCounts.ts).
  const loggedDays = countLoggedDays(checkins);

  return {
    findings: suppressed ? [] : findings,
    domains: buildDomainInterpretations({
      findings: suppressed ? [] : findings,
      loggedDaysByDomain,
      suppressed,
    }),
    dataFloor: computeDataFloor(loggedDays),
    safetyGated: suppressed,
    localDate,
  };
}

/**
 * The signed-in member's own interpretation, focus included.
 *
 * This is the function every member-facing surface calls.
 */
export const getMemberInterpretation = requestCache(
  async (): Promise<MemberInterpretation> => {
    const localDate = await resolveMemberLocalDate();
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return emptyInterpretation(localDate);

      const [base, focus] = await Promise.all([
        buildMemberInterpretation(supabase, user.id, localDate),
        getMemberFocus(),
      ]);

      return { ...base, focus };
    } catch (error) {
      console.error('getMemberInterpretation failed', error);
      return emptyInterpretation(localDate);
    }
  }
);

/**
 * The member's own local date, resolved through her profile timezone. Its
 * own tiny helper so the failure mode is a sensible date rather than a
 * thrown render.
 */
async function resolveMemberLocalDate(): Promise<string> {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return todaysLocalDate('America/New_York');
    const { data } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    return todaysLocalDate(
      (data as { timezone: string | null } | null)?.timezone ?? 'America/New_York'
    );
  } catch {
    return todaysLocalDate('America/New_York');
  }
}
