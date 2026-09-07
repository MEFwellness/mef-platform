'use server';

/**
 * Your Own Company's writes, and the coach's read.
 *
 * THREE WRITES, EVERY ONE OF THEM REACHED BY A TAP. Saving a draft
 * (Continue), finishing (Finish) and starting the experiment (I'm in). No
 * render leads to any of them, there is no claim on the page and nothing is
 * scheduled. See lib/your-own-company/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts her writing and her picks, and nothing else. The assignment,
 * the rewritten_line column and the experiment protocol are all resolved
 * here, so a hand-built request cannot store a sitting for a member who was
 * never assigned one and cannot start an experiment with a protocol it
 * wrote itself.
 *
 * AND HER LINES ARE REBUILT HERE, NOT ACCEPTED. Every line she can choose
 * between at question eight is derived on this side from the text of her
 * own question three answer (sanitizeYocInstinctState), so a posted state
 * is only ever a set of references into her own lines plus picks filed
 * under keys this template actually asks. A request that invented a line,
 * or pointed at one she has deleted, stores neither. That is the accuracy
 * rule for this template, enforced on the server as well as in the screen.
 *
 * NOTHING IS SCORED. There is no reading built here, no registry row
 * published and no Root Map dimension, because this experience draws no
 * conclusions about the member. The one number anywhere near it is her own
 * count of her own taps, and it is computed from her stored answers rather
 * than stored as a result.
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
  findLatestYocExperiment,
  listYocDailyLogs,
  upsertYocDailyLog,
} from '@/lib/your-own-company/dailyLogsData';
import {
  clearRootPopupDismissal,
  yourOwnCompanyPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import {
  YOC_DEFAULT_DUE_IN_DAYS,
  YOC_DEFINITION_ID,
  YOC_EXPERIENCE_KEY,
} from '@/lib/your-own-company/constants';
import {
  completeYocSession,
  fetchYocSessionForAssignment,
  fetchPendingYocAssignment,
  listYocSessions,
  saveYocDraft,
} from '@/lib/your-own-company/data';
import {
  YOC_QUESTIONS_VERSION,
  YOC_LINES_KEY,
  YOC_COLUMN_KEY,
  sanitizeYocAnswers,
  sanitizeYocDraft,
  sanitizeYocInstinctState,
  yocSittingComplete,
  type YocAnswers,
  type YocDraft,
} from '@/lib/your-own-company/questions';
import type { YocInstinctState } from '@/lib/your-own-company/instinct';
import { buildYocExperiment } from '@/lib/your-own-company/experiment';
import { YOC_COPY } from '@/lib/your-own-company/copy';

export type SaveYocDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Save and resume, and nothing else.
 *
 * Called by every Continue between the nine questions, so a member who
 * closes the app on question five comes back to question five with her
 * writing AND her picks as she left them. It stamps no completion,
 * publishes nothing and revalidates NOTHING: she is standing on the route,
 * and a revalidate would re-render the page underneath her mid-sentence.
 *
 * A failure is reported honestly rather than swallowed, because the screen
 * says "Saved" when this succeeds and must not say it when it did not.
 */
export async function saveYourOwnCompanyDraftAction(
  draft: unknown,
  instinct: unknown
): Promise<SaveYocDraftResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean: YocDraft | null = sanitizeYocDraft(draft);
  if (!clean) return { ok: false, error: YOC_COPY.submitError };
  // Her own question three lines are the only source of lines, on this side
  // as well as on the screen.
  const cleanInstinct: YocInstinctState = sanitizeYocInstinctState(
    instinct,
    clean[YOC_LINES_KEY] ?? ''
  );

  const supabase = createClient();
  const assignmentRead = await fetchPendingYocAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: YOC_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const record = await saveYocDraft(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    questionsVersion: YOC_QUESTIONS_VERSION,
    draft: clean,
    instinct: cleanInstinct,
  });

  // "No error" is not "it worked": saveYocDraft reads the row back either
  // way, so a write that matched no policy is caught here rather than being
  // reported to her as a save.
  if (!record) return { ok: false, error: YOC_COPY.submitError };
  return { ok: true };
}

export type SubmitYocResult =
  | { ok: true; sessionId: string; answers: YocAnswers; instinct: YocInstinctState }
  | { ok: false; error: string };

/**
 * Finishes her sitting.
 *
 * COMPLETENESS IS CHECKED ON BOTH HALVES. All nine of the questions carry
 * writing, and the sheet has to be whole. Five of them also carry a choice,
 * and those have to be made as well: three picks, the whole rapid round, and
 * the line she named as cutting deepest. A sitting missing either half is
 * refused here and not merely disabled on the button, because a stale page
 * and a hand-made POST both exist.
 *
 * Idempotent: an already-completed sitting for this assignment is handed
 * straight back, never overwritten and never duplicated, which is what
 * makes a double tap and a second tab both safe.
 *
 * Revalidates HOME ONLY, not this route. She is standing on her closing
 * screen reading her own words, and revalidating the route she is on is
 * exactly how the earlier closings got bounced past.
 */
export async function submitYourOwnCompanyAction(
  answers: unknown,
  instinct: unknown
): Promise<SubmitYocResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeYocAnswers(answers);
  if (!clean) return { ok: false, error: YOC_COPY.incompleteError };
  const cleanInstinct = sanitizeYocInstinctState(instinct, clean[YOC_LINES_KEY] ?? '');
  if (!yocSittingComplete(clean, cleanInstinct)) {
    return { ok: false, error: YOC_COPY.incompleteError };
  }

  const supabase = createClient();

  const assignmentRead = await fetchPendingYocAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: YOC_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }
  const assignmentId = assignmentRead.assignment.id;

  const existing = await fetchYocSessionForAssignment(supabase, user.id, assignmentId);
  if (existing?.completedAt && existing.answers) {
    return {
      ok: true,
      sessionId: existing.id,
      answers: existing.answers,
      instinct: existing.instinct,
    };
  }

  // sanitizeYocAnswers has already refused a sheet missing any key, so this
  // one is present. The fallback keeps the compiler honest about an index
  // read rather than asserting.
  const rewrittenLine = (clean[YOC_COLUMN_KEY] ?? '').trim();

  const record = await completeYocSession(supabase, user.id, {
    assignmentId,
    questionsVersion: YOC_QUESTIONS_VERSION,
    answers: clean,
    instinct: cleanInstinct,
    rewrittenLine,
  });

  if (!record?.completedAt || !record.answers) {
    return { ok: false, error: YOC_COPY.submitError };
  }

  // The pop-up for this assignment can never be due again (the assignment
  // is closed out by migration 218's trigger, so the chain's branch does
  // not produce a candidate at all), which makes any snooze or ignore row
  // for it dead weight. Same tidy-up every other answered message does.
  await clearRootPopupDismissal(supabase, user.id, yourOwnCompanyPopupMessageKey(assignmentId));

  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, answers: record.answers, instinct: record.instinct };
}

export type StartYocExperimentResult = { ok: true } | { ok: false; error: string };

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
export async function startYourOwnCompanyExperimentAction(
  sessionId: string
): Promise<StartYocExperimentResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();

  // Her own finished sitting has to exist before an experiment can come
  // from it, so a hand-built request cannot start one off nothing.
  const sessions = await listYocSessions(supabase, user.id);
  const session = sessions.records.find((record) => record.id === sessionId);
  if (!session) return { ok: false, error: 'We could not find that sitting.' };

  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: YOC_COPY.experimentCapped };
  }

  // Rebuilt on the SERVER, never taken from the client, so the stored
  // protocol is always the approved one.
  const offer = buildYocExperiment();

  const timezone = await memberTimezone(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: null,
    title: offer.title,
    protocol: offer.protocol,
    startDate: todaysLocalDate(timezone),
    durationDays: offer.durationDays,
    sourceSessionId: null,
    sourceExperienceKey: YOC_EXPERIENCE_KEY,
    subjectKey: experienceSubjectKey(YOC_EXPERIENCE_KEY),
  });
  if (!experiment) return { ok: false, error: 'Could not start this one.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachYocSession = {
  id: string;
  completedAt: string | null;
  answers: YocAnswers | null;
  /** Her picks, her round, her own lines and the one she named. */
  instinct: YocInstinctState;
  /** Question eight, from its own column (migration 218). */
  rewrittenLine: string | null;
};

export type CoachYocPanelState = {
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
  sessions: CoachYocSession[];
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check.
 */
export async function getClientYourOwnCompanyPanelAction(
  clientId: string
): Promise<CoachYocPanelState> {
  const empty: CoachYocPanelState = {
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
    fetchPendingYocAssignment(supabase, clientId),
    listYocSessions(supabase, clientId),
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
      instinct: record.instinct,
      rewrittenLine: record.rewrittenLine,
    })),
  };
}

export type AssignYocResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns Your Own Company to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system: RLS on that table is what actually
 * rejects an assignment for a client this coach is not assigned to, and the
 * partial unique index (migration 144) is what makes a duplicate click a
 * quiet no-op rather than an error. It carries a due date seven days from
 * HER own today unless the caller names a day, exactly as the six templates
 * beside it do, so the delivery receipt work has a deadline to measure
 * against.
 *
 * NOTHING IS CHECKED ABOUT ANY OTHER TEMPLATE. A coach may start any member
 * here.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting.
 */
export async function assignYourOwnCompanyAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignYocResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const existing = await fetchPendingYocAssignment(supabase, clientId);
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
        YOC_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: YOC_DEFINITION_ID,
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

export type YocExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  /** Null when she has not answered today yet. */
  todayCompleted: boolean | null;
};

/**
 * Her running Your Own Company experiment, or null.
 *
 * Only an ACTIVE one is returned. A seven day run that has passed its own
 * end with no reflection is 'expired_no_reflection' at read time (the
 * existing rule, lib/lifestyle-experiments/lifecycle.ts), so the card stops
 * asking her a daily question about something that is over rather than
 * needing a close-out of its own.
 */
export async function getMyYourOwnCompanyExperimentAction(): Promise<YocExperimentStatus | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = createClient();
  const latest = await findLatestYocExperiment(supabase, user.id);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, user.id);
  const now = new Date();
  const experiment = experiments
    .map((entry) => ({ ...entry, status: deriveEffectiveStatus(entry, now) }))
    .find((entry) => entry.id === latest.id);
  if (!experiment || experiment.status !== 'active') return null;

  const todayLocalDate = await localDateFor(supabase, user.id);
  const logs = await listYocDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((log) => log.localDate === todayLocalDate);

  return {
    experiment,
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    todayCompleted: todayRow?.completed ?? null,
  };
}

/** Her evening tap. One row per calendar day, on the existing shared table. */
export async function logYourOwnCompanyDayAction(
  experimentId: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, user.id);
  const ok = await upsertYocDailyLog(supabase, user.id, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}
