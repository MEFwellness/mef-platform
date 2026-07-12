'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOnboarding } from '../actions/onboarding';
import type {
  AnswerStatus,
  OnboardingAnswerInput,
  OnboardingQuestion,
} from '@mef/shared-types-contracts';

type Props = {
  questions: OnboardingQuestion[];
};

type StoredAnswer = {
  status: AnswerStatus;
  value?: string | number | boolean | string[];
};

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

export function OnboardingForm({ questions }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, StoredAnswer>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateAnswer(questionKey: string, answer: StoredAnswer) {
    setAnswers((current) => ({
      ...current,
      [questionKey]: answer,
    }));
  }

  function parseAllowedValues(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }

    return [];
  }

  function renderQuestion(question: OnboardingQuestion) {
    const current = answers[question.question_key];
    const allowedValues = parseAllowedValues(question.allowed_values);

    if (question.answer_type === 'numeric') {
      return (
        <input
          type="number"
          min={question.question_key.startsWith('readiness_') ? 0 : 1}
          max={question.question_key.startsWith('readiness_') ? 10 : 5}
          value={
            current?.status === 'answered' && typeof current.value === 'number' ? current.value : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: Number(event.target.value),
            })
          }
          className={INPUT}
        />
      );
    }

    if (question.answer_type === 'enum') {
      return (
        <select
          value={
            current?.status === 'answered' && typeof current.value === 'string' ? current.value : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: event.target.value,
            })
          }
          className={`${INPUT} bg-white`}
        >
          <option value="">Select an option</option>
          {allowedValues.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      );
    }

    if (question.answer_type === 'multi_select') {
      const selected =
        current?.status === 'answered' && Array.isArray(current.value) ? current.value : [];

      return (
        <div className="mt-2 space-y-2">
          {allowedValues.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm text-[#1B3A2D]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const nextValues = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);

                  updateAnswer(question.question_key, {
                    status: 'answered',
                    value: nextValues,
                  });
                }}
                className="h-4 w-4 accent-[#F5B700]"
              />
              {option.replaceAll('_', ' ')}
            </label>
          ))}
        </div>
      );
    }

    if (question.answer_type === 'boolean') {
      return (
        <select
          value={
            current?.status === 'answered' && typeof current.value === 'boolean'
              ? String(current.value)
              : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: event.target.value === 'true',
            })
          }
          className={`${INPUT} bg-white`}
        >
          <option value="">Select an option</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    return (
      <textarea
        value={
          current?.status === 'answered' && typeof current.value === 'string' ? current.value : ''
        }
        onChange={(event) =>
          updateAnswer(question.question_key, {
            status: 'answered',
            value: event.target.value,
          })
        }
        rows={3}
        className={INPUT}
      />
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const missingQuestion = questions.find((question) => !answers[question.question_key]);

    if (missingQuestion) {
      setError(`Please answer: ${missingQuestion.prompt_text}`);
      return;
    }

    setSubmitting(true);

    const payload: OnboardingAnswerInput[] = questions.map((question) => {
      // Non-null: the missingQuestion check above already guarantees every
      // question has an answer before this map runs.
      const answer = answers[question.question_key]!;

      return {
        question_key: question.question_key,
        question_version: question.question_version,
        answer_status: answer.status,
        ...(answer.status === 'answered' ? { value: answer.value } : {}),
      };
    });

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

    const result = await submitOnboarding(timezone, payload);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {questions.map((question) => {
        const currentStatus = answers[question.question_key]?.status ?? 'answered';

        return (
          <fieldset key={question.id} className={`${CARD} p-5`}>
            <legend className="px-1 text-sm font-medium text-[#1B3A2D]">
              {question.prompt_text}
            </legend>

            {currentStatus === 'answered' ? renderQuestion(question) : null}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6B7A72]">
              {question.allows_not_sure ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'not_sure'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'not_sure',
                      })
                    }
                    className="h-4 w-4 accent-[#F5B700]"
                  />
                  Not sure
                </label>
              ) : null}

              {question.allows_not_applicable ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'not_applicable'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'not_applicable',
                      })
                    }
                    className="h-4 w-4 accent-[#F5B700]"
                  />
                  Not applicable
                </label>
              ) : null}

              {question.allows_prefer_not_to_answer ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'prefer_not_to_answer'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'prefer_not_to_answer',
                      })
                    }
                    className="h-4 w-4 accent-[#F5B700]"
                  />
                  Prefer not to answer
                </label>
              ) : null}
            </div>

            {currentStatus !== 'answered' ? (
              <button
                type="button"
                onClick={() =>
                  updateAnswer(question.question_key, {
                    status: 'answered',
                  })
                }
                className="mt-3 text-sm font-medium text-[#854D0E] underline underline-offset-2"
              >
                Answer this question
              </button>
            ) : null}
          </fieldset>
        );
      })}

      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-full bg-[#F5B700] px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-60"
      >
        {submitting ? 'Saving...' : 'Submit onboarding'}
      </button>
    </form>
  );
}
