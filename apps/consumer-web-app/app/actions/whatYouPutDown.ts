'use server';

/**
 * What You Put Down's writes, and the coach's read.
 *
 * THREE WRITES, EVERY ONE OF THEM REACHED BY A TAP. Saving a draft
 * (Continue), finishing (Finish) and starting the experiment (I'm in). No
 * render leads to any of them, there is no claim on the page and nothing is
 * scheduled. See lib/what-you-put-down/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts her writing and her shelf, and nothing else. The assignment,
 * the doorway column and the experiment protocol are all resolved here, so
 * a hand-built request cannot store a sitting for a member who was never
 * assigned one and cannot start an experiment with a protocol it wrote
 * itself.
 *
 * AND THE CARDS ARE REBUILT HERE, NOT ACCEPTED. Every card on the shelf is
 * derived on this side from the text of her own question one answer
 * (sanitizeWypdShelf), so a posted shelf is only ever a set of references
 * into her own lines. A request that invented a card, or pointed at one she
 * has deleted, stores neither. That is the accuracy rule for this template,
 * enforced on the server as well as in the screen.
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
  findLatestWypdExperiment,
  listWypdDailyLogs,
  upsertWypdDailyLog,
} from '@/lib/what-you-put-down/dailyLogsData';
import {
  clearRootPopupDismissal,
  whatYouPutDownPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import {
  WYPD_DEFAULT_DUE_IN_DAYS,
  WYPD_DEFINITION_ID,
  WYPD_EXPERIENCE_KEY,
} from '@/lib/what-you-put-down/constants';
import {
  completeWypdSession,
  fetchWypdSessionForAssignment,
  fetchPendingWypdAssignment,
  listWypdSessions,
  saveWypdDraft,
} from '@/lib/what-you-put-down/data';
import {
  WYPD_QUESTIONS_VERSION,
  WYPD_CARDS_KEY,
  WYPD_COLUMN_KEY,
  sanitizeWypdAnswers,
  sanitizeWypdDraft,
  wypdSittingComplete,
  type WypdAnswers,
  type WypdDraft,
} from '@/lib/what-you-put-down/questions';
import { sanitizeWypdShelf, type WypdShelfState } from '@/lib/what-you-put-down/shelf';
import { buildWypdExperiment } from '@/lib/what-you-put-down/experiment';
import { WYPD_COPY } from '@/lib/what-you-put-down/copy';

export type SaveWypdDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Save and resume, and nothing else.
 *
 * Called by every Continue between the nine questions, so a member who
 * closes the app on question five comes back to question five with her
 * writing AND her shelf as she left them. It stamps no completion,
 * publishes nothing and revalidates NOTHING: she is standing on the route,
 * and a revalidate would re-render the page underneath her mid-sentence.
 *
 * A failure is reported honestly rather than swallowed, because the screen
 * says "Saved" when this succeeds and must not say it when it did not.
 */
export async function saveWhatYouPutDownDraftAction(
  draft: unknown,
  shelf: unknown
): Promise<SaveWypdDraftResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean: WypdDraft | null = sanitizeWypdDraft(draft);
  if (!clean) return { ok: false, error: WYPD_COPY.submitError };
  // Her own question one lines are the only source of cards, on this side
  // as well as on the screen.
  const cleanShelf: WypdShelfState = sanitizeWypdShelf(shelf, clean[WYPD_CARDS_KEY] ?? '');

  const supabase = createClient();
  const assignmentRead = await fetchPendingWypdAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: WYPD_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const record = await saveWypdDraft(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    questionsVersion: WYPD_QUESTIONS_VERSION,
    draft: clean,
    shelf: cleanShelf,
  });

  // "No error" is not "it worked": saveWypdDraft reads the row back either
  // way, so a write that matched no policy is caught here rather than being
  // reported to her as a save.
  if (!record) return { ok: false, error: WYPD_COPY.submitError };
  return { ok: true };
}

export type SubmitWypdResult =
  | { ok: true; sessionId: string; answers: WypdAnswers; shelf: WypdShelfState }
  | { ok: false; error: string };

/**
 * Finishes her sitting.
 *
 * COMPLETENESS IS CHECKED ON BOTH HALVES. Six of the nine are writing, and
 * the sheet has to be whole. The other three are the shelf, and it has to
 * be whole as well: every card placed, one named, a mark on the line and
 * one card lifted back off. A sitting missing either half is refused here
 * and not merely disabled on the button, because a stale page and a
 * hand-made POST both exist.
 *
 * Idempotent: an already-completed sitting for this assignment is handed
 * straight back, never overwritten and never duplicated, which is what
 * makes a double tap and a second tab both safe.
 *
 * Revalidates HOME ONLY, not this route. She is standing on her closing
 * screen reading her own words, and revalidating the route she is on is
 * exactly how the earlier closings got bounced past.
 */
export async function submitWhatYouPutDownAction(
  answers: unknown,
  shelf: unknown
): Promise<SubmitWypdResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeWypdAnswers(answers);
  if (!clean) return { ok: false, error: WYPD_COPY.incompleteError };
  const cleanShelf = sanitizeWypdShelf(shelf, clean[WYPD_CARDS_KEY] ?? '');
  if (!wypdSittingComplete(clean, cleanShelf)) {
    return { ok: false, error: WYPD_COPY.incompleteError };
  }

  const supabase = createClient();

  const assignmentRead = await fetchPendingWypdAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: WYPD_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }
  const assignmentId = assignmentRead.assignment.id;

  const existing = await fetchWypdSessionForAssignment(supabase, user.id, assignmentId);
  if (existing?.completedAt && existing.answers) {
    return {
      ok: true,
      sessionId: existing.id,
      answers: existing.answers,
      shelf: existing.shelf,
    };
  }

  // sanitizeWypdAnswers has already refused a sheet missing any written
  // key, so this one is present. The fallback keeps the compiler honest
  // about an index read rather than asserting.
  const doorway = (clean[WYPD_COLUMN_KEY] ?? '').trim();

  const record = await completeWypdSession(supabase, user.id, {
    assignmentId,
    questionsVersion: WYPD_QUESTIONS_VERSION,
    answers: clean,
    shelf: cleanShelf,
    doorway,
  });

  if (!record?.completedAt || !record.answers) {
    return { ok: false, error: WYPD_COPY.submitError };
  }

  // The pop-up for this assignment can never be due again (the assignment
  // is closed out by migration 217's trigger, so the chain's branch does
  // not produce a candidate at all), which makes any snooze or ignore row
  // for it dead weight. Same tidy-up every other answered message does.
  await clearRootPopupDismissal(supabase, user.id, whatYouPutDownPopupMessageKey(assignmentId));

  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, answers: record.answers, shelf: record.shelf };
}

export type StartWypdExperimentResult = { ok: true } | { ok: false; error: string };

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
export async function startWhatYouPutDownExperimentAction(
  sessionId: string
): Promise<StartWypdExperimentResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();

  // Her own finished sitting has to exist before an experiment can come
  // from it, so a hand-built request cannot start one off nothing.
  const sessions = await listWypdSessions(supabase, user.id);
  const session = sessions.records.find((record) => record.id === sessionId);
  if (!session) return { ok: false, error: 'We could not find that sitting.' };

  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: WYPD_COPY.experimentCapped };
  }

  // Rebuilt on the SERVER, never taken from the client, so the stored
  // protocol is always the approved one.
  const offer = buildWypdExperiment();

  const timezone = await memberTimezone(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: null,
    title: offer.title,
    protocol: offer.protocol,
    startDate: todaysLocalDate(timezone),
    durationDays: offer.durationDays,
    sourceSessionId: null,
    sourceExperienceKey: WYPD_EXPERIENCE_KEY,
    subjectKey: experienceSubjectKey(WYPD_EXPERIENCE_KEY),
  });
  if (!experiment) return { ok: false, error: 'Could not start this one.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachWypdSession = {
  id: string;
  completedAt: string | null;
  answers: WypdAnswers | null;
  /** Her cards, her placements, her two picks and her position on the line. */
  shelf: WypdShelfState;
  /** Question eight, from its own column (migration 217). */
  doorway: string | null;
};

export type CoachWypdPanelState = {
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
  sessions: CoachWypdSession[];
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check.
 */
export async function getClientWhatYouPutDownPanelAction(
  clientId: string
): Promise<CoachWypdPanelState> {
  const empty: CoachWypdPanelState = {
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
    fetchPendingWypdAssignment(supabase, clientId),
    listWypdSessions(supabase, clientId),
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
      shelf: record.shelf,
      doorway: record.doorway,
    })),
  };
}

export type AssignWypdResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns What You Put Down to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system: RLS on that table is what actually
 * rejects an assignment for a client this coach is not assigned to, and the
 * partial unique index (migration 144) is what makes a duplicate click a
 * quiet no-op rather than an error. It carries a due date seven days from
 * HER own today unless the caller names a day, exactly as the five
 * templates beside it do, so the delivery receipt work has a deadline to
 * measure against.
 *
 * NOTHING IS CHECKED ABOUT ANY OTHER TEMPLATE. A coach may start any member
 * here.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting.
 */
export async function assignWhatYouPutDownAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignWypdResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const existing = await fetchPendingWypdAssignment(supabase, clientId);
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
        WYPD_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: WYPD_DEFINITION_ID,
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

export type WypdExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  /** Null when she has not answered today yet. */
  todayCompleted: boolean | null;
};

/**
 * Her running What You Put Down experiment, or null.
 *
 * Only an ACTIVE one is returned. A seven day run that has passed its own
 * end with no reflection is 'expired_no_reflection' at read time (the
 * existing rule, lib/lifestyle-experiments/lifecycle.ts), so the card stops
 * asking her a daily question about something that is over rather than
 * needing a close-out of its own.
 */
export async function getMyWhatYouPutDownExperimentAction(): Promise<WypdExperimentStatus | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = createClient();
  const latest = await findLatestWypdExperiment(supabase, user.id);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, user.id);
  const now = new Date();
  const experiment = experiments
    .map((entry) => ({ ...entry, status: deriveEffectiveStatus(entry, now) }))
    .find((entry) => entry.id === latest.id);
  if (!experiment || experiment.status !== 'active') return null;

  const todayLocalDate = await localDateFor(supabase, user.id);
  const logs = await listWypdDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((log) => log.localDate === todayLocalDate);

  return {
    experiment,
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    todayCompleted: todayRow?.completed ?? null,
  };
}

/** Her evening tap. One row per calendar day, on the existing shared table. */
export async function logWhatYouPutDownDayAction(
  experimentId: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, user.id);
  const ok = await upsertWypdDailyLog(supabase, user.id, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}
