'use server';

/**
 * The Weight of Yes's writes, and the coach's read.
 *
 * THREE WRITES, EVERY ONE OF THEM REACHED BY A TAP. Saving a draft
 * (Continue), finishing (Finish) and starting the experiment (I'm in). No
 * render leads to any of them, there is no claim on the page and nothing is
 * scheduled. See lib/the-weight-of-yes/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts answers and nothing else. The assignment, the kind-no
 * column, the follow-up flag and the experiment protocol are all resolved
 * here, so a hand-built request cannot store a sitting for a member who was
 * never assigned one, cannot claim a follow-up that never happened, and
 * cannot start an experiment with a protocol it wrote itself.
 *
 * THE FOLLOW-UP FLAG IS SERVER TRUTH. The client is told which version of
 * question one to render, but it never sends that decision back: the save
 * re-resolves it from her own rows before the insert. A member who never
 * finished the earlier template cannot end up with a sitting that claims
 * she did.
 *
 * NOTHING IS SCORED. There is no reading built here, no registry row
 * published and no Root Map dimension, because this experience draws no
 * conclusions about the member. That absence is the feature.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { listAssignmentDeliveries } from '@/lib/assignments/data';
import {
  assignmentStatusLine,
  dueAtForLocalDate,
  dueAtInDays,
  resolveAssignmentProgress,
  type AssignmentProgress,
} from '@/lib/assignments/status';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import {
  countActiveExperiments,
  deriveEffectiveStatus,
  listMyLifestyleExperiments,
  startLifestyleExperiment,
  MAX_ACTIVE_EXPERIMENTS,
  type LifestyleExperiment,
} from '@/lib/lifestyle-experiments';
import { daysSinceStart } from '@/lib/core-values-snapshot/experiment';
import { localDateFor } from './rootMap';
import {
  findLatestTwoyExperiment,
  listTwoyDailyLogs,
  upsertTwoyDailyLog,
} from '@/lib/the-weight-of-yes/dailyLogsData';
import {
  clearRootPopupDismissal,
  theWeightOfYesPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import {
  TWOY_DEFAULT_DUE_IN_DAYS,
  TWOY_DEFINITION_ID,
  TWOY_EXPERIENCE_KEY,
} from '@/lib/the-weight-of-yes/constants';
import {
  completeTwoySession,
  fetchTwoySessionForAssignment,
  fetchPendingTwoyAssignment,
  listTwoySessions,
  saveTwoyDraft,
} from '@/lib/the-weight-of-yes/data';
import { listTglSessions } from '@/lib/the-giving-ledger/data';
import { TGL_DEPOSIT_KEY } from '@/lib/the-giving-ledger/questions';
import { depositForSitting, resolveTwoyFollowUp } from '@/lib/the-weight-of-yes/followUp';
import {
  TWOY_QUESTIONS_VERSION,
  TWOY_COLUMN_KEY,
  sanitizeTwoyAnswers,
  sanitizeTwoyDraft,
  type TwoyAnswers,
  type TwoyDraft,
} from '@/lib/the-weight-of-yes/questions';
import { buildTwoyExperiment } from '@/lib/the-weight-of-yes/experiment';
import { TWOY_COPY } from '@/lib/the-weight-of-yes/copy';

export type SaveTwoyDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Save and resume, and nothing else.
 *
 * Called by every Continue between the nine questions, so a member who
 * closes the app on question five comes back to question five with the
 * first four still written. It stamps no completion, publishes nothing and
 * revalidates NOTHING: she is standing on the route, and a revalidate would
 * re-render the page underneath her mid-sentence.
 *
 * THIS IS WHERE THE FOLLOW-UP FLAG IS SETTLED. The first Continue creates
 * the row, and the version of question one she was shown is written onto it
 * at that moment. Every later save leaves it exactly as it stands
 * (saveTwoyDraft uses it on the insert only), so nothing that happens
 * during her sitting can rewrite which question she answered.
 *
 * A failure is reported honestly rather than swallowed, because the screen
 * says "Saved" when this succeeds and must not say it when it did not.
 */
export async function saveTheWeightOfYesDraftAction(
  draft: unknown
): Promise<SaveTwoyDraftResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean: TwoyDraft | null = sanitizeTwoyDraft(draft);
  if (!clean) return { ok: false, error: TWOY_COPY.submitError };

  const supabase = createClient();
  const assignmentRead = await fetchPendingTwoyAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: TWOY_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const followUp = await resolveTwoyFollowUp(supabase, user.id);

  const record = await saveTwoyDraft(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    questionsVersion: TWOY_QUESTIONS_VERSION,
    draft: clean,
    followUpSourceExperienceKey: followUp?.sourceExperienceKey ?? null,
  });

  // "No error" is not "it worked": saveTwoyDraft reads the row back either
  // way, so a write that matched no policy is caught here rather than being
  // reported to her as a save.
  if (!record) return { ok: false, error: TWOY_COPY.submitError };
  return { ok: true };
}

export type SubmitTwoyResult =
  | { ok: true; sessionId: string; answers: TwoyAnswers }
  | { ok: false; error: string };

/**
 * Finishes her sitting.
 *
 * Idempotent: an already-completed sitting for this assignment is handed
 * straight back, never overwritten and never duplicated, which is what
 * makes a double tap and a second tab both safe.
 *
 * Revalidates HOME ONLY, not this route. She is standing on her closing
 * screen reading her own sentence, and revalidating the route she is on is
 * exactly how the earlier closings got bounced past.
 */
export async function submitTheWeightOfYesAction(answers: unknown): Promise<SubmitTwoyResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeTwoyAnswers(answers);
  if (!clean) return { ok: false, error: TWOY_COPY.incompleteError };

  const supabase = createClient();

  const assignmentRead = await fetchPendingTwoyAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: TWOY_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }
  const assignmentId = assignmentRead.assignment.id;

  const existing = await fetchTwoySessionForAssignment(supabase, user.id, assignmentId);
  if (existing?.completedAt && existing.answers) {
    return { ok: true, sessionId: existing.id, answers: existing.answers };
  }

  // sanitizeTwoyAnswers has already refused a sheet missing any of the nine,
  // so this key is present. The fallback keeps the compiler honest about an
  // index read rather than asserting.
  const kindNo = (clean[TWOY_COLUMN_KEY] ?? '').trim();

  // Only read when the row does not exist yet: a sitting that already has
  // a row already carries its flag, and re-resolving it would be the drift
  // this feature is built to avoid.
  const followUpKey = existing
    ? existing.followUpSourceExperienceKey
    : ((await resolveTwoyFollowUp(supabase, user.id))?.sourceExperienceKey ?? null);

  const record = await completeTwoySession(supabase, user.id, {
    assignmentId,
    questionsVersion: TWOY_QUESTIONS_VERSION,
    answers: clean,
    kindNo,
    followUpSourceExperienceKey: followUpKey,
  });

  if (!record?.completedAt || !record.answers) {
    return { ok: false, error: TWOY_COPY.submitError };
  }

  // The pop-up for this assignment can never be due again (the assignment
  // is closed out by migration 214's trigger, so the chain's branch does
  // not produce a candidate at all), which makes any snooze or ignore row
  // for it dead weight. Same tidy-up every other answered message does.
  await clearRootPopupDismissal(supabase, user.id, theWeightOfYesPopupMessageKey(assignmentId));

  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, answers: record.answers };
}

export type StartTwoyExperimentResult = { ok: true } | { ok: false; error: string };

/**
 * Starts the seven day experiment she just accepted.
 *
 * Goes through the existing lifestyle_experiments machinery, including the
 * two slot cap, so this competes for the same two slots as every other
 * experiment and a member cannot end up running three. Its seven day close
 * is the same read-time expiry every other experiment gets, with no cron
 * and nothing new.
 *
 * `source_session_id` is deliberately left null: that column references
 * unified_assessment_sessions (migration 134) and this experience does not
 * run on that runtime. `source_experience_key` carries the provenance
 * instead, which is what it exists for.
 */
export async function startTheWeightOfYesExperimentAction(
  sessionId: string
): Promise<StartTwoyExperimentResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();

  // Her own finished sitting has to exist before an experiment can come
  // from it, so a hand-built request cannot start one off nothing.
  const sessions = await listTwoySessions(supabase, user.id);
  const session = sessions.records.find((record) => record.id === sessionId);
  if (!session) return { ok: false, error: 'We could not find that sitting.' };

  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: TWOY_COPY.experimentCapped };
  }

  // Rebuilt on the SERVER, never taken from the client, so the stored
  // protocol is always the approved one.
  const offer = buildTwoyExperiment();

  const timezone = await memberTimezone(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: null,
    title: offer.title,
    protocol: offer.protocol,
    startDate: todaysLocalDate(timezone),
    durationDays: offer.durationDays,
    sourceSessionId: null,
    sourceExperienceKey: TWOY_EXPERIENCE_KEY,
  });
  if (!experiment) return { ok: false, error: 'Could not start this one.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachTwoySession = {
  id: string;
  completedAt: string | null;
  answers: TwoyAnswers | null;
  /** Question eight, from its own column (migration 214). */
  kindNo: string | null;
  /**
   * Which earlier experience this sitting followed, when the follow-up
   * version of question one actually ran. Null means the standalone
   * version ran, and the card says so rather than saying nothing.
   */
  followUpSourceExperienceKey: string | null;
  /**
   * Her own answer in that earlier sitting, as it stood when she wrote this
   * one, so the coach reads what she said then beside what she says now.
   * Null when there is no follow-up, or when that answer could not be read.
   */
  followUpSourceAnswer: string | null;
};

export type CoachTwoyPanelState = {
  /** Set while an assignment is open and unanswered. */
  pendingAssignedAt: string | null;
  /**
   * Whether that open assignment reached her, and whether it is late.
   * Null when nothing is open. Resolved on the server against her own
   * calendar day, by the same resolver every other coach assignment uses.
   */
  pendingProgress: AssignmentProgress | null;
  /**
   * That state as the one sentence the panel prints. Written on the server,
   * because its day names have to be read in the MEMBER's timezone and the
   * panel is a client component.
   */
  pendingStatusLine: string | null;
  sessions: CoachTwoySession[];
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check.
 *
 * THE EARLIER SITTINGS ARE ONLY READ WHEN ONE OF HERS ACTUALLY FOLLOWED
 * ONE. A client who has only standalone sittings costs no extra query, and
 * a coach reading her card sees no band about an experience she was never
 * given.
 */
export async function getClientTheWeightOfYesPanelAction(
  clientId: string
): Promise<CoachTwoyPanelState> {
  const empty: CoachTwoyPanelState = {
    pendingAssignedAt: null,
    pendingProgress: null,
    pendingStatusLine: null,
    sessions: [],
  };

  const user = await getCachedUser();
  if (!user) return empty;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return empty;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return empty;

  const [assignmentRead, sessionRead, timezone] = await Promise.all([
    fetchPendingTwoyAssignment(supabase, clientId),
    listTwoySessions(supabase, clientId),
    memberTimezone(supabase, clientId),
  ]);

  const anyFollowUp = sessionRead.records.some(
    (record) => record.followUpSourceExperienceKey !== null
  );
  const sourceSittings = anyFollowUp
    ? (await listTglSessions(supabase, clientId, 8)).records.map((record) => ({
        completedAt: record.completedAt,
        depositRequest: record.depositRequest ?? record.answers?.[TGL_DEPOSIT_KEY] ?? null,
      }))
    : [];

  const open = assignmentRead.assignment;
  const deliveries = await listAssignmentDeliveries(supabase, clientId, open ? [open.id] : []);

  const pendingProgress = open
    ? resolveAssignmentProgress({
        status: 'pending',
        createdAt: open.createdAt,
        dueAt: open.dueAt,
        deliveredAt: deliveries.byAssignmentId.get(open.id)?.deliveredAt ?? null,
        memberToday: todaysLocalDate(timezone),
        readable: deliveries.ok,
      })
    : null;

  return {
    pendingAssignedAt: open?.createdAt ?? null,
    pendingProgress,
    pendingStatusLine: pendingProgress
      ? assignmentStatusLine(pendingProgress, { timeZone: timezone })
      : null,
    sessions: sessionRead.records.map((record) => ({
      id: record.id,
      completedAt: record.completedAt,
      answers: record.answers,
      kindNo: record.kindNo,
      followUpSourceExperienceKey: record.followUpSourceExperienceKey,
      followUpSourceAnswer: record.followUpSourceExperienceKey
        ? depositForSitting(sourceSittings, record.completedAt)
        : null,
    })),
  };
}

export type AssignTwoyResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns The Weight of Yes to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system: RLS on that table is what actually
 * rejects an assignment for a client this coach is not assigned to, and the
 * partial unique index (migration 144) is what makes a duplicate click a
 * quiet no-op rather than an error. It carries a due date seven days from
 * HER own today unless the caller names a day, exactly as the three
 * templates beside it do, so the delivery receipt work has a deadline to
 * measure against.
 *
 * NOTHING IS CHECKED ABOUT ANY OTHER TEMPLATE, and on this one that is the
 * load bearing sentence. A coach may start any member here. Whether her
 * question one arrives as a follow-up is decided later, from her own rows,
 * and it changes the WORDING of one question rather than whether she is
 * allowed in.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting.
 */
export async function assignTheWeightOfYesAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignTwoyResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const existing = await fetchPendingTwoyAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure.
  if (existing.assignment) return { ok: true };

  // Resolved from HER timezone, not the coach's browser and not the
  // server's zone. A named day is taken as the bare calendar day it is.
  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        TWOY_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: TWOY_DEFINITION_ID,
    assigned_by: user.id,
    is_required: true,
    reason: null,
    stage: 'standard',
    due_at: dueAt,
  });

  // A race with another concurrent click hits the partial unique index as a
  // 23505 conflict, which is the same idempotent outcome as the check above
  // finding it first.
  if (error && error.code !== '23505') return { ok: false, error: error.message };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}

// ---------------------------------------------------------------------
// The experiment's dashboard card.
// ---------------------------------------------------------------------

export type TwoyExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  /** Null when she has not answered today yet. */
  todayCompleted: boolean | null;
};

/**
 * Her running The Weight of Yes experiment, or null.
 *
 * Only an ACTIVE one is returned. A seven day run that has passed its own
 * end with no reflection is 'expired_no_reflection' at read time (the
 * existing rule, lib/lifestyle-experiments/lifecycle.ts), so the card stops
 * asking her a daily question about something that is over rather than
 * needing a close-out of its own.
 */
export async function getMyTheWeightOfYesExperimentAction(): Promise<TwoyExperimentStatus | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = createClient();
  const latest = await findLatestTwoyExperiment(supabase, user.id);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, user.id);
  const now = new Date();
  const experiment = experiments
    .map((entry) => ({ ...entry, status: deriveEffectiveStatus(entry, now) }))
    .find((entry) => entry.id === latest.id);
  if (!experiment || experiment.status !== 'active') return null;

  const todayLocalDate = await localDateFor(supabase, user.id);
  const logs = await listTwoyDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((log) => log.localDate === todayLocalDate);

  return {
    experiment,
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    todayCompleted: todayRow?.completed ?? null,
  };
}

/** Her evening tap. One row per calendar day, on the existing shared table. */
export async function logTheWeightOfYesDayAction(
  experimentId: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, user.id);
  const ok = await upsertTwoyDailyLog(supabase, user.id, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}
