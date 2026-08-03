'use client';

import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import { PREFER_NOT_TO_ANSWER, type AnswerValue } from '@/lib/assessment-runtime/types';
import { WBSA_PREFER_NOT_TO_ANSWER_LABEL } from '@/lib/wbsa/copy';
import { Card } from '@/components/layout';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';

type AnswerOption = { value: string; label: string };

function parseOptions(raw: unknown): AnswerOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (o): o is AnswerOption => typeof o === 'object' && o !== null && 'value' in o && 'label' in o
  );
}

type Props = {
  sectionPosition: string;
  question: UnifiedAssessmentQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
};

/** Renders the right control for the question's answer_type — boolean/frequency/single_select share a radiogroup shape, multi_select is a checkbox group, matching the "one focused question at a time" UX every other assessment take flow in this app already uses. */
export function WbsaQuestionCard({ sectionPosition, question, value, onChange }: Props) {
  const legendId = `wbsa-question-${question.id}-legend`;
  const isSkipped = value === PREFER_NOT_TO_ANSWER;

  return (
    <Card className="mef-animate-in">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {sectionPosition}
      </p>
      <h2
        id={legendId}
        className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]"
      >
        {question.prompt}
      </h2>
      {question.description && (
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{question.description}</p>
      )}

      <div className="mt-6">
        {question.answer_type === 'boolean' && (
          <div role="radiogroup" aria-labelledby={legendId} className="space-y-3">
            {[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ].map((option) => (
              <QuestionOptionButton
                key={String(option.value)}
                label={option.label}
                selected={!isSkipped && value === option.value}
                onSelect={() => onChange(option.value)}
              />
            ))}
          </div>
        )}

        {(question.answer_type === 'frequency' || question.answer_type === 'single_select') && (
          <div role="radiogroup" aria-labelledby={legendId} className="space-y-3">
            {parseOptions(question.answer_options).map((option) => (
              <QuestionOptionButton
                key={option.value}
                label={option.label}
                selected={!isSkipped && value === option.value}
                onSelect={() => onChange(option.value)}
              />
            ))}
          </div>
        )}

        {question.answer_type === 'multi_select' && (
          <div aria-labelledby={legendId} className="space-y-3">
            {parseOptions(question.answer_options).map((option) => {
              const current = !isSkipped && Array.isArray(value) ? (value as string[]) : [];
              const selected = current.includes(option.value);
              return (
                <QuestionOptionButton
                  key={option.value}
                  variant="toggle"
                  label={option.label}
                  selected={selected}
                  onSelect={() => {
                    const next = selected
                      ? current.filter((v) => v !== option.value)
                      : [...current, option.value];
                    onChange(next);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {question.allows_prefer_not_to_answer && (
        <button
          type="button"
          onClick={() => onChange(PREFER_NOT_TO_ANSWER)}
          className={`mef-focus-ring mt-4 text-sm font-medium underline-offset-2 transition hover:underline ${
            isSkipped ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'
          }`}
        >
          {isSkipped ? `${WBSA_PREFER_NOT_TO_ANSWER_LABEL} (selected)` : WBSA_PREFER_NOT_TO_ANSWER_LABEL}
        </button>
      )}
    </Card>
  );
}
