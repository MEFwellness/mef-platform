import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildBodyAssessmentReportEntryContext } from '@/lib/conversation-coach/entryContext';
import {
  getAssessmentDetailAction,
  getAssessmentComparisonAction,
  listAssessmentAnnotationsAction,
} from '@/app/actions/body-assessment';
import { getAiAnalysisForAssessmentAction } from '@/app/actions/coach-intelligence';
import { listAssessments, listCaptures } from '@/lib/body-assessment/data';
import { createSignedCaptureUrl } from '@/lib/body-assessment/storage';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { PendingCoachReviewCard } from './PendingCoachReviewCard';
import { ClientReportView } from './ClientReportView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function AssessmentDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, detail] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getAssessmentDetailAction(params.id),
  ]);
  if (!detail) notFound();

  const { assessment, captures, coachReviews } = detail;
  const typeConfig = getAssessmentTypeConfig(assessment.assessment_type);

  const [signedCaptures, history, aiWorkspace] = await Promise.all([
    Promise.all(
      captures.map(async (capture) => ({
        capture,
        url: await createSignedCaptureUrl(supabase, capture.storage_path),
      }))
    ),
    listAssessments(supabase, assessment.member_id, { assessmentType: assessment.assessment_type }),
    // RLS (migration 39) narrows this to a published analysis only — a
    // member's own session can never read a draft one. Presence/absence of
    // a result IS the pending-vs-published gate; no app-layer status check
    // needed.
    getAiAnalysisForAssessmentAction('body_assessment', params.id),
  ]);

  const previous = history.find(
    (a) => a.id !== assessment.id && a.started_at < assessment.started_at
  );
  const [comparisonRows, previousSignedCaptures, annotationSets] = await Promise.all([
    previous ? getAssessmentComparisonAction(previous.id, assessment.id) : Promise.resolve([]),
    previous
      ? listCaptures(supabase, previous.id).then((captures) =>
          Promise.all(
            captures.map(async (capture) => ({
              capture,
              url: await createSignedCaptureUrl(supabase, capture.storage_path),
            }))
          )
        )
      : Promise.resolve([]),
    listAssessmentAnnotationsAction(assessment.id),
  ]);
  const annotations = new Map(annotationSets.map((set) => [set.capture_id, set.shapes]));

  const latestReview = coachReviews[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/assessment"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Body Assessment
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {typeConfig.label}
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          {new Date(assessment.started_at).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>

        <div className="mt-6 space-y-5">
          {/* Coach-gated results: a pending confirmation until the coach
              publishes a report, never raw AI findings. Once published,
              ClientReportView renders the captures (annotated) itself, so
              the plain grid below only covers the pending-review state. */}
          {aiWorkspace ? (
            <ClientReportView
              analysis={aiWorkspace.analysis}
              observations={aiWorkspace.observations}
              exercises={aiWorkspace.exercises}
              comparisonRows={comparisonRows}
              previousAssessment={previous ?? null}
              currentCaptures={signedCaptures}
              previousCaptures={previousSignedCaptures}
              annotations={annotations}
            />
          ) : (
            <>
              <PendingCoachReviewCard typeLabel={typeConfig.label} />
              <section>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                  Your captures
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {signedCaptures.map(({ capture, url }) => (
                    <div
                      key={capture.id}
                      className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
                    >
                      <div className="aspect-square w-full bg-black/5">
                        {url ? (
                          capture.media_type === 'video' ? (
                            <video src={url} controls className="h-full w-full object-cover" />
                          ) : (
                            <img
                              src={url}
                              alt={capture.capture_type}
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : null}
                      </div>
                      <p className="p-2 text-center text-xs font-medium capitalize text-[#1B3A2D]">
                        {capture.capture_type.replace('_', ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Coach review */}
          {latestReview && (latestReview.observations || latestReview.recommendations) && (
            <section className={`${CARD} p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                Your coach&apos;s notes
              </p>
              {latestReview.observations && (
                <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
                  {latestReview.observations}
                </p>
              )}
              {latestReview.recommendations && (
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                  {latestReview.recommendations}
                </p>
              )}
            </section>
          )}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />

      {aiWorkspace && (
        <FloatingCoachLauncher
          entryPoint="body_assessment"
          entryContext={buildBodyAssessmentReportEntryContext(
            typeConfig.label,
            aiWorkspace.analysis.coach_summary ?? aiWorkspace.analysis.ai_summary,
            aiWorkspace.observations.length
          )}
        />
      )}
    </div>
  );
}
