'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOnboarding } from '../actions/onboarding';
import type {
  AnswerStatus,
  OnboardingAnswerInput,
  OnboardingQuestion
} from '@mef/shared-types-contracts';

type Props = {
  questions: OnboardingQuestion[];
};

type StoredAnswer = {
  status: AnswerStatus;
  value?: string | number | boolean | string[];
};

export function OnboardingForm({ questions }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, StoredAnswer>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateAnswer(questionKey: string, answer: StoredAnswer) {
    setAnswers((current) => ({
      ...current,
      [questionKey]: answer
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
            current?.status === 'answered' && typeof current.value === 'number'
              ? current.value
              : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: Number(event.target.value)
            })
          }
        />
      );
    }

    if (question.answer_type === 'enum') {
      return (
        <select
          value={
            current?.status === 'answered' && typeof current.value === 'string'
              ? current.value
              : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: event.target.value
            })
          }
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
        current?.status === 'answered' && Array.isArray(current.value)
          ? current.value
          : [];

      return (
        <div>
          {allowedValues.map((option) => (
            <label key={option} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const nextValues = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);

                  updateAnswer(question.question_key, {
                    status: 'answered',
                    value: nextValues
                  });
                }}
              />{' '}
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
            current?.status === 'answered' &&
            typeof current.value === 'boolean'
              ? String(current.value)
              : ''
          }
          onChange={(event) =>
            updateAnswer(question.question_key, {
              status: 'answered',
              value: event.target.value === 'true'
            })
          }
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
          current?.status === 'answered' && typeof current.value === 'string'
            ? current.value
            : ''
        }
        onChange={(event) =>
          updateAnswer(question.question_key, {
            status: 'answered',
            value: event.target.value
          })
        }
      />
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const missingQuestion = questions.find(
      (question) => !answers[question.question_key]
    );

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
        ...(answer.status === 'answered' ? { value: answer.value } : {})
      };
    });

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

    const result = await submitOnboarding(timezone, payload);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      {questions.map((question) => {
        const currentStatus =
          answers[question.question_key]?.status ?? 'answered';

        return (
          <fieldset
            key={question.id}
            style={{ marginBottom: '1.5rem', padding: '1rem' }}
          >
            <legend>{question.prompt_text}</legend>

            {currentStatus === 'answered'
              ? renderQuestion(question)
              : null}

            <div style={{ marginTop: '0.75rem' }}>
              {question.allows_not_sure ? (
                <label style={{ marginRight: '1rem' }}>
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'not_sure'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'not_sure'
                      })
                    }
                  />{' '}
                  Not sure
                </label>
              ) : null}

              {question.allows_not_applicable ? (
                <label style={{ marginRight: '1rem' }}>
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'not_applicable'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'not_applicable'
                      })
                    }
                  />{' '}
                  Not applicable
                </label>
              ) : null}

              {question.allows_prefer_not_to_answer ? (
                <label>
                  <input
                    type="radio"
                    name={`${question.question_key}-status`}
                    checked={currentStatus === 'prefer_not_to_answer'}
                    onChange={() =>
                      updateAnswer(question.question_key, {
                        status: 'prefer_not_to_answer'
                      })
                    }
                  />{' '}
                  Prefer not to answer
                </label>
              ) : null}
            </div>

            {currentStatus !== 'answered' ? (
              <button
                type="button"
                onClick={() =>
                  updateAnswer(question.question_key, {
                    status: 'answered'
                  })
                }
                style={{ marginTop: '0.75rem' }}
              >
                Answer this question
              </button>
            ) : null}
          </fieldset>
        );
      })}

      {error ? <p role="alert">{error}</p> : null}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Submit onboarding'}
      </button>
    </form>
  );
}