'use client';

import type { ContextQuestion } from '@/lib/assessments/engine/types';
import { QuestionBlock } from '@/components/questionnaire/QuestionBlock';
import { QuestionOptionButton } from './QuestionOptionButton';

type Props = {
  /** Left off deliberately: a context prompt is not one of the scored questions, so it carries no ordinal. */
  position?: number | undefined;
  contextQuestion: ContextQuestion;
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
  withDivider?: boolean;
};

/**
 * A small, product-authored intake prompt shown once during the take flow,
 * ahead of a category's conditional questions, not one of the scored
 * questions from the source instrument, so it is a separate component from
 * QuestionCard even though it shares the same visual language.
 *
 * IT ALWAYS STANDS ON ITS OWN SCREEN. Answering it changes which questions
 * exist below it, so grouping it with two of them would rewrite the screen
 * underneath her thumb. AssessmentTaker's grouping gives it a screen to
 * itself for exactly that reason.
 */
export function ContextQuestionCard({
  position,
  contextQuestion,
  selectedValue,
  onSelect,
  withDivider = false,
}: Props) {
  const promptId = `context-${contextQuestion.key}-prompt`;

  return (
    <QuestionBlock
      tone="light"
      {...(position != null ? { position } : {})}
      prompt={contextQuestion.prompt}
      promptId={promptId}
      withDivider={withDivider}
    >
      {contextQuestion.options.map((option) => (
        <QuestionOptionButton
          key={option.value}
          tone="gold-on-light"
          label={option.label}
          selected={selectedValue === option.value}
          onSelect={() => onSelect(option.value)}
        />
      ))}
      {contextQuestion.helperText && (
        <p className="pt-1 text-xs leading-relaxed text-[#6B7A72]">{contextQuestion.helperText}</p>
      )}
    </QuestionBlock>
  );
}
