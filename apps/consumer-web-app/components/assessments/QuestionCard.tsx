'use client';

import type { Question } from '@/lib/assessments/engine/types';
import { Card } from '@/components/layout';
import { QuestionOptionButton } from './QuestionOptionButton';

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
    <Card key={question.number} className="mef-animate-in">
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
        {question.options.map((option, index) => (
          <QuestionOptionButton
            key={`${question.number}-${index}`}
            label={option.label}
            selected={selectedOptionIndex === index}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </Card>
  );
}
