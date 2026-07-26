'use client';

/**
 * Shared form for creating a question, fully editing one, or "retire and
 * replace" (a copy pre-filled from the retired question, forced to a
 * fresh question_key since the old one's answers must stay attached to
 * the old row). One form, three modes, rather than three near-identical
 * ones — the fields are the same; only what happens on submit differs.
 */

import { useMemo, useState } from 'react';
import type { Driver } from '@/lib/driver-library/types';
import type { ProbeOption, ProbeResponseType, ProbeScreen } from '@/lib/daily-checkin-adaptive/types';
import type { CreateQuestionInput } from '@/lib/driver-probe-admin/types';
import { slugifyPrompt } from '@/lib/driver-probe-admin/slug';

const RESPONSE_TYPES: { value: ProbeResponseType; label: string }[] = [
  { value: 'boolean', label: 'Yes / No' },
  { value: 'scale', label: 'Scale (numbers)' },
  { value: 'count', label: 'Count (numbers)' },
  { value: 'single_select', label: 'Multiple choice' },
];

const INPUT_CLASS =
  'mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 px-3.5 py-2.5 text-sm text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none';
const LABEL_CLASS = 'text-[13px] font-medium text-[#6B7A72]';

export type EditorInitialValues = {
  prompt: string;
  driverId: string;
  responseType: ProbeResponseType;
  options: ProbeOption[];
  screen: ProbeScreen;
  questionKey?: string;
};

function optionsToText(options: ProbeOption[]): string {
  return options.map((o) => (typeof o === 'object' ? o.value : String(o))).join(', ');
}

function parseNumberOptions(text: string): number[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

/** value1: label1, value2: label2 style rows for single_select, one per line. */
function parseSelectOptions(text: string): { value: string; label: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [rawValue = '', ...rest] = line.split(':');
      const label = rest.join(':').trim() || rawValue.trim();
      const value = rawValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      return { value: value || label.toLowerCase(), label };
    });
}

function selectOptionsToText(options: ProbeOption[]): string {
  return options
    .map((o) => (typeof o === 'object' ? `${o.value}: ${o.label}` : `${o}: ${o}`))
    .join('\n');
}

export function QuestionEditorForm({
  mode,
  initial,
  drivers,
  lockedFields,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit' | 'replace';
  initial: EditorInitialValues;
  drivers: Driver[];
  /** response_type/options are locked once a question has recorded answers (edit mode only). */
  lockedFields?: ('responseType' | 'options')[];
  onSubmit: (input: CreateQuestionInput, keyManuallyEdited: boolean) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial.prompt);
  const [driverId, setDriverId] = useState(initial.driverId);
  const [responseType, setResponseType] = useState<ProbeResponseType>(initial.responseType);
  const [screen, setScreen] = useState<ProbeScreen>(initial.screen);
  const [numberOptionsText, setNumberOptionsText] = useState(
    initial.responseType === 'scale' || initial.responseType === 'count' ? optionsToText(initial.options) : ''
  );
  const [selectOptionsText, setSelectOptionsText] = useState(
    initial.responseType === 'single_select' ? selectOptionsToText(initial.options) : ''
  );
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(mode === 'edit');
  const [questionKey, setQuestionKey] = useState(initial.questionKey ?? slugifyPrompt(initial.prompt));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const responseTypeLocked = mode === 'edit' && (lockedFields ?? []).includes('responseType');
  const optionsLocked = mode === 'edit' && (lockedFields ?? []).includes('options');
  const keyEditable = mode !== 'edit';

  const derivedKey = useMemo(() => (keyManuallyEdited ? questionKey : slugifyPrompt(prompt)), [
    keyManuallyEdited,
    questionKey,
    prompt,
  ]);

  function handlePromptChange(value: string) {
    setPrompt(value);
    if (!keyManuallyEdited) setQuestionKey(slugifyPrompt(value));
  }

  function currentOptions(): ProbeOption[] {
    if (responseType === 'scale' || responseType === 'count') return parseNumberOptions(numberOptionsText);
    if (responseType === 'single_select') return parseSelectOptions(selectOptionsText);
    return [];
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!prompt.trim()) {
      setError('Prompt text is required.');
      return;
    }
    if (!driverId) {
      setError('Choose a driver.');
      return;
    }
    const options = currentOptions();
    if ((responseType === 'scale' || responseType === 'count') && options.length === 0) {
      setError('Add at least one number, e.g. "1, 2, 3, 4, 5".');
      return;
    }
    if (responseType === 'single_select' && options.length < 2) {
      setError('Add at least two choices, one per line.');
      return;
    }

    setSubmitting(true);
    const result = await onSubmit(
      {
        questionKey: derivedKey,
        driverId,
        prompt: prompt.trim(),
        responseType,
        options,
        screen,
      },
      keyManuallyEdited
    );
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-[24px] border border-[#1B3A2D]/10 bg-[#FAFAF8] p-5"
    >
      <div>
        <label className={LABEL_CLASS} htmlFor="prompt">
          Prompt (what the member reads)
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={2}
          className={INPUT_CLASS}
          placeholder="e.g. Did you sleep well last night?"
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="question-key">
          Question key
        </label>
        <input
          id="question-key"
          value={derivedKey}
          disabled={!keyEditable}
          onChange={(e) => {
            setKeyManuallyEdited(true);
            setQuestionKey(e.target.value);
          }}
          className={`${INPUT_CLASS} font-mono text-xs ${!keyEditable ? 'bg-[#1B3A2D]/[0.04] text-[#6B7A72]' : ''}`}
        />
        {keyEditable && (
          <p className="mt-1 text-xs text-[#6B7A72]">
            Generated from the prompt — edit now if you want, it can&apos;t change later.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="driver">
            Driver
          </label>
          <select
            id="driver"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Choose a driver…</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.id} — {driver.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="screen">
            Screen
          </label>
          <select
            id="screen"
            value={screen}
            onChange={(e) => setScreen(e.target.value as ProbeScreen)}
            className={INPUT_CLASS}
          >
            <option value="morning">Morning Readiness</option>
            <option value="evening">Evening Reflection</option>
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="response-type">
          Answer type
        </label>
        <select
          id="response-type"
          value={responseType}
          disabled={responseTypeLocked}
          onChange={(e) => setResponseType(e.target.value as ProbeResponseType)}
          className={`${INPUT_CLASS} ${responseTypeLocked ? 'bg-[#1B3A2D]/[0.04] text-[#6B7A72]' : ''}`}
        >
          {RESPONSE_TYPES.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {rt.label}
            </option>
          ))}
        </select>
      </div>

      {(responseType === 'scale' || responseType === 'count') && (
        <div>
          <label className={LABEL_CLASS} htmlFor="number-options">
            Numbers members can choose from
          </label>
          <input
            id="number-options"
            value={numberOptionsText}
            disabled={optionsLocked}
            onChange={(e) => setNumberOptionsText(e.target.value)}
            className={`${INPUT_CLASS} ${optionsLocked ? 'bg-[#1B3A2D]/[0.04] text-[#6B7A72]' : ''}`}
            placeholder="0, 1, 2, 3, 4, 5"
          />
        </div>
      )}

      {responseType === 'single_select' && (
        <div>
          <label className={LABEL_CLASS} htmlFor="select-options">
            Choices — one per line, as &quot;value: what the member sees&quot;
          </label>
          <textarea
            id="select-options"
            value={selectOptionsText}
            disabled={optionsLocked}
            onChange={(e) => setSelectOptionsText(e.target.value)}
            rows={4}
            className={`${INPUT_CLASS} font-mono text-xs ${optionsLocked ? 'bg-[#1B3A2D]/[0.04] text-[#6B7A72]' : ''}`}
            placeholder={'none: None\nsome: Some\na_lot: A lot'}
          />
        </div>
      )}

      {(responseTypeLocked || optionsLocked) && (
        <p className="text-xs text-[#854D0E]">
          This question already has recorded answers, so its answer type and choices are locked —
          changing them would reinterpret past answers. Use &quot;Retire and replace&quot; instead.
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Add question' : mode === 'replace' ? 'Retire old, create new' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[#1B3A2D]/15 px-5 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/30"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
