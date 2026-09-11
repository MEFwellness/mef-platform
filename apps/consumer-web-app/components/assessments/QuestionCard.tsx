'use client';

/**
 * One scored question, drawn as a block on a screen that holds two or
 * three of them.
 *
 * IT NO LONGER OWNS A CARD. Before the 2026-09-11 questionnaire pass this
 * was one question in one card and the card was the whole screen. A screen
 * now carries a group, so the card belongs to the group (AssessmentTaker)
 * and this draws the question inside it, with the hairline that separates
 * it from the question above.
 *
 * THE SECTION LINE MOVED UP. It used to be repeated over every question;
 * it is said once, at the top of the screen, by the progress bar, because
 * saying it three times on one screen is three copies of one fact.
 */

import type { Question } from '@/lib/assessments/engine/types';
import { QuestionBlock } from '@/components/questionnaire/QuestionBlock';
import { QuestionOptionButton } from './QuestionOptionButton';

type Props = {
  /** Which question she is on, counting from one across the whole questionnaire. */
  position: number;
  categoryId: string;
  question: Question;
  selectedOptionIndex: number | undefined;
  onSelect: (optionIndex: number) => void;
  withDivider?: boolean | undefined;
};

export function QuestionCard({
  position,
  categoryId,
  question,
  selectedOptionIndex,
  onSelect,
  withDivider = false,
}: Props) {
  const promptId = `question-${categoryId}-${question.number}-prompt`;

  return (
    <QuestionBlock
      tone="light"
      position={position}
      prompt={question.text}
      promptId={promptId}
      withDivider={withDivider}
    >
      {question.options.map((option, index) => (
        <QuestionOptionButton
          key={`${question.number}-${index}`}
          tone="gold-on-light"
          label={option.label}
          selected={selectedOptionIndex === index}
          onSelect={() => onSelect(index)}
        />
      ))}
    </QuestionBlock>
  );
}
