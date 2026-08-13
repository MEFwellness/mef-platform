'use client';

/**
 * The Weekly Root Review's content, written once and rendered in both
 * places it appears: the Root pop-up on the first open of her week, and the
 * persistent entry on Home for the rest of it.
 *
 * There is deliberately no second copy of this markup. The pop-up and the
 * persistent entry are two presentations of ONE review row, exactly as the
 * Priority Card's pop-up and inline card are two presentations of one
 * priority row, so acknowledging in the pop-up shows acknowledged on Home
 * with no syncing of any kind.
 *
 * Every string here comes from the already-rendered review object, which
 * lib/weekly-review/copy.ts built from the stored plan on the server. This
 * component composes no sentence, formats no number, and pluralises
 * nothing. That is what keeps the copy rules (observational voice, tier
 * limits, no em dashes, no scolding) enforceable in one pure, tested module
 * rather than spread across a React tree.
 */

import { useState, useTransition } from 'react';
import type { RenderedReview } from '@/lib/weekly-review/types';
import {
  acknowledgeWeeklyReviewAction,
  answerWeeklyReviewQuestionAction,
} from '@/app/actions/weeklyReview';

/** Which visual weight the review is being given. Content is identical. */
export type WeeklyReviewTone = 'popup' | 'inline';

export function WeeklyReviewBody({
  review,
  tone,
  showHeading = true,
  onAcknowledged,
}: {
  review: RenderedReview;
  tone: WeeklyReviewTone;
  /** False on Home, where the collapsed entry's own summary line already carries the heading and repeating it would read as a stutter. */
  showHeading?: boolean;
  onAcknowledged?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(review.acknowledged);
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(
      review.questions
        .filter((question) => question.answer !== null)
        .map((question) => [question.key, question.answer as string])
    )
  );
  const [error, setError] = useState<string | null>(null);

  const bodyText = tone === 'popup' ? 'text-[#F5F0E4]' : 'text-[#1B3A2D]';
  const mutedText = tone === 'popup' ? 'text-[#F5F0E4]/70' : 'text-[#1B3A2D]/70';
  const accentText = tone === 'popup' ? 'text-[#C4A050]' : 'text-[#8A6D1F]';
  const ruleColor = tone === 'popup' ? 'border-[#F5F0E4]/10' : 'border-[#1B3A2D]/10';

  function handleAnswer(questionKey: string, option: string) {
    setError(null);
    // Optimistic, because the answer is behavioral context rather than
    // something a later screen depends on. A failed write shows the real
    // error and leaves her selection visible so she can try again.
    setAnswers((previous) => ({ ...previous, [questionKey]: option }));
    startTransition(async () => {
      const result = await answerWeeklyReviewQuestionAction(questionKey, option);
      if (!result.ok) setError('Could not save that.');
    });
  }

  function handleAcknowledge() {
    setError(null);
    setAcknowledged(true);
    startTransition(async () => {
      const result = await acknowledgeWeeklyReviewAction();
      if (!result.ok) {
        setError('Could not save that.');
        setAcknowledged(false);
        return;
      }
      onAcknowledged?.();
    });
  }

  return (
    <div className="relative">
      {showHeading && (
        <h2
          id="weekly-review-title"
          className={`font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight ${bodyText}`}
        >
          {review.heading}
        </h2>
      )}

      <Section title={review.showedTitle} accentText={accentText} ruleColor={ruleColor} first>
        {review.showed.map((sentence) => (
          <p key={sentence} className={`text-[15px] leading-relaxed ${bodyText}`}>
            {sentence}
          </p>
        ))}
      </Section>

      {/* Absent, not empty, when the week produced nothing to name. Root
          does not congratulate a member on a week she did not have. */}
      {review.worked.length > 0 && (
        <Section title={review.workedTitle} accentText={accentText} ruleColor={ruleColor}>
          {review.worked.map((sentence) => (
            <p key={sentence} className={`text-[15px] leading-relaxed ${bodyText}`}>
              {sentence}
            </p>
          ))}
        </Section>
      )}

      <Section title={review.adjustingTitle} accentText={accentText} ruleColor={ruleColor}>
        <p className={`text-[15px] leading-relaxed ${bodyText}`}>{review.adjusting}</p>
      </Section>

      {review.questions.map((question) => (
        <div key={question.key} className={`mt-5 border-t pt-4 ${ruleColor}`}>
          <p className={`text-[15px] leading-relaxed ${bodyText}`}>{question.prompt}</p>
          <div className="mt-3 space-y-2">
            {question.options.map((option) => {
              const chosen = answers[question.key] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isPending}
                  aria-pressed={chosen}
                  onClick={() => handleAnswer(question.key, option.value)}
                  className={
                    tone === 'popup'
                      ? `mef-focus-ring mef-press block w-full rounded-2xl border px-5 py-3 text-left text-sm font-medium text-[#F5F0E4] transition disabled:opacity-50 ${
                          chosen
                            ? 'border-[#C4A050] bg-[#C4A050]/15'
                            : 'border-[#F5F0E4]/20 hover:border-[#C4A050]/70 hover:bg-[#F5F0E4]/[0.06]'
                        }`
                      : `mef-focus-ring mef-press block w-full rounded-2xl border px-5 py-3 text-left text-sm font-medium text-[#1B3A2D] transition disabled:opacity-50 ${
                          chosen
                            ? 'border-[#8A6D1F] bg-[#C4A050]/20'
                            : 'border-[#1B3A2D]/15 hover:border-[#8A6D1F]/60 hover:bg-[#1B3A2D]/[0.04]'
                        }`
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {error && <p className="mt-3 text-sm text-[#B4462E]">{error}</p>}

      {acknowledged ? (
        <p className={`mt-6 text-sm ${mutedText}`}>
          Acknowledged. It stays here for the rest of the week.
        </p>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={handleAcknowledge}
          className={
            tone === 'popup'
              ? 'mef-focus-ring mef-press mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50'
              : 'mef-focus-ring mef-press mt-6 inline-flex items-center justify-center rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-[#F5F0E4] transition hover:brightness-110 disabled:opacity-50'
          }
        >
          {review.acknowledgeLabel}
        </button>
      )}
    </div>
  );
}

function Section({
  title,
  accentText,
  ruleColor,
  first,
  children,
}: {
  title: string;
  accentText: string;
  ruleColor: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={first ? 'mt-5' : `mt-5 border-t pt-4 ${ruleColor}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accentText}`}>{title}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}
