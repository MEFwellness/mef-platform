import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ScanFace, ChevronRight } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { firstNameFrom } from '@/lib/profile/greeting';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
import {
  ASSESSMENT_TYPE_ORDER,
  ASSESSMENT_TYPE_CONFIG,
} from '@/lib/body-assessment/assessmentTypes';
import { Card, CenterStage } from '@/components/layout';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  submitted: 'Submitted',
  not_configured: 'Awaiting analysis',
  analyzing: 'Analyzing',
  analyzed: 'Analyzed',
  coach_reviewed: 'Reviewed by coach',
  archived: 'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function BodyAssessmentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, assessments, { data: profile }, access] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyAssessmentsAction(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    checkAssessmentAccess(supabase, user.id, 'body-assessment', { intent: 'view' }),
  ]);
  const firstName = firstNameFrom(profile?.display_name);

  // Coach-Assign-Only Gating task (2026-08-04): server-side enforcement,
  // not just hiding the entry points into this page. checkAssessmentAccess
  // always lets through a member with real assessment history or a
  // pending assignment (never hides existing progress) — a denial here
  // only ever happens for a member with zero assessments and no
  // assignment, so replacing the whole page with a graceful message
  // (rather than an error or a crash) never hides real content.
  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <div className="mx-auto flex items-center justify-center gap-2 text-[#6B7A72]">
                <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Body Assessment</p>
              </div>
              <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                Guided posture &amp; movement
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                {describeLockReason(access.reason)}
              </p>
              <Link
                href={'/dashboard' as Route}
                className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
              >
                Back to Home
              </Link>
            </Card>
          </CenterStage>
        </main>

        <MemberBottomNav isCoach={isCoach} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="body_assessment" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Body Assessment</p>
          </div>
          <AvatarLink firstName={firstName} />
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Guided posture &amp; movement
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          A premium, camera-guided assessment your coach uses to track posture and movement over
          time. Photos and videos are stored privately and reviewed by your assigned coach only.
        </p>

        <section className="mt-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Start a new assessment
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ASSESSMENT_TYPE_ORDER.map((type) => {
              const config = ASSESSMENT_TYPE_CONFIG[type];
              return (
                <Card
                  key={type}
                  as={Link}
                  href={{ pathname: '/assessment/new', query: { type } }}
                  lift
                  className="flex items-center justify-between transition hover:brightness-[1.02]"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1B3A2D]">{config.label}</p>
                    <p className="mt-0.5 text-xs text-[#6B7A72]">
                      ~{config.estimatedMinutes} min · {config.captureSteps.length} step
                      {config.captureSteps.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 text-[#9AA79F]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your assessment history
          </p>
          {assessments.length === 0 ? (
            <Card>
              <p className="text-sm text-[#6B7A72]">
                No assessments yet, start one above to begin tracking your posture and movement.
              </p>
            </Card>
          ) : (
            <Card as="ul" className="divide-y divide-[#1B3A2D]/5 !p-0 !px-2">
              {assessments.map((assessment) => (
                <li key={assessment.id}>
                  <Link
                    href={`/assessment/${assessment.id}` as Route}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#1B3A2D]/[0.02]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#1B3A2D]">
                        {ASSESSMENT_TYPE_CONFIG[assessment.assessment_type].label}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6B7A72]">
                        {formatDate(assessment.started_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                      {STATUS_LABEL[assessment.status] ?? assessment.status}
                    </span>
                  </Link>
                </li>
              ))}
            </Card>
          )}
        </section>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
