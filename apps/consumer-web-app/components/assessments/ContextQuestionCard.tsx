'use client';

import { Check } from 'lucide-react';
import type { ContextQuestion } from '@/lib/assessments/engine/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Props = {
  sectionPosition: string;
  contextQuestion: ContextQuestion;
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
};

/**
 * A small, product-authored intake prompt shown once during the take flow,
 * ahead of a category's conditional questions — not one of the scored
 * questions from the source instrument, so it's a separate component from
 * QuestionCard even though it shares the same visual language.
 */
export function ContextQuestionCard({
  sectionPosition,
  contextQuestion,
  selectedValue,
  onSelect,
}: Props) {
  const legendId = `context-${contextQuestion.key}-legend`;

  return (
    <div className={`${CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {sectionPosition}
      </p>
      <h2
        id={legendId}
        className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]"
      >
        {contextQuestion.prompt}
      </h2>

      <div role="radiogroup" aria-labelledby={legendId} className="mt-6 space-y-3">
        {contextQuestion.options.map((option) => {
          const selected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option.value)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left text-[15px] font-medium transition ${
                selected
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:border-[#1B3A2D]/30 hover:bg-[#FAFAF8]'
              } mef-focus-ring`}
            >
              <span>{option.label}</span>
              {selected && (
                <Check className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {contextQuestion.helperText && (
        <p className="mt-4 text-xs leading-relaxed text-[#6B7A72]">{contextQuestion.helperText}</p>
      )}
    </div>
  );
}
