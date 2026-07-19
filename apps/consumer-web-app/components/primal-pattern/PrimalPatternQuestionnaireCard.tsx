/**
 * The Primal Pattern Assessment's card on the /questionnaires page.
 * Deliberately its own small component rather than a reuse of
 * components/questionnaires/QuestionnaireCard.tsx: that component's
 * `latestCompleted` shape is the points-engine's AssessmentSummary
 * (totalScore/totalMaxScore/totalPriority), which has no equivalent here
 * (a letter-count result isn't a score against a max). Same visual
 * language and status -> action mapping as QuestionnaireCard, applied to
 * this questionnaire's own result shape.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Clock3, ListChecks } from 'lucide-react';
import type { PrimalPatternListItem } from '@/app/actions/primal-pattern';
import { STATUS_STYLES } from '@/lib/wellness/status';
import {
  QUESTIONNAIRE_STATUS_LABEL,
  questionnaireStatusToMetricStatus,
} from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'block w-full rounded-2xl bg-[#1B3A2D] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]';
const SECONDARY_LINK = 'text-sm font-medium text-[#1B3A2D] hover:underline';

const RESULT_LABEL: Record<string, string> = {
  polar: 'Polar',
  variable: 'Variable',
  equatorial: 'Equatorial',
};

export function PrimalPatternQuestionnaireCard({ item }: { item: PrimalPatternListItem }) {
  const welcomeHref = `/assessments/${item.questionnaireId}` as Route;
  const takeHref = `/assessments/${item.questionnaireId}/take` as Route;
  const resultsHref = item.latestCompleted
    ? (`/assessments/${item.questionnaireId}/results/${item.latestCompleted.id}` as Route)
    : null;

  const metricStatus = questionnaireStatusToMetricStatus(item.status);

  return (
    <div className={`${CARD} mef-animate-in p-6`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-snug text-[#1B3A2D]">
          {item.title}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[metricStatus].bg} ${STATUS_STYLES[metricStatus].text}`}
        >
          {QUESTIONNAIRE_STATUS_LABEL[item.status]}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{item.listDescription}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1B3A2D]">
        <span className="flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5">
          <ListChecks className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          14 questions
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5">
          <Clock3 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          About {item.estimatedMinutes} min
        </span>
      </div>

      {item.status === 'in_progress' && item.draft && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          {item.draft.answered} of {item.draft.total} questions answered
        </p>
      )}

      {item.status === 'completed' && item.latestCompleted && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Last result: {RESULT_LABEL[item.latestCompleted.result] ?? item.latestCompleted.result}
        </p>
      )}

      <div className="mt-5 space-y-2">
        {item.status === 'not_started' && (
          <Link href={welcomeHref} className={PRIMARY_BUTTON}>
            Start
          </Link>
        )}

        {item.status === 'in_progress' && (
          <Link href={takeHref} className={PRIMARY_BUTTON}>
            Resume
          </Link>
        )}

        {item.status === 'completed' && resultsHref && (
          <>
            <Link href={resultsHref} className={PRIMARY_BUTTON}>
              View Results
            </Link>
            <Link href={welcomeHref} className={`${SECONDARY_LINK} block text-center`}>
              Retake
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
