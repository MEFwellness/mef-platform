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
 * client posts five answers and nothing else. The week, the seven day
 * window, the recap descriptors and whether she is offered this at all are
 * re-resolved here from her own profile timezone, her own subscription row
 * and her own assignment row, so a hand-built request cannot store a
 * reflection for a week nobody opened for her, or with a recap she
 * supplied herself.
 *
 * TWO WAYS IN, ASKED IN ONE PLACE. Since migration 193 a coach can send
 * this week's reflection to any client on any day, so "is she offered
 * this" is no longer the tier alone. Both writes below ask
 * resolveWeeklyReflectionOffer, the identical function the pop-up chain,
 * Home and the route all read through getMyWeeklyReflection, rather than
 * each re-deriving the window and the tier for itself.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { fetchMemberAccessFacts } from '@/lib/membership/service';
import { hasWeeklyReflectionAccess } from '@/lib/weekly-reflection/access';
import { requestCache } from '@/lib/reactRequestCache';
import {
  claimReflectionAssignment,
  claimReflectionDelivery,
  claimWeeklyReflection,
  fetchReflectionAssignment,
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
import { resolveWeeklyReflectionOffer } from '@/lib/weekly-reflection/service';
import {
  isReflectionWindowOpen,
  mostRecentReflectionWeekStart,
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
  // One question, the same one every read surface asks: is this week open
  // for her, and which week is it. A member on the program inside her
  // window and a member whose coach sent her one on a Tuesday both arrive
  // here, and everything below this line is identical for the two of them.
  const offer = await resolveWeeklyReflectionOffer(supabase, user.id, todaysLocalDate(timezone));
  if (!offer) {
    return { ok: false, error: 'This week is not open for you right now.' };
  }
  const { weekStart } = offer;

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
 * from that timezone, and whether the week is open for her from
 * resolveWeeklyReflectionOffer, which is the same answer the surface that
 * displayed it was rendered from. So a hand-built POST cannot record a
 * receipt for another member, for a week nobody opened, or for an account
 * the experience is not offered to.
 *
 * THREE REASONS IT WRITES NOTHING, and each of them is silent on purpose:
 * no session, this week is not open for her (not on the program tier and
 * not assigned, or on the program but outside her Friday-to-Sunday
 * window), or she has already finished this week. A receipt is worth
 * nothing to her and a failure here must never reach her screen.
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
    const offer = await resolveWeeklyReflectionOffer(supabase, user.id, todaysLocalDate(timezone));
    if (!offer) return;
    const { weekStart } = offer;

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

// ---------------------------------------------------------------------
// The one read behind both coach panels.
//
// The status line and the Assign button are two views of one set of
// facts: which week she is standing in, whether a coach already opened
// it, whether it reached her, and whether she finished. Reading those
// twice would be two round trips per fact and, worse, two chances for
// the sentence and the button to disagree about the same week. So both
// exported actions below read this, and it is memoized per request the
// same way lib/weekly-reflection/view.ts memoizes the member's own state.
// ---------------------------------------------------------------------

type CoachReflectionWeekRead = {
  /** HER timezone, which is what every day name in the line is formatted in. */
  timeZone: string;
  /** The Friday that begins the seven day span she is standing in, in her own zone. */
  weekStart: string;
  /** Whether her own Friday-to-Sunday window is open right now. */
  windowOpen: boolean;
  hasProgramTier: boolean;
  assignedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  /** False when any of the three reads failed. Never guess from an empty result. */
  readable: boolean;
};

const readCoachReflectionWeek = requestCache(
  async (clientId: string): Promise<CoachReflectionWeekRead | null> => {
    const user = await getCachedUser();
    if (!user) return null;
    const supabase = createClient();

    const isCoachOrAdmin =
      (await hasActiveRole(supabase, user.id, 'coach')) ||
      (await hasActiveRole(supabase, user.id, 'platform_administrator'));
    if (!isCoachOrAdmin) return null;

    // Test accounts never reach a staff surface, enforced here in the data
    // layer rather than by the screen remembering to check.
    if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return null;

    const timeZone = await memberTimezone(supabase, clientId);
    const localDate = todaysLocalDate(timeZone);
    const weekStart = mostRecentReflectionWeekStart(localDate);
    const windowOpen = isReflectionWindowOpen(localDate);

    const [facts, assignment, delivery, reflection] = await Promise.all([
      fetchMemberAccessFacts(supabase, clientId),
      fetchReflectionAssignment(supabase, clientId, weekStart),
      fetchReflectionDelivery(supabase, clientId, weekStart),
      fetchWeeklyReflection(supabase, clientId, weekStart),
    ]);

    return {
      timeZone,
      weekStart,
      windowOpen,
      hasProgramTier: hasWeeklyReflectionAccess(facts),
      assignedAt: assignment.record?.createdAt ?? null,
      deliveredAt: delivery.record?.deliveredAt ?? null,
      completedAt: reflection.record?.completedAt ?? null,
      readable: assignment.ok && delivery.ok && reflection.ok,
    };
  }
);

export type CoachWeeklyReflectionStatus = {
  /** The week the line is about: the Friday that began the seven day span she is standing in. */
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
 * WHOSE WEEK, AND WHOSE DAY NAMES. Hers. The window and every day name are
 * resolved from HER stored profile timezone, not the coach's browser and
 * not the server's UTC, because the Friday she was offered this on is her
 * Friday. That is also why the sentence is built here rather than passed
 * to the client as a timestamp: the panel is a client component, so a date
 * formatted there would be formatted in whatever zone the coach happens to
 * be sitting in, and would differ between the two render passes.
 *
 * OUTSIDE HER WINDOW, with nothing assigned, there is no current week, so
 * this reports the weekend that most recently closed and the sentence
 * names it. A coach glancing at this on a Wednesday is never left thinking
 * it describes today. An ASSIGNED week is different and the sentence knows
 * it: the assignment is what makes that Wednesday a live day for her, so
 * the line stays in the present tense and says when it was sent.
 *
 * IT NEVER GUESSES. A failed read on any of the three tables resolves to
 * "could not be read", and a week that closed before receipts existed
 * resolves to "no delivery record". Neither ever becomes "they have not
 * opened the app".
 *
 * NULL when nothing opened this week for her at all: not on the program
 * tier, and no coach sent her one. Nothing was ever delivered because
 * nothing was ever offered, and the panel says that in its own words
 * rather than reporting a non-delivery.
 */
export async function getClientWeeklyReflectionStatusAction(
  clientId: string
): Promise<CoachWeeklyReflectionStatus | null> {
  const read = await readCoachReflectionWeek(clientId);
  if (!read) return null;
  if (!read.hasProgramTier && !read.assignedAt) return null;

  const status = resolveReflectionDeliveryStatus({
    weekStart: read.weekStart,
    deliveredAt: read.deliveredAt,
    completedAt: read.completedAt,
    assignedAt: read.assignedAt,
    readable: read.readable,
  });

  return {
    weekStart: read.weekStart,
    windowOpen: read.windowOpen,
    kind: status.kind,
    line: reflectionStatusLine(status, {
      windowOpen: read.windowOpen,
      timeZone: read.timeZone,
      assignedAt: read.assignedAt,
    }),
  };
}

/** Whether this client is on the tier the Weekly Reflection belongs to, so the panel can tell "not on the program" apart from "on the program, nothing written yet". */
export async function getClientWeeklyReflectionAccessAction(clientId: string): Promise<boolean> {
  const read = await readCoachReflectionWeek(clientId);
  return read?.hasProgramTier ?? false;
}

export type CoachWeeklyReflectionAssignState = {
  /** The week the button is about, which is the week the status line is about. One week, one answer. */
  weekStart: string;
  /** Set once a coach has opened this week for her. The button says so and does nothing further. */
  assignedAt: string | null;
  /** She has already finished this week, so there is nothing to send. */
  completed: boolean;
  /**
   * Her plan is already opening this week for her right now: on the
   * program tier, inside her own Friday-to-Sunday window. Assigning would
   * change nothing she can see, so the panel says that instead of offering
   * a button that does nothing.
   */
  automaticallyOffered: boolean;
};

/**
 * What the Assign button should say, and whether it should be there.
 *
 * FOUR STATES, SAID AS FOUR DIFFERENT THINGS, exactly as the Stress & Load
 * panel beside this one does it: already finished, already assigned,
 * already open to her because of her plan, or nothing yet and here is the
 * button. A coach reading the wrong one would either send something twice
 * or think they had sent something they had not.
 *
 * NULL when this coach may not see this client at all, which is the same
 * answer every other read on this screen gives in that case.
 */
export async function getClientWeeklyReflectionAssignStateAction(
  clientId: string
): Promise<CoachWeeklyReflectionAssignState | null> {
  const read = await readCoachReflectionWeek(clientId);
  if (!read) return null;

  return {
    weekStart: read.weekStart,
    assignedAt: read.assignedAt,
    completed: read.completedAt !== null,
    automaticallyOffered: read.hasProgramTier && read.windowOpen,
  };
}

export type AssignWeeklyReflectionResult = { ok: true } | { ok: false; error: string };

/**
 * Sends this week's Weekly Reflection to one client, and does nothing else.
 *
 * WHICH WEEK IS THE SERVER'S ANSWER, NEVER THE BUTTON'S. The client posts
 * a member id and nothing else. The week is re-resolved here from HER
 * stored profile timezone, so a coach in London assigning to a client in
 * Auckland opens the client's week rather than the coach's, and a
 * hand-built request cannot open an arbitrary week.
 *
 * ONE ROW PER MEMBER PER WEEK. claimReflectionAssignment is an
 * insert-if-absent over a unique (member_id, week_start) index, so a
 * double tap and two coaches pressing at once both resolve to the one row
 * that already exists. A duplicate press is a quiet success, not an error,
 * which is the posture assignStressLoadDeepDiveAction already takes.
 *
 * IT CANNOT PRODUCE A SECOND DELIVERY. A program member inside her own
 * window is already being offered this same week, and the assignment names
 * that same Friday, so the reflection row and the delivery receipt (both
 * unique on member and week) each still have exactly one row to be. The
 * panel does not show the button in that case anyway, but the mechanism is
 * what makes it safe rather than the screen.
 *
 * "NO ERROR" IS NOT "IT WORKED": the claim reads the row back, so a write
 * that matched no RLS policy is reported as a failure rather than as a
 * button that changed colour for nothing.
 */
export async function assignWeeklyReflectionAction(
  clientId: string
): Promise<AssignWeeklyReflectionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();

  const isCoachOrAdmin =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return { ok: false, error: 'Not allowed.' };

  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const timeZone = await memberTimezone(supabase, clientId);
  const weekStart = mostRecentReflectionWeekStart(todaysLocalDate(timeZone));

  const { record } = await claimReflectionAssignment(supabase, clientId, weekStart, user.id);
  if (!record) return { ok: false, error: 'We could not send that. Please try again.' };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}
