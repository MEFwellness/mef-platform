/**
 * apps/consumer-web-app/app/actions/coreValuesSnapshotAdmin.ts
 *
 * Testing-only tools for the Core Values Snapshot — reset one specific
 * member's completion so it can be retaken, and time-shift their Weekly
 * Experiment so the day-3/day-7 "From Root" follow-ups can be verified
 * without waiting real days. Nothing here is reachable by a member: every
 * function requires an active `platform_administrator` role, checked
 * explicitly here (same "UX check, RLS is the real boundary" dual
 * discipline as app/actions/admin.ts) AND enforced independently by the
 * existing `platform_admin_all_*` RLS policies already granted on every
 * table these functions touch (migrations 92, 96, 99, 134) — a bug in
 * this file's own check could never let a non-admin actually write
 * another member's data, the database itself would refuse it.
 *
 * Every function takes an explicit memberId and only ever touches that
 * one member's rows — there is no "reset everyone" or "shift everyone"
 * path here.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { getUnifiedAssessmentDefinitionByKey } from '@/lib/assessment-foundation/repository';
import { CVS_KEY, CVS_EXPERIMENT_DURATION_DAYS } from '@/lib/core-values-snapshot/constants';

type SupabaseServerClient = ReturnType<typeof createClient>;

async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseServerClient } | { ok: false; error: string }
> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) return { ok: false, error: 'Admin access required.' };
  return { ok: true, supabase };
}

export type CvsTestableMember = { id: string; displayName: string };

/**
 * Every profile, including is_test-flagged QA fixtures — deliberately NOT
 * filtered the way admin.ts's listUsers() filters them out, since a
 * testing tool is exactly where a test/QA account (or the admin's own
 * everyday member account, used for exploring the app) is the expected
 * target, not an exception to hide.
 */
export async function listCvsTestableMembersAction(): Promise<CvsTestableMember[]> {
  const guard = await requireAdmin();
  if (!guard.ok) return [];

  const { data, error } = await guard.supabase
    .from('profiles')
    .select('id, display_name')
    .order('display_name', { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    displayName: (row.display_name as string | null) ?? (row.id as string).slice(0, 8),
  }));
}

export type CvsAdminActionResult = { ok: true; summary: string } | { ok: false; error: string };

/**
 * RETAKE — clears one member's Core Values Snapshot completion so they can
 * take it again and reach a different interpretation branch: every
 * session+answer, every "What Root Knows So Far" entry this experience
 * wrote, and every Weekly Experiment (+ its daily logs, which cascade)
 * this experience started. Nothing else the member has done elsewhere in
 * the app is touched.
 */
export async function resetCvsForMemberAction(memberId: string): Promise<CvsAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = guard.supabase;

  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY);
  if (!definition) return { ok: false, error: 'Core Values Snapshot content is not set up in this environment.' };

  const { data: deletedSessions, error: sessionsError } = await supabase
    .from('unified_assessment_sessions')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definition.id)
    .select('id');
  if (sessionsError) return { ok: false, error: `Could not clear sessions: ${sessionsError.message}` };

  // "What Root Knows So Far" entries this experience wrote — identified by
  // the same source_refs note every draft in lib/core-values-snapshot/
  // narrative.ts stamps on, regardless of which past session wrote them.
  const { data: deletedNarrative, error: narrativeError } = await supabase
    .from('narrative_items')
    .delete()
    .eq('member_id', memberId)
    .contains('source_refs', JSON.stringify([{ note: 'core-values-snapshot' }]))
    .select('id');
  if (narrativeError) return { ok: false, error: `Could not clear narrative entries: ${narrativeError.message}` };

  // Every Weekly Experiment this experience started — scoped by
  // source_experience_key (migration 138), not the old "recommendation_id
  // is null" heuristic, which also matches Life Signal Check's own
  // experiments now that a second recommendation_id-null experience exists.
  // A real bug fixed here: before this filter, resetting a member's Core
  // Values Snapshot test data silently deleted their Life Signal Check
  // experiment too. cvs_experiment_daily_logs cascades on delete
  // (migration 134).
  const { data: deletedExperiments, error: experimentsError } = await supabase
    .from('lifestyle_experiments')
    .delete()
    .eq('member_id', memberId)
    .eq('source_experience_key', 'core-values-snapshot')
    .select('id');
  if (experimentsError) return { ok: false, error: `Could not clear experiments: ${experimentsError.message}` };

  const sessionCount = deletedSessions?.length ?? 0;
  const narrativeCount = deletedNarrative?.length ?? 0;
  const experimentCount = deletedExperiments?.length ?? 0;

  return {
    ok: true,
    summary: `Reset complete. Removed ${sessionCount} session${sessionCount === 1 ? '' : 's'}, ${narrativeCount} "What Root Knows" entr${narrativeCount === 1 ? 'y' : 'ies'}, and ${experimentCount} experiment${experimentCount === 1 ? '' : 's'}. This member can retake Core Values Snapshot fresh now.`,
  };
}

export type CvsShiftTarget = 3 | 7;
export type CvsShiftPattern = 'mostly_yes' | 'patchy';

/**
 * TIME-SHIFT — moves a member's current Weekly Experiment's start date
 * back so it reads as day 3 or day 7 right now, and clears any
 * previously-shown day-3/day-7 "From Root" message for that exact
 * experiment so the dashboard tile genuinely re-fires next time the
 * member loads it (member_coaching_messages' own de-dup is per topic_key,
 * which is keyed off the experiment's id — see lib/core-values-snapshot/
 * coachingCandidates.ts). For a day-7 shift, also seeds a real daily
 * yes/no pattern across the shifted window so the day-7 reflection has
 * something honest to read, per the two named test cases: mostly_yes
 * (5 yes / 1 not-today / 1 day left untapped) or patchy (1 yes / 2
 * not-today / 4 days left untapped).
 */
export async function shiftCvsExperimentAction(
  memberId: string,
  targetDay: CvsShiftTarget,
  pattern: CvsShiftPattern = 'mostly_yes'
): Promise<CvsAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = guard.supabase;

  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const { data: experiments, error: findError } = await supabase
    .from('lifestyle_experiments')
    .select('id, title, duration_days')
    .eq('member_id', memberId)
    .is('recommendation_id', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (findError) return { ok: false, error: findError.message };

  const experiment = experiments?.[0];
  if (!experiment) {
    return {
      ok: false,
      error: 'This member has no Core Values Snapshot experiment yet, have them complete the assessment and tap "I\'m in" first.',
    };
  }

  const now = new Date();
  const newStart = new Date(now.getTime() - targetDay * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { error: updateError } = await supabase
    .from('lifestyle_experiments')
    .update({ start_date: newStart, updated_at: now.toISOString() })
    .eq('id', experiment.id);
  if (updateError) return { ok: false, error: `Could not shift the start date: ${updateError.message}` };

  await supabase
    .from('member_coaching_messages')
    .delete()
    .eq('member_id', memberId)
    .in('topic_key', [`cvs::${experiment.id}::day3`, `cvs::${experiment.id}::day7`]);

  let seededSummary = '';
  if (targetDay === 7) {
    const durationDays = (experiment.duration_days as number) ?? CVS_EXPERIMENT_DURATION_DAYS;
    // true = yes (5-min happened), false = not-today, null = left untapped
    // (no row at all) — mostly_yes clears the >=70%-yes bar
    // classifyDay7Pattern uses; patchy stays well under it.
    const dailyPattern: (boolean | null)[] =
      pattern === 'mostly_yes'
        ? [true, true, true, true, true, false, null]
        : [true, false, null, null, false, null, null];

    await supabase.from('cvs_experiment_daily_logs').delete().eq('experiment_id', experiment.id);

    const rows = dailyPattern
      .map((completed, dayIndex) => {
        if (completed === null) return null;
        const localDate = new Date(new Date(newStart).getTime() + dayIndex * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        return { experiment_id: experiment.id, member_id: memberId, local_date: localDate, completed };
      })
      .filter((row): row is { experiment_id: string; member_id: string; local_date: string; completed: boolean } => row !== null);

    if (rows.length > 0) {
      const { error: logsError } = await supabase.from('cvs_experiment_daily_logs').insert(rows);
      if (logsError) return { ok: false, error: `Shifted the date but could not seed daily logs: ${logsError.message}` };
    }

    const yesCount = rows.filter((r) => r.completed).length;
    const notTodayCount = rows.filter((r) => !r.completed).length;
    const unloggedCount = durationDays - rows.length;
    seededSummary = ` Seeded a ${pattern === 'mostly_yes' ? 'mostly-yes' : 'patchy'} pattern: ${yesCount} yes, ${notTodayCount} not-today, ${unloggedCount} left untapped.`;
  }

  return {
    ok: true,
    summary: `Shifted "${experiment.title}" to day ${targetDay} (start date now ${newStart}).${seededSummary} Reload the member's dashboard: the day-${targetDay} check-in should appear as its own "From Root" card in the Today section.`,
  };
}
