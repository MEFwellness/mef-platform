'use server';

/**
 * The Weekly Reflection's two writes and one coach read.
 *
 * SUBMIT IS THE ONLY WRITE IN THE FEATURE, and it happens because she
 * pressed a button. Nothing renders a row into existence: the recap is
 * recomputed from data that was already there on every render, and this
 * action is what freezes it. See lib/weekly-reflection/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts five answers and nothing else. The tier, the week, the
 * seven day window and the recap descriptors are all re-resolved here from
 * her own profile timezone and her own subscription row, so a hand-built
 * request cannot store a reflection for a week that is not open, for a
 * member who is not on the program, or with a recap she supplied herself.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { fetchMemberAccessFacts } from '@/lib/membership/service';
import { hasWeeklyReflectionAccess } from '@/lib/weekly-reflection/access';
import {
  claimWeeklyReflection,
  fetchWeeklyReflection,
  listCheckinDatesForRecap,
  listPatternStatesForRecap,
  listWeeklyReflections,
} from '@/lib/weekly-reflection/data';
import { buildReflectionRecap, renderReflectionRecap, type RenderedRecap } from '@/lib/weekly-reflection/recap';
import { reflectionWeekStartFor } from '@/lib/weekly-reflection/week';
import {
  sanitizeReflectionAnswers,
  WEEKLY_REFLECTION_QUESTIONS_VERSION,
  type ReflectionAnswers,
} from '@/lib/weekly-reflection/questions';
import {
  clearRootPopupDismissal,
  weeklyReflectionPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';

export type SubmitWeeklyReflectionResult = { ok: true } | { ok: false; error: string };

/**
 * Saves her finished reflection.
 *
 * Idempotent by the same insert-if-absent rule the row's own unique
 * constraint enforces: a double submit resolves to "already saved", never
 * to a second row and never to an overwrite of what she wrote first.
 */
export async function submitWeeklyReflectionAction(
  answers: unknown
): Promise<SubmitWeeklyReflectionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeReflectionAnswers(answers);
  if (!clean) return { ok: false, error: 'Please answer all five questions.' };

  const supabase = createClient();

  const timezone = await memberTimezone(supabase, user.id);
  const weekStart = reflectionWeekStartFor(todaysLocalDate(timezone));
  if (!weekStart) {
    return { ok: false, error: 'The Weekly Reflection opens on Friday.' };
  }

  const facts = await fetchMemberAccessFacts(supabase, user.id);
  if (!hasWeeklyReflectionAccess(facts)) {
    return { ok: false, error: 'This is part of the 24 week program.' };
  }

  const existing = await fetchWeeklyReflection(supabase, user.id, weekStart);
  if (existing.record?.completedAt) return { ok: true };

  const [checkinLocalDates, patternStates] = await Promise.all([
    listCheckinDatesForRecap(supabase, user.id, weekStart),
    listPatternStatesForRecap(supabase, user.id),
  ]);

  const recap = buildReflectionRecap({ weekStart, checkinLocalDates, patternStates });

  const { record } = await claimWeeklyReflection(
    supabase,
    user.id,
    weekStart,
    WEEKLY_REFLECTION_QUESTIONS_VERSION,
    recap,
    clean
  );

  // "No error" is not "it worked": claimWeeklyReflection reads the row back
  // either way, so a write that matched no policy is caught here rather
  // than being reported to her as a success.
  if (!record?.completedAt) return { ok: false, error: 'We could not save that. Please try again.' };

  // The pop-up for this week can never be due again (the state is
  // 'completed', so the chain's branch does not produce a candidate at
  // all), which makes any snooze or ignore row for it dead weight. Same
  // tidy-up every other answered message in the chain does.
  await clearRootPopupDismissal(supabase, user.id, weeklyReflectionPopupMessageKey(weekStart));

  // Home only. NOT this route: she is standing on it, looking at Part 3,
  // and revalidating it would re-render the page underneath her. The
  // client component survives that re-render either way now, but asking
  // for it would be asking for work that exists only to be absorbed.
  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachWeeklyReflection = {
  weekStart: string;
  completedAt: string | null;
  answers: ReflectionAnswers | null;
  /** The identical recap she read, rendered from the identical stored descriptors. */
  recap: RenderedRecap | null;
};

/**
 * Every week this client has reflected on, newest first.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check, exactly as the 2026-08-28 exclusion build set it up.
 *
 * Returns an empty list for a client who is not on the program tier as
 * well as for one who simply has no reflections yet, and the panel says
 * which of the two it is from the tier it is handed separately. Reading
 * rows for a client whose tier changed is deliberately still allowed: a
 * member moved off the program does not lose the reflections she already
 * wrote, and her coach should not lose them either.
 */
export async function getClientWeeklyReflectionsAction(
  clientId: string
): Promise<CoachWeeklyReflection[]> {
  const user = await getCachedUser();
  if (!user) return [];
  const supabase = createClient();

  const isCoachOrAdmin =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return [];

  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return [];

  const records = await listWeeklyReflections(supabase, clientId);
  return records
    .filter((record) => record.completedAt !== null)
    .map((record) => ({
      weekStart: record.weekStart,
      completedAt: record.completedAt,
      answers: record.answers,
      recap: record.recap ? renderReflectionRecap(record.recap) : null,
    }));
}

/** Whether this client is on the tier the Weekly Reflection belongs to, so the panel can tell "not on the program" apart from "on the program, nothing written yet". */
export async function getClientWeeklyReflectionAccessAction(clientId: string): Promise<boolean> {
  const user = await getCachedUser();
  if (!user) return false;
  const supabase = createClient();

  const isCoachOrAdmin =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return false;

  return hasWeeklyReflectionAccess(await fetchMemberAccessFacts(supabase, clientId));
}
