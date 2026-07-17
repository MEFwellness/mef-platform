import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ScanFace, ChevronRight } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
import {
  ASSESSMENT_TYPE_ORDER,
  ASSESSMENT_TYPE_CONFIG,
} from '@/lib/body-assessment/assessmentTypes';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

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

  const [isCoach, assessments, { data: profile }] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyAssessmentsAction(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#854D0E]">
            <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Body Assessment</p>
          </div>
          <AvatarLink firstName={firstName} />
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Guided posture &amp; movement
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          A premium, camera-guided assessment your coach uses to track posture and movement over
          time. Photos and videos are stored privately and reviewed by your assigned coach only.
        </p>

        <section className="mt-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Start a new assessment
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ASSESSMENT_TYPE_ORDER.map((type) => {
              const config = ASSESSMENT_TYPE_CONFIG[type];
              return (
                <Link
                  key={type}
                  href={{ pathname: '/assessment/new', query: { type } }}
                  className={`${CARD} flex items-center justify-between p-5 transition hover:brightness-[1.02]`}
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
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Your assessment history
          </p>
          {assessments.length === 0 ? (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                No assessments yet — start one above to begin tracking your posture and movement.
              </p>
            </div>
          ) : (
            <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
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
            </ul>
          )}
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
