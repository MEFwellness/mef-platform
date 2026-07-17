import { AlertCircle, CheckCircle2, Dumbbell, Sparkles } from 'lucide-react';
import type {
  AiObservationCategory,
  AssessmentAiAnalysis,
  AssessmentAiObservation,
  AssessmentReportExercise,
  BodyAssessment,
  BodyAssessmentComparison,
} from '@mef/shared-types-contracts';
import { ComparisonSection, type ComparisonCapture } from '@/app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/ComparisonSection';
import { AnnotatedCaptureViewer } from '@/components/body-assessment/AnnotatedCaptureViewer';
import type { AnnotationShape } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

// Only the member-appropriate categories get a label here — 'coach_question'
// and 'red_flag' are coach-internal and RLS (migration 39) never returns
// them for a member's own session in the first place, so there is nothing
// to filter out client-side.
const CATEGORY_LABELS: Partial<Record<AiObservationCategory, string>> = {
  observation: 'What We Noticed',
  compensation: 'Movement Patterns to Be Aware Of',
  four_doctors_consideration: 'Considerations for Your Care Team',
  education_topic: 'Topics Worth Exploring',
  corrective_exercise_category: 'Focus Areas for Your Exercises',
};

const CATEGORY_ORDER: AiObservationCategory[] = [
  'observation',
  'compensation',
  'four_doctors_consideration',
  'education_topic',
  'corrective_exercise_category',
];

// A "key priority" is a moderate-or-significant finding in one of the two
// body-focused categories — the two categories a member should act on
// first, versus care-team considerations or education topics, which are
// context rather than a "look at this" signal.
const PRIORITY_CATEGORIES = new Set<AiObservationCategory>(['observation', 'compensation']);
const SEVERITY_RANK: Record<string, number> = { significant: 3, moderate: 2, mild: 1, unknown: 0, none: -1 };
const MAX_PRIORITIES = 3;

function keyPriorities(observations: AssessmentAiObservation[]): AssessmentAiObservation[] {
  return observations
    .filter((o) => PRIORITY_CATEGORIES.has(o.category) && o.severity && SEVERITY_RANK[o.severity]! >= 2)
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity ?? 'none']! - SEVERITY_RANK[a.severity ?? 'none']! ||
        (b.confidence ?? 0) - (a.confidence ?? 0)
    )
    .slice(0, MAX_PRIORITIES);
}

/**
 * The published, coach-approved report — the "beautiful client report" the
 * Coach Intelligence Workspace produces. Only ever renders data a coach
 * explicitly accepted and published; no confidence scores, no severity, no
 * clinical framing, nothing coach-internal.
 */
export function ClientReportView({
  analysis,
  observations,
  exercises,
  comparisonRows,
  previousAssessment,
  currentCaptures,
  previousCaptures,
  annotations,
}: {
  analysis: AssessmentAiAnalysis;
  observations: AssessmentAiObservation[];
  exercises: AssessmentReportExercise[];
  comparisonRows: BodyAssessmentComparison[];
  previousAssessment: BodyAssessment | null;
  currentCaptures: ComparisonCapture[];
  previousCaptures: ComparisonCapture[];
  annotations: Map<string, AnnotationShape[]>;
}) {
  const summary = analysis.coach_summary ?? analysis.ai_summary;
  const priorities = keyPriorities(observations);

  return (
    <div className="space-y-5">
      {summary && (
        <section className={`${CARD} mef-animate-in p-7`}>
          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Your Coach&apos;s Summary
          </p>
          <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-relaxed text-[#1B3A2D]">
            {summary}
          </p>
        </section>
      )}

      {priorities.length > 0 && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            <AlertCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Key Priorities
          </p>
          <ul className="mt-3 space-y-2.5">
            {priorities.map((observation) => (
              <li
                key={observation.id}
                className="rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]"
              >
                {observation.coach_text ?? observation.ai_text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentCaptures.length > 0 && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your captures
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {currentCaptures.map(({ capture, url }) => (
              <AnnotatedCaptureViewer
                key={capture.id}
                capture={capture}
                url={url}
                shapes={annotations.get(capture.id) ?? []}
                label={capture.capture_type.replace('_', ' ')}
              />
            ))}
          </div>
        </section>
      )}

      {CATEGORY_ORDER.map((category) => {
        const items = observations.filter((o) => o.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className={`${CARD} mef-animate-in p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              {CATEGORY_LABELS[category]}
            </p>
            <ul className="mt-2 space-y-2.5">
              {items.map((observation) => (
                <li key={observation.id} className="flex items-start gap-2 text-sm text-[#1B3A2D]">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{observation.coach_text ?? observation.ai_text}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {exercises.length > 0 && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Recommended Exercises
          </p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="py-2.5">
                <p className="text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                {exercise.description && (
                  <p className="mt-0.5 text-sm text-[#6B7A72]">{exercise.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} mef-animate-in p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Progress since your last assessment
        </p>
        <div className="mt-3">
          <ComparisonSection
            previousAssessment={previousAssessment}
            currentCaptures={currentCaptures}
            previousCaptures={previousCaptures}
            comparisonRows={comparisonRows}
            emptyStateDescription="Complete another assessment to unlock progress comparison."
          />
        </div>
      </section>
    </div>
  );
}
