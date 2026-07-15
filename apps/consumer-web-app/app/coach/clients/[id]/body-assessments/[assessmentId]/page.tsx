import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { AnnotationShape, BodyAssessmentCaptureType } from '@mef/shared-types-contracts';
import {
  getAssessmentComparisonAction,
  getAssessmentNoteAction,
  getClientBodyAssessmentsAction,
  getClientBodyAssessmentDetailAction,
  listAssessmentAnnotationsAction,
} from '@/app/actions/body-assessment';
import { getAiAnalysisForAssessmentAction } from '@/app/actions/coach-intelligence';
import { createSignedCaptureUrl } from '@/lib/body-assessment/storage';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { ReviewWorkspace } from './ReviewWorkspace';
import type { RailCapture } from './CaptureRail';
import type { ComparisonCapture } from './RightPanel/ComparisonSection';

const CAPTURE_TYPE_LABELS: Record<BodyAssessmentCaptureType, string> = {
  front: 'Front View',
  left_side: 'Left Side',
  right_side: 'Right Side',
  back: 'Rear View',
  walking: 'Walking',
  movement: 'Movement',
  custom: 'Capture',
};

export default async function CoachBodyAssessmentDetailPage({
  params,
}: {
  params: { id: string; assessmentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();

  const detail = await getClientBodyAssessmentDetailAction(params.assessmentId);
  if (!detail || detail.assessment.member_id !== params.id) notFound();

  const { assessment, captures, coachReviews, findings } = detail;
  const typeConfig = getAssessmentTypeConfig(assessment.assessment_type);
  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This client';

  const [signedCaptures, annotationSets, note, history, aiWorkspace] = await Promise.all([
    Promise.all(
      captures.map(async (capture) => ({
        capture,
        url: await createSignedCaptureUrl(supabase, capture.storage_path),
      }))
    ),
    listAssessmentAnnotationsAction(params.assessmentId),
    getAssessmentNoteAction(params.assessmentId),
    getClientBodyAssessmentsAction(params.id),
    getAiAnalysisForAssessmentAction('body_assessment', params.assessmentId),
  ]);

  const annotationsByCapture: Record<string, AnnotationShape[]> = {};
  for (const set of annotationSets) annotationsByCapture[set.capture_id] = set.shapes;

  const railCaptures: RailCapture[] = signedCaptures.map(({ capture, url }) => ({
    capture,
    url,
    hasAnnotations: (annotationsByCapture[capture.id]?.length ?? 0) > 0,
    label: CAPTURE_TYPE_LABELS[capture.capture_type],
  }));

  // Comparison is against the previous assessment of the SAME type (matching
  // runComparisonAgainstPrevious in app/actions/body-assessment.ts) — history
  // itself spans every type and stays unfiltered for the Timeline section.
  const previousAssessment =
    history.find(
      (a) =>
        a.id !== assessment.id &&
        a.assessment_type === assessment.assessment_type &&
        a.started_at < assessment.started_at
    ) ?? null;

  const [previousCapturesRaw, comparisonRows] = await Promise.all([
    previousAssessment
      ? getClientBodyAssessmentDetailAction(previousAssessment.id).then((d) => d?.captures ?? [])
      : Promise.resolve([]),
    previousAssessment
      ? getAssessmentComparisonAction(previousAssessment.id, assessment.id)
      : Promise.resolve([]),
  ]);

  const previousCaptures: ComparisonCapture[] = await Promise.all(
    previousCapturesRaw.map(async (capture) => ({
      capture,
      url: await createSignedCaptureUrl(supabase, capture.storage_path),
    }))
  );

  let coachName: string | null = null;
  const latestReview = coachReviews[0];
  if (latestReview) {
    const { data: coachProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', latestReview.coach_id)
      .single();
    coachName = coachProfile?.display_name ?? null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pl-28 lg:max-w-6xl">
        <Link
          href={`/coach/clients/${params.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D]">
          {typeConfig.label}
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          {firstName} ·{' '}
          {new Date(assessment.started_at).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>

        <div className="mt-6">
          <ReviewWorkspace
            clientId={params.id}
            assessmentId={assessment.id}
            typeLabel={typeConfig.label}
            assessment={assessment}
            captures={railCaptures}
            annotationsByCapture={annotationsByCapture}
            note={note}
            coachName={coachName}
            history={history}
            previousAssessment={previousAssessment}
            previousCaptures={previousCaptures}
            comparisonRows={comparisonRows}
            aiWorkspace={aiWorkspace}
            aiSourceFeature="body_assessment"
            findings={findings}
          />
        </div>
      </main>
    </div>
  );
}
