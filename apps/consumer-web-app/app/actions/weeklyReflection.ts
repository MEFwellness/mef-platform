'use server';

/**
 * The Weekly Reflection's writes and its coach reads.
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
  claimReflectionDelivery,
  claimWeeklyReflection,
  fetchReflectionDelivery,
  fetchWeeklyReflection,
  isReflectionPresentation,
  listCheckinDatesForRecap,
  listPatternStatesForRecap,
  listWeeklyReflections,
} from '@/lib/weekly-reflection/data';
import {
  reflectionStatusLine,
  resolveReflectionDeliveryStatus,
  type ReflectionDeliveryStatus,
} from '@/lib/weekly-reflection/delivery';
import { buildReflectionRecap, renderReflectionRecap, type RenderedRecap } from '@/lib/weekly-reflection/recap';
import {
  isReflectionWindowOpen,
  mostRecentReflectionWeekStart,
  reflectionWeekStartFor,
} from '@/lib/weekly-reflection/week';
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

/**
 * Records that the Weekly Reflection actually reached her screen.
 *
 * WHAT MAKES THIS NOT A RENDER-TIME WRITE. It is only ever reached from a
 * mounted effect on a surface that genuinely displayed the reflection
 * (components/weekly-reflection/TrackWeeklyReflectionDelivered.tsx), by way
 * of a route handler rather than a Server Action, so no page render and no
 * prefetch can produce a receipt. A layout that scrolls into view runs no
 * page body, and a coach screen mounts none of this at all.
 *
 * IT CREATES NO REFLECTION ROW. The receipt lives in its own table
 * (migration 191). Nothing about "has she completed this week" changes
 * because a receipt exists, which is what keeps migration 189's "no row
 * until she finishes" rule true.
 *
 * THE SERVER DECIDES EVERYTHING EXCEPT WHICH SURFACE IT WAS. The member
 * comes from her own session, the timezone from her own profile, the week
 * from that timezone, and the tier from her own subscription row. So a
 * hand-built POST cannot record a receipt for another member, for a week
 * that is not open, or for an account the experience is not offered to.
 *
 * FOUR REASONS IT WRITES NOTHING, and each of them is silent on purpose:
 * no session, outside the Friday-to-Sunday window, not on the program
 * tier, or already finished this week. A receipt is worth nothing to her
 * and a failure here must never reach her screen.
 */
export async function trackWeeklyReflectionDeliveredAction(
  presentation: unknown
): Promise<void> {
  if (!isReflectionPresentation(presentation)) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();

    const timezone = await memberTimezone(supabase, user.id);
    const weekStart = reflectionWeekStartFor(todaysLocalDate(timezone));
    if (!weekStart) return;

    const facts = await fetchMemberAccessFacts(supabase, user.id);
    if (!hasWeeklyReflectionAccess(facts)) return;

    // A finished week is not a delivery. She cannot be looking at either
    // surface, because both are gated on `status === 'pending'`, so this
    // only ever fires on a stale tab. Recording it would put a receipt
    // against a week whose real story is already told by its completion.
    const existing = await fetchWeeklyReflection(supabase, user.id, weekStart);
    if (!existing.ok || existing.record?.completedAt) return;

    await claimReflectionDelivery(supabase, user.id, weekStart, presentation);
  } catch (error) {
    console.error('trackWeeklyReflectionDeliveredAction failed', error);
  }
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

export type CoachWeeklyReflectionStatus = {
  /** The week the line is about: the open window's Friday, or the most recent one that closed. */
  weekStart: string;
  /** Whether that week's Friday-to-Sunday window is open for HER right now, in her own timezone. */
  windowOpen: boolean;
  /** Which of the five states this is, so a test can assert the state and not only the sentence. */
  kind: ReflectionDeliveryStatus['kind'];
  /** The one sentence the panel prints. Rendered here, on the server, because the day name has to be read in her zone and not the coach's. */
  line: string;
};

/**
 * The delivery status line for this client's current week.
 *
 * WHOSE WEEK, AND WHOSE DAY NAMES. Hers. The window and both day names are
 * resolved from HER stored profile timezone, not the coach's browser and
 * not the server's UTC, because the Friday she was offered this on is her
 * Friday. That is also why the sentence is built here rather than passed
 * to the client as a timestamp: the panel is a client component, so a date
 * formatted there would be formatted in whatever zone the coach happens to
 * be sitting in, and would differ between the two render passes.
 *
 * OUTSIDE HER WINDOW there is no current week, so this reports the weekend
 * that most recently closed and the sentence names it. A coach glancing at
 * this on a Wednesday is never left thinking it describes today.
 *
 * IT NEVER GUESSES. A failed read on either table resolves to
 * "could not be read", and a week that closed before receipts existed
 * resolves to "no delivery record". Neither ever becomes "they have not
 * opened the app".
 *
 * NULL for a client who is not on the program tier: nothing was ever
 * delivered because nothing was ever offered, and the panel already says
 * that in its own words rather than reporting a non-delivery.
 */
export async function getClientWeeklyReflectionStatusAction(
  clientId: string
): Promise<CoachWeeklyReflectionStatus | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();

  const isCoachOrAdmin =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return null;

  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return null;

  if (!hasWeeklyReflectionAccess(await fetchMemberAccessFacts(supabase, clientId))) return null;

  const timezone = await memberTimezone(supabase, clientId);
  const localDate = todaysLocalDate(timezone);
  const weekStart = mostRecentReflectionWeekStart(localDate);
  const windowOpen = isReflectionWindowOpen(localDate);

  const [delivery, reflection] = await Promise.all([
    fetchReflectionDelivery(supabase, clientId, weekStart),
    fetchWeeklyReflection(supabase, clientId, weekStart),
  ]);

  const status = resolveReflectionDeliveryStatus({
    weekStart,
    deliveredAt: delivery.record?.deliveredAt ?? null,
    completedAt: reflection.record?.completedAt ?? null,
    readable: delivery.ok && reflection.ok,
  });

  return {
    weekStart,
    windowOpen,
    kind: status.kind,
    line: reflectionStatusLine(status, { windowOpen, timeZone: timezone }),
  };
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
