/**
 * The Questionnaires card on Home — a compact, premium summary of every
 * registered wellness questionnaire (lib/assessments/registry.ts) plus the
 * Primal Pattern Assessment, which live in the same member-facing
 * "Questionnaires" area (app/questionnaires/page.tsx) but ship from two
 * separate result shapes (see PrimalPatternListItem's doc comment). This
 * card normalizes both into HomeQuestionnaireItem so Home only needs to
 * know title/status/draft-progress/result-id, never the underlying score
 * shape.
 *
 * Deliberately questionnaire-count-agnostic: shows up to MAX_VISIBLE rows
 * inline (today that's every questionnaire that exists), and a
 * "View all" action once there are more than that — so this stays a quick
 * glance-and-tap card on Home rather than growing tall as the registry
 * grows toward its ~10 planned questionnaires.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardList, ChevronRight } from 'lucide-react';
import type { QuestionnaireStatus } from '@/lib/assessments/engine/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const MAX_VISIBLE = 3;

export type HomeQuestionnaireItem = {
  questionnaireId: string;
  title: string;
  status: QuestionnaireStatus;
  draft: { answered: number; total: number } | null;
  resultId: string | null;
};

function subtextFor(item: HomeQuestionnaireItem): string {
  if (item.status === 'in_progress' && item.draft) {
    return `${item.draft.answered} of ${item.draft.total} answered`;
  }
  if (item.status === 'completed') return 'Completed — tap to review';
  return 'Not started';
}

function primaryHrefFor(item: HomeQuestionnaireItem): Route {
  if (item.status === 'in_progress') {
    return `/assessments/${item.questionnaireId}/take` as Route;
  }
  if (item.status === 'completed' && item.resultId) {
    return `/assessments/${item.questionnaireId}/results/${item.resultId}` as Route;
  }
  return `/assessments/${item.questionnaireId}` as Route;
}

export function QuestionnairesHomeCard({ items }: { items: HomeQuestionnaireItem[] }) {
  if (items.length === 0) return null;

  const completedCount = items.filter((item) => item.status === 'completed').length;
  const allComplete = completedCount === items.length;
  const visible = items.slice(0, MAX_VISIBLE);
  const remaining = items.length - visible.length;

  return (
    <section className={`${CARD} mef-animate-in p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-semibold text-[#1B3A2D]">
          {completedCount} of {items.length} complete
        </span>
      </div>

      <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
        Wellness Questionnaires
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        {allComplete
          ? 'All assessments complete. Root is using these to personalize your coaching.'
          : 'In-depth, self-reported check-ins Root uses to personalize your coaching.'}
      </p>

      <div className="mt-4 space-y-2">
        {visible.map((item) => (
          <div
            key={item.questionnaireId}
            className="flex items-center gap-2 rounded-2xl border border-[#1B3A2D]/8 px-4 py-3"
          >
            <Link
              href={primaryHrefFor(item)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#1B3A2D]">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-[#6B7A72]">{subtextFor(item)}</p>
              </div>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-[#1B3A2D]/30"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
            {item.status === 'completed' && (
              <Link
                href={`/assessments/${item.questionnaireId}` as Route}
                className="shrink-0 text-xs font-medium text-[#1B3A2D] hover:underline"
              >
                Retake
              </Link>
            )}
          </div>
        ))}
      </div>

      <Link
        href={'/questionnaires' as Route}
        className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-[#1B3A2D] hover:underline"
      >
        {remaining > 0 ? `View all ${items.length} questionnaires` : 'View questionnaires'}
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </section>
  );
}
