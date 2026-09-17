/**
 * One Health Appraisal sitting, read end to end by the coach.
 *
 * THE COACH NEVER CALCULATES ANYTHING. Every number here was stored by the
 * database at completion: the section's raw total, and the value behind each
 * answer. Nothing on this page adds anything up.
 *
 * LOUDEST FIRST, TWICE OVER. The 21 sections stand Red, then Yellow, then
 * Green. Inside a section the answers stand by what each was worth, highest
 * first, so the handful of responses that made a section Red is the first
 * thing he reads and the reason for a result is never hidden behind the
 * result.
 *
 * THE BODY MAP IS KEPT APART FROM THE SCORED CONTENT, because it is not
 * scored: no mark ever reaches a section total, and the engine does not read
 * the table. It sits in its own block, after the sections, and says so.
 *
 * GATED BY THE DATABASE, NOT BY THIS PAGE. getClientHaqSittingAction reads
 * through the coach's own session, so migration 262's policies decide: an
 * active coach role AND an active assignment to this member, or an
 * administrator. A member session reads zero rows from every table behind
 * this page.
 *
 * NOTHING HERE WRITES. Opening a sitting cannot change it, and a retake is a
 * new instance that leaves this one exactly as it is.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getClientHaqSittingAction } from '@/app/actions/haqCoachReading';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { HAQ_BODY_MAP_TITLE, HAQ_TREND_LABELS } from '@/lib/haq/copy';
import { HAQ_LABEL } from '@/lib/haq/constants';
import { HaqBodyFigure } from '@/components/haq/HaqBodyFigure';
import type { CoachHaqSectionDetail } from '@/lib/haq/coachView';
import type { HaqResultColor } from '@/lib/haq/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const TONE: Record<HaqResultColor, { chip: string; dot: string }> = {
  red: { chip: 'bg-[#FDECEC] text-[#9B2C2C]', dot: 'bg-[#B9524F]' },
  yellow: { chip: 'bg-[#FDF6E7] text-[#854D0E]', dot: 'bg-[#C4A050]' },
  green: { chip: 'bg-[#EFF6F1] text-[#1B3A2D]', dot: 'bg-[#4F7A63]' },
};

function sittingDate(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionBlock({ section }: { section: CoachHaqSectionDetail }) {
  const tone = TONE[section.resultColor];
  return (
    <section className={`${CARD} p-5`} data-testid={`haq-coach-section-${section.sectionId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">{section.partName}</p>
          <h2 className="mt-0.5 text-[17px] font-semibold leading-snug text-[#1B3A2D]">{section.sectionTitle}</h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}>
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
            {section.memberResultLabel}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-[#6B7A72]">
            {section.originalPriority}
          </span>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <dt className="text-xs uppercase tracking-wide text-[#6B7A72]">Raw total</dt>
          <dd className="text-[17px] font-semibold text-[#1B3A2D]" data-testid={`haq-coach-total-${section.sectionId}`}>
            {section.rawTotal}
          </dd>
        </div>
        {section.previous && (
          <div className="flex items-baseline gap-2" data-testid={`haq-coach-previous-${section.sectionId}`}>
            <dt className="text-xs uppercase tracking-wide text-[#6B7A72]">Previous sitting</dt>
            <dd className="text-sm text-[#3F5B50]">
              {section.previous.rawTotal} · {section.previous.memberResultLabel}
            </dd>
            <span className="rounded-full bg-[#1B3A2D]/5 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-[#4F645A]">
              {HAQ_TREND_LABELS[section.previous.trend]}
            </span>
          </div>
        )}
      </dl>

      {/*
        THE DRIVERS, ONE TAP AWAY AND NO FURTHER. A native disclosure, so
        every section can be opened without a line of client code and the
        page still prints and searches as one document.
      */}
      <details className="group mt-3">
        <summary className="mef-focus-ring cursor-pointer list-none rounded-lg py-1 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          <span className="group-open:hidden">Show every answer</span>
          <span className="hidden group-open:inline">Hide answers</span>
        </summary>
        <ol className="mt-2 divide-y divide-[#1B3A2D]/5">
          {section.questions.map((question) => (
            <li key={question.questionKey} className="flex items-start justify-between gap-4 py-2.5">
              <p className="text-sm leading-relaxed text-[#1B3A2D]">{question.prompt}</p>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium text-[#1B3A2D]">{question.responseLabel}</span>
                <span className="block text-xs text-[#6B7A72]">{question.hiddenValue}</span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export default async function CoachHaqSittingPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const sitting = await getClientHaqSittingAction(params.sessionId);
  if (!sitting || sitting.memberId !== params.id) notFound();

  const frontMarks = sitting.marks.filter((mark) => mark.side === 'front');
  const backMarks = sitting.marks.filter((mark) => mark.side === 'back');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-3xl px-5 pb-safe-nav pt-safe-header sm:px-6 md:px-10 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}/detail` as Route}
          className="mef-focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to client detail
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">{HAQ_LABEL}</h1>
        <p className="mt-1 text-sm text-[#6B7A72]" data-testid="haq-coach-sitting-meta">
          Completed {sittingDate(sitting.completedAt)} · {sitting.haqVersion}
        </p>
        {sitting.previousSitting && (
          <p className="mt-1 text-sm text-[#6B7A72]" data-testid="haq-coach-previous-sitting">
            Compared with the sitting completed {sittingDate(sitting.previousSitting.completedAt)}.
          </p>
        )}

        <div className="mt-6 space-y-4">
          {sitting.sections.map((section) => (
            <SectionBlock key={section.sectionId} section={section} />
          ))}
        </div>

        <section className={`${CARD} mt-6 p-6`} data-testid="haq-coach-body-map">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">{HAQ_BODY_MAP_TITLE}</p>
          <p className="mt-1 text-xs text-[#6B7A72]">
            Not scored, and never part of a section total. Left and right are the member&apos;s own.
          </p>

          {sitting.marks.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7A72]">Nothing marked on this sitting.</p>
          ) : (
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {(
                [
                  ['front', 'Front', frontMarks],
                  ['back', 'Back', backMarks],
                ] as const
              ).map(([side, label, marks]) => (
                <div key={side}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
                  <div className="mt-2 flex justify-center">
                    <HaqBodyFigure side={side} markedLocations={marks.map((mark) => mark.location)} />
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {marks.length === 0 ? (
                      <li className="text-sm text-[#6B7A72]">Nothing marked here.</li>
                    ) : (
                      marks.map((mark) => (
                        <li key={mark.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-[#1B3A2D]">{mark.place}</span>
                          <span className="shrink-0 text-[#854D0E]">{mark.category}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
