/**
 * Coach detail view for one completed WBSA session — full per-question
 * answers and findings, gated purely by the coach_read_assigned_
 * unified_assessment_sessions/_answers RLS policies migration 99 already
 * grants (no new permission added for this page). Mirrors the "list
 * summary is counts-only, full detail lives behind a dedicated route"
 * split BodyAssessmentPanel already established.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getClientWbsaSessionDetailAction } from '@/app/actions/wbsa';
import { PREFER_NOT_TO_ANSWER } from '@/lib/assessment-runtime';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_LABEL: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  significant: 'Significant',
};

function formatAnswer(value: unknown): string {
  if (value === PREFER_NOT_TO_ANSWER) return 'Prefer not to answer';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export default async function CoachWbsaSessionDetailPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const detail = await getClientWbsaSessionDetailAction(params.sessionId);
  if (!detail || detail.session.memberId !== params.id || detail.session.status !== 'completed') {
    notFound();
  }

  const { session, sections } = detail;
  const findingByQuestionKey = new Map(session.findings.map((f) => [f.questionKey, f]));
  const orderedSections = [...sections].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-3xl px-5 pb-safe-nav pt-safe-header sm:px-6 md:px-10 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}` as Route}
          className="mef-focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to client
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          Whole-Body Check-In
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Completed {session.completedAt ? formatDisplayDate(session.completedAt, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          {' · '}Version {session.assessmentVersion}
        </p>

        <div className="mt-6 space-y-5">
          {orderedSections.map((section) => {
            const sectionQuestions = session.visibleQuestions
              .filter((q) => q.section_id === section.id)
              .sort((a, b) => a.display_order - b.display_order);
            if (sectionQuestions.length === 0) return null;

            return (
              <section key={section.id} className={`${CARD} p-6`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {section.title}
                </p>
                <ul className="mt-3 space-y-3">
                  {sectionQuestions.map((question) => {
                    const finding = findingByQuestionKey.get(question.question_key);
                    const answer = session.answers[question.question_key];
                    return (
                      <li key={question.question_key} className="border-t border-[#1B3A2D]/5 pt-3 first:border-none first:pt-0">
                        <p className="text-sm text-[#1B3A2D]">{question.prompt}</p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-[#1B3A2D]">
                            {answer !== undefined ? formatAnswer(answer) : 'Not answered'}
                          </p>
                          {finding && (
                            <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                              {SEVERITY_LABEL[finding.severity] ?? finding.severity}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
