'use server';

/**
 * The Giving Ledger's writes, and the coach's read.
 *
 * THREE WRITES, EVERY ONE OF THEM REACHED BY A TAP. Saving a draft
 * (Continue), finishing (Finish) and starting the experiment (I'm in). No
 * render leads to any of them, there is no claim on the page and nothing is
 * scheduled. See lib/the-giving-ledger/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts answers and nothing else. The assignment, the deposit column
 * and the experiment protocol are all resolved here, so a hand-built
 * request cannot store a sitting for a member who was never assigned one,
 * and cannot start an experiment with a protocol it wrote itself.
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
import { experienceSubjectKey } from '@/lib/lifestyle-experiments/subject';
import { daysSinceStart } from '@/lib/core-values-snapshot/experiment';
import { localDateFor } from './rootMap';
import {
  findLatestTglExperiment,
  listTglDailyLogs,
  upsertTglDailyLog,
} from '@/lib/the-giving-ledger/dailyLogsData';
import {
  clearRootPopupDismissal,
  theGivingLedgerPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import {
  TGL_DEFAULT_DUE_IN_DAYS,
  TGL_DEFINITION_ID,
  TGL_EXPERIENCE_KEY,
} from '@/lib/the-giving-ledger/constants';
import {
  completeTglSession,
  fetchTglSessionForAssignment,
  fetchPendingTglAssignment,
  listTglSessions,
  saveTglDraft,
} from '@/lib/the-giving-ledger/data';
import {
  TGL_QUESTIONS_VERSION,
  TGL_DEPOSIT_KEY,
  sanitizeTglAnswers,
  sanitizeTglDraft,
  type TglAnswers,
  type TglDraft,
} from '@/lib/the-giving-ledger/questions';
import { buildTglExperiment } from '@/lib/the-giving-ledger/experiment';
import { TGL_COPY } from '@/lib/the-giving-ledger/copy';

export type SaveTglDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Save and resume, and nothing else.
 *
 * Called by every Continue between the nine questions, so a member who
 * closes the app on question five comes back to question five with the
 * first four still written. It stamps no completion, publishes nothing and
 * revalidates NOTHING: she is standing on the route, and a revalidate would
 * re-render the page underneath her mid-sentence.
 *
 * A failure is reported honestly rather than swallowed, because the screen
 * says "Saved" when this succeeds and must not say it when it did not.
 */
export async function saveTheGivingLedgerDraftAction(
  draft: unknown
): Promise<SaveTglDraftResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean: TglDraft | null = sanitizeTglDraft(draft);
  if (!clean) return { ok: false, error: TGL_COPY.submitError };

  const supabase = createClient();
  const assignmentRead = await fetchPendingTglAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: TGL_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const record = await saveTglDraft(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    questionsVersion: TGL_QUESTIONS_VERSION,
    draft: clean,
  });

  // "No error" is not "it worked": saveTglDraft reads the row back either
  // way, so a write that matched no policy is caught here rather than being
  // reported to her as a save.
  if (!record) return { ok: false, error: TGL_COPY.submitError };
  return { ok: true };
}

export type SubmitTglResult =
  | { ok: true; sessionId: string; answers: TglAnswers }
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
export async function submitTheGivingLedgerAction(answers: unknown): Promise<SubmitTglResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeTglAnswers(answers);
  if (!clean) return { ok: false, error: TGL_COPY.incompleteError };

  const supabase = createClient();

  const assignmentRead = await fetchPendingTglAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: TGL_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }
  const assignmentId = assignmentRead.assignment.id;

  const existing = await fetchTglSessionForAssignment(supabase, user.id, assignmentId);
  if (existing?.completedAt && existing.answers) {
    return { ok: true, sessionId: existing.id, answers: existing.answers };
  }

  // sanitizeTglAnswers has already refused a sheet missing any of the nine,
  // so this key is present. The fallback keeps the compiler honest about an
  // index read rather than asserting.
  const depositRequest = (clean[TGL_DEPOSIT_KEY] ?? '').trim();

  const record = await completeTglSession(supabase, user.id, {
    assignmentId,
    questionsVersion: TGL_QUESTIONS_VERSION,
    answers: clean,
    depositRequest,
  });

  if (!record?.completedAt || !record.answers) {
    return { ok: false, error: TGL_COPY.submitError };
  }

  // The pop-up for this assignment can never be due again (the assignment
  // is closed out by migration 213's trigger, so the chain's branch does
  // not produce a candidate at all), which makes any snooze or ignore row
  // for it dead weight. Same tidy-up every other answered message does.
  await clearRootPopupDismissal(supabase, user.id, theGivingLedgerPopupMessageKey(assignmentId));

  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, answers: record.answers };
}

export type StartTglExperimentResult = { ok: true } | { ok: false; error: string };

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
export async function startTheGivingLedgerExperimentAction(
  sessionId: string
): Promise<StartTglExperimentResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();

  // Her own finished sitting has to exist before an experiment can come
  // from it, so a hand-built request cannot start one off nothing.
  const sessions = await listTglSessions(supabase, user.id);
  const session = sessions.records.find((record) => record.id === sessionId);
  if (!session) return { ok: false, error: 'We could not find that sitting.' };

  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: TGL_COPY.experimentCapped };
  }

  // Rebuilt on the SERVER, never taken from the client, so the stored
  // protocol is always the approved one.
  const offer = buildTglExperiment();

  const timezone = await memberTimezone(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: null,
    title: offer.title,
    protocol: offer.protocol,
    startDate: todaysLocalDate(timezone),
    durationDays: offer.durationDays,
    sourceSessionId: null,
    sourceExperienceKey: TGL_EXPERIENCE_KEY,
    subjectKey: experienceSubjectKey(TGL_EXPERIENCE_KEY),
  });
  if (!experiment) return { ok: false, error: 'Could not start this one.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachTglSession = {
  id: string;
  completedAt: string | null;
  answers: TglAnswers | null;
  /** Question eight, from its own column (migration 213). */
  depositRequest: string | null;
  /**
   * Which earlier experience this sitting follows. Null for this template,
   * by design: a coach may start any member here, so nothing precedes it.
   * The field exists so the template that IS genuinely a follow-up has
   * somewhere honest to record what it follows.
   */
  followUpSourceExperienceKey: string | null;
};

export type CoachTglPanelState = {
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
  sessions: CoachTglSession[];
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check.
 */
export async function getClientTheGivingLedgerPanelAction(
  clientId: string
): Promise<CoachTglPanelState> {
  const empty: CoachTglPanelState = {
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
    fetchPendingTglAssignment(supabase, clientId),
    listTglSessions(supabase, clientId),
    memberTimezone(supabase, clientId),
  ]);

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
      depositRequest: record.depositRequest,
      followUpSourceExperienceKey: record.followUpSourceExperienceKey,
    })),
  };
}

export type AssignTglResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns The Giving Ledger to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system: RLS on that table is what actually
 * rejects an assignment for a client this coach is not assigned to, and the
 * partial unique index (migration 144) is what makes a duplicate click a
 * quiet no-op rather than an error. It carries a due date seven days from
 * HER own today unless the caller names a day, exactly as the two templates
 * beside it do, so the delivery receipt work has a deadline to measure
 * against.
 *
 * NOTHING IS CHECKED ABOUT THE OTHER TWO TEMPLATES. A coach may start any
 * member here, and a prerequisite would be the second invisible lock the
 * standing rules forbid.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting.
 * That works with no special case here: a completed assignment has left
 * 'pending', so the index no longer covers it, and the new row is a new
 * invitation with its own pop-up key, its own due date and its own delivery
 * receipt. Nothing about the prior completion is touched.
 */
export async function assignTheGivingLedgerAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignTglResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const existing = await fetchPendingTglAssignment(supabase, clientId);
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
        TGL_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: TGL_DEFINITION_ID,
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

export type TglExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  /** Null when she has not answered today yet. */
  todayCompleted: boolean | null;
};

/**
 * Her running The Giving Ledger experiment, or null.
 *
 * Only an ACTIVE one is returned. A seven day run that has passed its own
 * end with no reflection is 'expired_no_reflection' at read time (the
 * existing rule, lib/lifestyle-experiments/lifecycle.ts), so the card stops
 * asking her a daily question about something that is over rather than
 * needing a close-out of its own.
 */
export async function getMyTheGivingLedgerExperimentAction(): Promise<TglExperimentStatus | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = createClient();
  const latest = await findLatestTglExperiment(supabase, user.id);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, user.id);
  const now = new Date();
  const experiment = experiments
    .map((entry) => ({ ...entry, status: deriveEffectiveStatus(entry, now) }))
    .find((entry) => entry.id === latest.id);
  if (!experiment || experiment.status !== 'active') return null;

  const todayLocalDate = await localDateFor(supabase, user.id);
  const logs = await listTglDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((log) => log.localDate === todayLocalDate);

  return {
    experiment,
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    todayCompleted: todayRow?.completed ?? null,
  };
}

/** Her evening tap. One row per calendar day, on the existing shared table. */
export async function logTheGivingLedgerDayAction(
  experimentId: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, user.id);
  const ok = await upsertTglDailyLog(supabase, user.id, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}
