'use client';

/**
 * Premium Primal Pattern question card (Prompt 2). Visually distinct from
 * the points-engine's QuestionCard.tsx (single-select radiogroup, smaller
 * touch targets) — this one supports selecting one or both letters, so it
 * uses role="group" + role="checkbox" per option rather than a
 * role="radio" pattern, and gives each answer its own large, touch-
 * friendly card with an animated selection state instead of a compact list
 * row. See lib/primal-pattern/store.ts for why both-answer selection is a
 * first-class case here, not an edge case.
 */

import { Check } from 'lucide-react';
import type { Letter, PrimalPatternQuestion } from '@/lib/primal-pattern/types';

const LETTER_STYLE: Record<Letter, { badgeIdle: string; badgeSelected: string }> = {
  A: { badgeIdle: 'bg-[#F3F6F4] text-[#6B7A72]', badgeSelected: 'bg-[#1B3A2D] text-white' },
  B: { badgeIdle: 'bg-[#F3F6F4] text-[#6B7A72]', badgeSelected: 'bg-[#1B3A2D] text-white' },
};

type Props = {
  question: PrimalPatternQuestion;
  selected: Letter[];
  onToggle: (letter: Letter) => void;
};

export function PrimalPatternQuestionCard({ question, selected, onToggle }: Props) {
  const legendId = `pp-question-${question.number}-legend`;

  return (
    <div
      key={question.number}
      className="mef-animate-in rounded-[32px] bg-white p-7 shadow-[0_8px_40px_-12px_rgba(27,58,45,0.16)] sm:p-9"
    >
      <h2
        id={legendId}
        className="font-[family-name:var(--font-cormorant-garamond)] text-[1.75rem] leading-[1.25] text-[#1B3A2D] sm:text-3xl"
      >
        {question.prompt}
      </h2>

      <div role="group" aria-labelledby={legendId} className="mt-7 space-y-4">
        {(['A', 'B'] as const).map((letter) => {
          const label = letter === 'A' ? question.optionA : question.optionB;
          const isSelected = selected.includes(letter);
          const style = LETTER_STYLE[letter];

          return (
            <button
              key={letter}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => onToggle(letter)}
              className={`group flex w-full items-start gap-4 rounded-3xl border-2 p-5 text-left transition-all duration-200 sm:p-6 ${
                isSelected
                  ? 'border-[#1B3A2D] bg-[#F3F6F4] shadow-[0_6px_24px_-8px_rgba(27,58,45,0.25)]'
                  : 'border-[#EDEBE3] bg-white hover:border-[#1B3A2D]/25 hover:bg-[#FAFAF8]'
              } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-200 sm:h-10 sm:w-10 ${
                  isSelected ? style.badgeSelected : style.badgeIdle
                }`}
              >
                {isSelected ? (
                  <Check className="mef-pop-in h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  letter
                )}
              </span>
              <span className="mt-1 text-[15px] leading-relaxed text-[#1B3A2D] sm:text-base">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-[#6B7A72] sm:text-left">
        Choose whichever feels most true. Select both if both apply, or skip if neither does.
      </p>
    </div>
  );
}
