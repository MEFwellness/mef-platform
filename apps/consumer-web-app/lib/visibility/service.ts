/**
 * The Visibility Layer — the one entry point.
 *
 * Every surface that renders anything asks this. `getMemberVisibility()` is
 * request-memoized for exactly the reason `getMemberInterpretation()` is:
 * Home alone renders several independent Suspense boundaries that each want
 * to know what she can see, and without memoization each one would re-run
 * the whole gather. One computation per request, handed to every caller as
 * the identical object, which is also the cheapest possible guarantee that
 * two cards on one screen cannot disagree about whether a third exists.
 *
 * Best effort throughout. A failure resolves to "only what safety and the
 * always rules give", which is the honest thing to render when the layer
 * genuinely could not read anything: it never hides the check-in, never
 * hides a coach's message, and never invents a reveal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import { getCachedUser } from '../supabase/currentUser';
import { requestCache } from '../reactRequestCache';
import { todaysLocalDate } from '../time/localDate';
import { VISIBILITY_CATALOG, getFeatureDefinition } from './catalog';
import { buildVisibilityContext } from './context';
import { fetchStoredVisibility, recordReveals, type RevealToRecord } from './data';
import { pendingReveals, resolveVisibility, type StoredVisibility } from './resolve';
import { emptyVisibilityContext } from './rules';
import type { FeatureKey, MemberVisibility } from './types';

/** The answer for a member the layer could not read anything about. */
function fallbackVisibility(): MemberVisibility {
  return resolveVisibility({
    context: emptyVisibilityContext(),
    stored: new Map<FeatureKey, StoredVisibility>(),
  });
}

/**
 * Compute one member's visibility, without writing anything.
 *
 * Split out from `getMemberVisibility` so a coach surface, a test, or a
 * server-role script can resolve the same answers for a member who is not
 * the signed-in user, which is exactly what the coach's visibility screen
 * needs.
 */
export async function buildMemberVisibility(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  options: { coachView?: boolean } = {}
): Promise<{ visibility: MemberVisibility; stored: Map<FeatureKey, StoredVisibility> }> {
  const [context, stored] = await Promise.all([
    buildVisibilityContext(supabase, memberId, localDate, options),
    fetchStoredVisibility(supabase, memberId),
  ]);

  return { visibility: resolveVisibility({ context, stored }), stored };
}

/**
 * The signed-in member's own visibility.
 *
 * This is the function every member-facing surface calls. It also persists
 * anything newly revealed, which is what turns "revealed stays revealed"
 * from a promise a render makes into a fact in the database. The write is
 * deliberately not awaited by the returned answer's correctness: the
 * resolver already decided, and a failed write only means the same reveal
 * is recomputed on her next load.
 */
export const getMemberVisibility = requestCache(async (): Promise<MemberVisibility> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return fallbackVisibility();

    const localDate = await resolveMemberLocalDate(supabase, user.id);
    const { visibility, stored } = await buildMemberVisibility(supabase, user.id, localDate);

    const toRecord: RevealToRecord[] = pendingReveals(visibility, stored).map((feature) => ({
      featureKey: feature.key,
      ruleKind: feature.ruleKind,
      reason: feature.coachExplanation,
      needsSentence: feature.revealSentence !== null,
      source: feature.grandfathered ? 'grandfathered' : feature.source,
    }));

    await recordReveals(supabase, user.id, toRecord);

    return visibility;
  } catch (error) {
    console.error('getMemberVisibility failed', error);
    return fallbackVisibility();
  }
});

async function resolveMemberLocalDate(supabase: SupabaseClient, memberId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', memberId)
      .maybeSingle();
    return todaysLocalDate((data as { timezone: string | null } | null)?.timezone ?? 'America/New_York');
  } catch {
    return todaysLocalDate('America/New_York');
  }
}

/**
 * The one-line question a surface asks. Kept as its own tiny helper so a
 * page reads `await canSee(F.trackerWater)` rather than three lines of map
 * lookup, and so there is one place to look for every caller.
 */
export async function canSee(featureKey: FeatureKey): Promise<boolean> {
  const visibility = await getMemberVisibility();
  return visibility.byKey.get(featureKey)?.visible ?? false;
}

/**
 * Every catalog entry that has no rule anybody could infer, for the build
 * report. Deliberately a function over the real catalog rather than a
 * hand-written list, so it cannot go stale.
 */
export function featuresWithNoInferredRule(): string[] {
  return VISIBILITY_CATALOG.filter((f) => f.couldNotInferRule).map((f) => f.key);
}

export { getFeatureDefinition };
