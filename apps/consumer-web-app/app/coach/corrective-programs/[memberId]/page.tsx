/**
 * Corrective Programs — one member. Shows their latest completed posture
 * assessment findings (with severities), generation controls, and any
 * pending_coach_review drafts already generated for them. Never generates
 * from nothing — a member with no completed static_posture assessment sees
 * a clear empty state instead of generation controls.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Activity, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { getMemberCorrectiveOverviewAction } from '@/app/actions/corrective-programs';
import { FINDING_TYPE_CONFIG, SEVERITY_LABEL } from '@/lib/body-assessment/findings';
import { CORRECTIVE_BLUEPRINTS } from '@/lib/corrective-engine/blueprints';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { GenerateDraftPanel } from './GenerateDraftPanel';
import { displayName } from '@/lib/naming/displayNames';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_TONE: Record<string, string> = {
  none: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  mild: 'bg-amber-50 text-amber-700',
  moderate: 'bg-amber-100 text-amber-800',
  significant: 'bg-red-50 text-red-700',
  unknown: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
};

export default async function CorrectiveProgramsMemberPage({
  params,
}: {
  params: { memberId: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const overview = await getMemberCorrectiveOverviewAction(params.memberId);
  if (!overview) notFound();

  const activeFindings = overview.latestAssessment
    ? overview.latestAssessment.findings.filter((f) =>
        ['pending_review', 'confirmed', 'coach_overridden'].includes(f.status)
      )
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach/corrective-programs" label="Corrective Programs" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Corrective Programs</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {overview.memberName}
          </h1>
        </div>

        {/* ---------------------------------------------------- */}
        {/* Latest posture assessment findings                    */}
        {/* ---------------------------------------------------- */}
        <section className={`${CARD} mt-6 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Latest Posture Assessment
          </p>

          {!overview.latestAssessment ? (
            <p className="mt-3 text-sm text-[#6B7A72]">
              {overview.memberName} doesn&apos;t have a completed posture assessment yet. A corrective
              program can only be generated from real assessment findings, have them complete a
              posture assessment first, then come back here.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#9AA79F]">
                Completed {formatDisplayDate(overview.latestAssessment.completedAt, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>

              {activeFindings.length === 0 ? (
                <p className="mt-3 text-sm text-[#6B7A72]">
                  This assessment has no active findings that map to a corrective pattern, so a
                  program can&apos;t be generated from it.
                </p>
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

              {overview.latestAssessment.patterns.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {overview.latestAssessment.patterns.map((p) => (
                    <span
                      key={p.blueprint}
                      className="rounded-full bg-[#F5B700]/[0.15] px-3 py-1 text-xs font-medium text-[#854D0E]"
                    >
                      {CORRECTIVE_BLUEPRINTS[p.blueprint].name} · {displayName('posture_finding_severity', p.severity)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------------------------------------------------- */}
        {/* Pending drafts                                        */}
        {/* ---------------------------------------------------- */}
        {overview.draftGroups.length > 0 && (
          <section className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Pending Review
            </p>
            <div className="mt-3 divide-y divide-[#1B3A2D]/5 overflow-hidden rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
              {overview.draftGroups.map((group) => {
                const first = group.templates[0];
                const blueprintNames = (first?.corrective_tags ?? [])
                  .map((k) => CORRECTIVE_BLUEPRINTS[k as keyof typeof CORRECTIVE_BLUEPRINTS]?.name ?? k)
                  .join(' + ');
                return (
                  <Link
                    key={group.programGroupTag}
                    href={`/coach/corrective-programs/${overview.memberId}/${encodeURIComponent(group.programGroupTag)}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-[#EFF6F1]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#1B3A2D]">{blueprintNames || 'Corrective program'}</p>
                      <p className="mt-0.5 text-xs text-[#6B7A72]">
                        {group.templates.length}x/week · created {formatDisplayDate(first?.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------- */}
        {/* Generation controls                                   */}
        {/* ---------------------------------------------------- */}
        {overview.latestAssessment && activeFindings.length > 0 && (
          <section className={`${CARD} mt-6 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Generate a New Draft
            </p>
            <GenerateDraftPanel memberId={overview.memberId} />
          </section>
        )}
      </main>

    </div>
  );
}
