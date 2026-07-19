'use client';

import { Check } from 'lucide-react';
import type { Question } from '@/lib/assessments/engine/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Props = {
  categoryName: string;
  sectionPosition: string;
  question: Question;
  selectedOptionIndex: number | undefined;
  onSelect: (optionIndex: number) => void;
};

export function QuestionCard({
  categoryName,
  sectionPosition,
  question,
  selectedOptionIndex,
  onSelect,
}: Props) {
  const legendId = `question-${question.number}-legend`;

  return (
    <div key={question.number} className={`${CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {sectionPosition} · {categoryName}
      </p>
      <h2
        id={legendId}
        className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]"
      >
        {question.text}
      </h2>

      <div role="radiogroup" aria-labelledby={legendId} className="mt-6 space-y-3">
        {question.options.map((option, index) => {
          const selected = selectedOptionIndex === index;
          return (
            <button
              key={`${question.number}-${index}`}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(index)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left text-[15px] font-medium transition ${
                selected
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:border-[#1B3A2D]/30 hover:bg-[#FAFAF8]'
              } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]`}
            >
              <span>{option.label}</span>
              {selected && (
                <Check className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
