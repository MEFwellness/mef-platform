'use client';

import type { ContextQuestion } from '@/lib/assessments/engine/types';
import { Card } from '@/components/layout';
import { QuestionOptionButton } from './QuestionOptionButton';

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
    <Card className="mef-animate-in">
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
        {contextQuestion.options.map((option) => (
          <QuestionOptionButton
            key={option.value}
            label={option.label}
            selected={selectedValue === option.value}
            onSelect={() => onSelect(option.value)}
          />
        ))}
      </div>

      {contextQuestion.helperText && (
        <p className="mt-4 text-xs leading-relaxed text-[#6B7A72]">{contextQuestion.helperText}</p>
      )}
    </Card>
  );
}
