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

import { useState } from 'react';
import type { RenderedReview } from '@/lib/weekly-review/types';
import { optimisticWrite } from '@/lib/client/optimisticWrite';
import { deliverPopupResponse } from '@/lib/client/popupResponse';

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

  // Every handler below acknowledges the tap synchronously and lets the
  // write finish behind her, retrying on its own if the first attempt does
  // not land. See lib/client/optimisticWrite.ts for the freeze this
  // replaced: the answer used to be sequenced after the network, with every
  // button in the pop-up disabled and the page behind it locked for the
  // whole round trip.

  function handleAnswer(questionKey: string, option: string) {
    void optimisticWrite({
      acknowledge: () => {
        setError(null);
        // The answer is behavioral context rather than something a later
        // screen depends on, so her selection is simply shown as chosen.
        setAnswers((previous) => ({ ...previous, [questionKey]: option }));
      },
      write: () =>
        deliverPopupResponse({ kind: 'weekly_review_answer', questionKey, option }),
      // Only after every retry has failed, and her selection stays visible
      // so tapping it again is the obvious thing to do.
      onLost: () => setError('Could not save that.'),
    });
  }

  function handleAcknowledge() {
    void optimisticWrite({
      acknowledge: () => {
        setError(null);
        setAcknowledged(true);
        // Closes the pop-up on the same tick as the tap. The claim behind
        // it is conditional on `acknowledged_at IS NULL`, so it lands
        // exactly once however many times it is retried, and the review
        // stays on Home for the rest of the week either way.
        onAcknowledged?.();
      },
      write: () => deliverPopupResponse({ kind: 'weekly_review_acknowledge' }),
      // Rolls back to unacknowledged so Home tells her the truth and she
      // can acknowledge it there. In the pop-up presentation she has
      // already moved on by now, which is exactly why this is a rollback
      // and not an interruption.
      onLost: () => {
        setAcknowledged(false);
        setError('Could not save that.');
      },
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
                  // Deliberately never disabled. It was `disabled={isPending}`,
                  // which meant one answer switched all of them off for the
                  // length of a round trip; changing her mind is a member
                  // decision, not something a network wait gets to veto.
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
          // Not disabled while the write runs, for the same reason as the
          // option buttons above. It is replaced by the acknowledged line
          // on the same tick as the tap, so there is nothing left to
          // double-tap anyway.
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
