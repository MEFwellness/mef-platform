/**
 * Assign a Program — step two: this member, and what she can be given.
 *
 * The overview comes first because the choice depends on it: what she said
 * she wanted, how ready she has been saying she is, what her last posture
 * assessment found, and what she is already on. Then the two doors, side by
 * side, named program or corrective.
 *
 * The corrective door is a link to the screens that already exist, not a
 * copy of them. This flow unifies where a coach starts. It does not move
 * anything.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Activity, ChevronRight, ClipboardList, Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { getAssignFlowOverviewAction } from '@/app/actions/assign-flow';
import { listAssignableBlueprintsAction } from '@/app/actions/program-blueprints';
import { FINDING_TYPE_CONFIG, SEVERITY_LABEL } from '@/lib/body-assessment/findings';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { MemberTestAccountChip } from '@/components/staff/MemberTestAccountChip';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_TONE: Record<string, string> = {
  none: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  mild: 'bg-amber-50 text-amber-700',
  moderate: 'bg-amber-100 text-amber-800',
  significant: 'bg-red-50 text-red-700',
  unknown: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
};

export const dynamic = 'force-dynamic';

export default async function AssignProgramMemberPage({
  params,
}: {
  params: { memberId: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const [overview, blueprints] = await Promise.all([
    getAssignFlowOverviewAction(params.memberId),
    listAssignableBlueprintsAction(),
  ]);
  if (!overview) notFound();

  const activeFindings = overview.latestAssessment
    ? overview.latestAssessment.findings.filter((f) =>
        ['pending_review', 'confirmed', 'coach_overridden'].includes(f.status)
      )
    : [];

  const currentPrograms = overview.programs.slice(0, 3);
  const latestGoal = overview.goals[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={'/coach/assign' as Route} label="Assign a Program" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Assign a Program</p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {overview.memberName}
          </h1>
          <MemberTestAccountChip memberId={params.memberId} />
        </div>

        {/* ---------------------------------------------------- */}
        {/* Choose. First, because in the common case nothing      */}
        {/* below it needs reading.                                */}
        {/* ---------------------------------------------------- */}
        <section className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Choose a program
          </p>

          <div className="mt-3 space-y-2">
            {blueprints.length === 0 ? (
              <div className={`${CARD} p-6`}>
                <p className="text-sm text-[#6B7A72]">
                  No named programs are approved yet, so there is nothing to choose from here. An
                  administrator approves them in the Blueprint Library.
                </p>
              </div>
            ) : (
              blueprints.map((blueprint) => (
                <Link
                  key={blueprint.versionId}
                  href={`/coach/assign/${params.memberId}/${blueprint.versionId}` as Route}
                  className={`${CARD} mef-focus-ring block p-5 transition hover:bg-[#FAFAF8]`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Dumbbell
                          className="h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <p className="text-[15px] font-medium text-[#1B3A2D]">
                          {blueprint.displayName}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-[#6B7A72]">
                        {[
                          blueprint.durationWeeks ? `${blueprint.durationWeeks} weeks` : null,
                          blueprint.sessionsPerWeek
                            ? `${blueprint.sessionsPerWeek} sessions a week`
                            : null,
                          blueprint.equipmentMode,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {blueprint.intendedPopulation && (
                        <p className="mt-1.5 text-xs leading-relaxed text-[#9AA79F]">
                          {blueprint.intendedPopulation}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#9AA79F]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              ))
            )}

            {/* The corrective door. Same screens coaches already use. */}
            <Link
              href={`/coach/corrective-programs/${params.memberId}` as Route}
              className={`${CARD} mef-focus-ring block p-5 transition hover:bg-[#FAFAF8]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Activity
                      className="h-4 w-4 shrink-0 text-[#1B3A2D]/50"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <p className="text-[15px] font-medium text-[#1B3A2D]">
                      Generate a corrective program
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-[#6B7A72]">
                    Built from {overview.memberName}&apos;s own posture assessment findings.
                    {activeFindings.length > 0
                      ? ` ${activeFindings.length} finding${activeFindings.length === 1 ? '' : 's'} to work from.`
                      : ' No completed posture assessment to work from yet.'}
                  </p>
                  {overview.draftGroups.length > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-[#854D0E]">
                      {overview.draftGroups.length} draft
                      {overview.draftGroups.length === 1 ? '' : 's'} already waiting for review
                    </p>
                  )}
                </div>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#9AA79F]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
            </Link>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* What she is already on                                */}
        {/* ---------------------------------------------------- */}
        <section className={`${CARD} mt-6 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Current and recent programs
          </p>
          {currentPrograms.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7A72]">
              {overview.memberName} has never been assigned a program.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {currentPrograms.map((program) => (
                <div
                  key={program.assignment.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#FAFAF8] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1B3A2D]">
                      {program.assignment.template_name_snapshot}
                    </p>
                    <p className="mt-0.5 text-xs text-[#9AA79F]">
                      {program.assignment.status} · {program.completedWorkouts} of{' '}
                      {program.totalWorkouts} sessions done
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- */}
        {/* What she has told you                                 */}
        {/* ---------------------------------------------------- */}
        <section className={`${CARD} mt-4 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Goals</p>
          {!latestGoal ? (
            <p className="mt-3 text-sm text-[#6B7A72]">
              {overview.memberName} has not chosen any goals yet.
            </p>
          ) : (
            <>
              {latestGoal.primaryGoal && (
                <p className="mt-3 text-sm text-[#1B3A2D]">
                  Most important: {latestGoal.primaryGoal}
                </p>
              )}
              {latestGoal.goals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {latestGoal.goals.map((goal) => (
                    <span
                      key={goal}
                      className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium text-[#1B3A2D]"
                    >
                      {goal}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className={`${CARD} mt-4 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Readiness</p>
          {!overview.readiness ? (
            <p className="mt-3 text-sm text-[#6B7A72]">
              No morning check-in in the last 30 days answered anything about readiness.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#9AA79F]">
                From her check-in on{' '}
                {formatDisplayDate(overview.readiness.localDate, {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <div className="mt-3 space-y-2">
                {overview.readiness.answers.map((answer) => (
                  <div key={answer.question} className="rounded-2xl bg-[#FAFAF8] p-3">
                    <p className="text-xs text-[#6B7A72]">{answer.question}</p>
                    <p className="mt-0.5 text-sm font-medium text-[#1B3A2D]">{answer.answer}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className={`${CARD} mt-4 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Latest posture assessment
          </p>
          {!overview.latestAssessment ? (
            <p className="mt-3 text-sm text-[#6B7A72]">
              {overview.memberName} has not completed a posture assessment.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#9AA79F]">
                Completed{' '}
                {formatDisplayDate(overview.latestAssessment.completedAt, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              {activeFindings.length === 0 ? (
                <p className="mt-3 text-sm text-[#6B7A72]">No active findings on it.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {activeFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#FAFAF8] p-3"
                    >
                      <p className="text-sm font-medium text-[#1B3A2D]">
                        {FINDING_TYPE_CONFIG[finding.finding_type]?.label ?? finding.finding_type}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${SEVERITY_TONE[finding.severity]}`}
                      >
                        {SEVERITY_LABEL[finding.severity]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
