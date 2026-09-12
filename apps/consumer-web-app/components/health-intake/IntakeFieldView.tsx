'use client';

/**
 * One field of the Health & Lifestyle Intake, drawn.
 *
 * PURELY PRESENTATIONAL. It holds no answers, decides no branch and writes
 * nothing. The taker owns the answers and hands each field its current
 * value and one callback, which is what makes a change a single place where
 * a confirmation can be interposed before anything moves.
 *
 * TAP DRIVEN FIRST. Everything that can be a tap is a tap: the ten point
 * mark, the height, every option row. Text boxes exist only where text adds
 * something no list could (a medication's name, a sentence in her own
 * words), and every one of them is optional unless the question genuinely
 * cannot be answered without it.
 *
 * NEVER COLOUR ALONE. A chosen option carries the tick, the weight and the
 * border together, through the shared QuestionOptionButton, which is the
 * same selection language every other taker in this app speaks. The ten
 * point control marks its chosen number in text as well as in fill, and the
 * height picker does the same.
 *
 * IT FORMATS NO DATE AND READS NO CLOCK. The one date input's upper bound
 * arrives as a prop, resolved on the server in the member's own timezone,
 * because a client component deciding what "today" is was the exact bug
 * lib/time/memberToday.ts exists to end.
 */

import { useId, useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { HLI_COPY } from '@/lib/health-intake/copy';
import {
  HEIGHT_FEET,
  HEIGHT_INCHES,
  formatHeight,
  parseHeight,
  optionsForField,
} from '@/lib/health-intake/sanitize';
import { applyMultiSelect, readEntries, readItemMap, readScale, readSelections, readText } from '@/lib/health-intake/branching';
import { optionLabel } from '@/lib/health-intake/questions';
import type {
  IntakeAnswerValue,
  IntakeEntry,
  IntakeEntryField,
  IntakeField,
  IntakeOption,
} from '@/lib/health-intake/types';

const LABEL = 'text-[13px] font-semibold uppercase tracking-wider text-[#6B7A72]';
const TEXT_BOX =
  'mef-focus-ring w-full rounded-2xl border border-[#1B3A2D]/12 bg-[#F7FAF8] px-4 py-3.5 text-[16px] leading-relaxed text-[#1B3A2D] placeholder:text-[#8A9790] focus:border-[#C4A050] focus:outline-none';
const WRITING_BOX = `${TEXT_BOX} min-h-[132px] resize-y`;
const GHOST_BUTTON =
  'mef-focus-ring mef-press inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#C4A050]/60 bg-[#FBF7EC] px-5 py-3.5 text-[15px] font-semibold text-[#1B3A2D] transition hover:bg-[#F6EFDF]';
const SMALL_BUTTON =
  'mef-focus-ring mef-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#3E5C46] transition hover:bg-[#1B3A2D]/6';

/** A stored 24 hour time in the words she reads it back in. Pure string work, no Date and no zone. */
export function timeInWords(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return '';
  const hour = Number(match[1]);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${match[2]} ${suffix}`;
}

export function IntakeFieldView({
  field,
  value,
  maxDate,
  onChange,
  onGate,
}: {
  field: IntakeField;
  value: IntakeAnswerValue | undefined;
  /** Today, in her own timezone, resolved on the server. The date input's ceiling. */
  maxDate: string;
  onChange: (fieldId: string, next: IntakeAnswerValue) => void;
  /** A binary gate is the one field that advances by itself, so it has its own callback. */
  onGate: (fieldId: string, next: 'yes' | 'no') => void;
}) {
  const labelId = useId();

  switch (field.kind) {
    case 'gate':
      return (
        <div>
          <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-snug text-[#1B3A2D]">
            {field.label}
          </h2>
          <div role="radiogroup" aria-label={field.label} className="mt-7 space-y-2.5">
            <QuestionOptionButton
              tone="gold-on-light"
              label={field.noLabel ?? 'No'}
              selected={readText(value) === 'no'}
              onSelect={() => onGate(field.id, 'no')}
            />
            <QuestionOptionButton
              tone="gold-on-light"
              label={field.yesLabel ?? 'Yes'}
              selected={readText(value) === 'yes'}
              onSelect={() => onGate(field.id, 'yes')}
            />
          </div>
        </div>
      );

    case 'single_select':
      return (
        <fieldset>
          <legend className={LABEL}>{field.label}</legend>
          <div role="radiogroup" aria-label={field.label} className="mt-4 space-y-2.5">
            {field.options.map((option) => (
              <QuestionOptionButton
                key={option.value}
                tone="gold-on-light"
                label={option.label}
                selected={readText(value) === option.value}
                onSelect={() => onChange(field.id, option.value)}
              />
            ))}
          </div>
        </fieldset>
      );

    case 'multi_select': {
      const chosen = readSelections(value);
      return (
        <fieldset>
          <legend className={LABEL}>{field.label}</legend>
          <div className="mt-4 space-y-2.5">
            {field.options.map((option) => (
              <QuestionOptionButton
                key={option.value}
                tone="gold-on-light"
                variant="toggle"
                label={option.label}
                selected={chosen.includes(option.value)}
                onSelect={() => onChange(field.id, applyMultiSelect(field, chosen, option.value))}
              />
            ))}
          </div>
        </fieldset>
      );
    }

    case 'short_text':
      return (
        <div>
          <label htmlFor={labelId} className={LABEL}>
            {field.label}
            {field.optional && <OptionalTag />}
          </label>
          <input
            id={labelId}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={readText(value)}
            placeholder={field.placeholder}
            onChange={(event) => onChange(field.id, event.target.value)}
            className={`${TEXT_BOX} mt-3`}
          />
        </div>
      );

    case 'long_text':
      return (
        <div>
          <label htmlFor={labelId} className={LABEL}>
            {field.label}
            {field.optional && <OptionalTag />}
          </label>
          <textarea
            id={labelId}
            rows={4}
            value={readText(value)}
            placeholder={field.placeholder}
            onChange={(event) => onChange(field.id, event.target.value)}
            className={`${WRITING_BOX} mt-3`}
          />
        </div>
      );

    case 'date':
      return (
        <div>
          <label htmlFor={labelId} className={LABEL}>
            {field.label}
            {field.optional && <OptionalTag />}
          </label>
          <input
            id={labelId}
            type="date"
            max={maxDate}
            value={readText(value)}
            onChange={(event) => onChange(field.id, event.target.value)}
            className={`${TEXT_BOX} mt-3`}
          />
          {field.help && <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">{field.help}</p>}
        </div>
      );

    case 'time': {
      const stored = readText(value);
      return (
        <div>
          <label htmlFor={labelId} className={LABEL}>
            {field.label}
          </label>
          <input
            id={labelId}
            type="time"
            value={stored}
            onChange={(event) => onChange(field.id, event.target.value)}
            className={`${TEXT_BOX} mt-3`}
          />
          {timeInWords(stored) && (
            <p className="mt-2 text-[13px] text-[#3E5C46]">{`Around ${timeInWords(stored)}`}</p>
          )}
        </div>
      );
    }

    case 'height':
      return <HeightPicker field={field} value={readText(value)} onChange={onChange} />;

    case 'scale_ten':
      return <ScaleTen field={field} value={readScale(value)} onChange={onChange} />;

    case 'entry_list':
      return <EntryList field={field} entries={readEntries(value)} onChange={onChange} />;

    case 'per_item':
      // A per item follow-up is never drawn by this component: the taker
      // cuts it into screens of two or three through
      // lib/health-intake/branching.ts and draws each question itself with
      // the shared QuestionBlock, so the intake's follow-ups sit in exactly
      // the layout the app's other questionnaires use.
      return null;
  }
}

function OptionalTag() {
  return (
    <span className="ml-2 text-[11px] font-medium normal-case tracking-normal text-[#8A9790]">
      {HLI_COPY.optionalHint}
    </span>
  );
}

/**
 * The ten point mark.
 *
 * NOT A RANGE INPUT. A native slider on a phone is a two millimetre thumb
 * and an answer she cannot tell apart from the one beside it. This is ten
 * real tap targets, rising left to right, filled up to and including the
 * one she chose, with the number itself printed large above so the answer is
 * never carried by colour alone.
 */
function ScaleTen({
  field,
  value,
  onChange,
}: {
  field: Extract<IntakeField, { kind: 'scale_ten' }>;
  value: number;
  onChange: (fieldId: string, next: IntakeAnswerValue) => void;
}) {
  return (
    <div>
      <p className="text-center font-[family-name:var(--font-cormorant-garamond)] text-[54px] leading-none text-[#1B3A2D]">
        {value > 0 ? value : '-'}
      </p>
      <p className="mt-1 text-center text-[13px] text-[#6B7A72]">
        {value > 0 ? 'out of 10' : 'Choose a number'}
      </p>

      <div
        role="radiogroup"
        aria-label={field.label}
        className="mt-6 flex items-end justify-between gap-1.5"
      >
        {Array.from({ length: 10 }, (_, index) => {
          const mark = index + 1;
          const filled = value > 0 && mark <= value;
          return (
            <button
              key={mark}
              type="button"
              role="radio"
              aria-checked={value === mark}
              aria-label={`${mark} out of 10`}
              onClick={() => onChange(field.id, mark)}
              className="mef-focus-ring mef-press flex flex-1 flex-col items-center justify-end gap-1.5 rounded-xl py-1"
            >
              <span
                className={`w-full rounded-full transition-[height,background-color] duration-200 ease-out motion-reduce:transition-none ${
                  filled ? 'bg-[#C4A050]' : 'bg-[#1B3A2D]/10'
                }`}
                style={{ height: `${18 + index * 4}px` }}
                aria-hidden="true"
              />
              <span
                className={`text-[11px] ${
                  value === mark ? 'font-bold text-[#1B3A2D]' : 'text-[#8A9790]'
                }`}
                aria-hidden="true"
              >
                {mark}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[12px] text-[#6B7A72]">
        <span>{field.lowLabel}</span>
        <span>{field.highLabel}</span>
      </div>
    </div>
  );
}

/** Feet and inches, both tapped. Stored as one string, validated by one pattern. */
function HeightPicker({
  field,
  value,
  onChange,
}: {
  field: Extract<IntakeField, { kind: 'height' }>;
  value: string;
  onChange: (fieldId: string, next: IntakeAnswerValue) => void;
}) {
  const parsed = parseHeight(value);
  const feet = parsed?.feet ?? null;
  const inches = parsed?.inches ?? null;

  function pick(nextFeet: number | null, nextInches: number | null) {
    if (nextFeet === null) return;
    onChange(field.id, formatHeight(nextFeet, nextInches ?? 0));
  }

  return (
    <div>
      <p className={LABEL}>
        {field.label}
        {field.optional && <OptionalTag />}
      </p>
      <div className="mt-3">
        <p className="text-[12px] text-[#6B7A72]">Feet</p>
        <div role="radiogroup" aria-label="Height in feet" className="mt-2 flex flex-wrap gap-2">
          {HEIGHT_FEET.map((option) => (
            <Chip
              key={option}
              label={`${option}`}
              selected={feet === option}
              onSelect={() => pick(option, inches)}
            />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[12px] text-[#6B7A72]">Inches</p>
        <div role="radiogroup" aria-label="Height in inches" className="mt-2 flex flex-wrap gap-2">
          {HEIGHT_INCHES.map((option) => (
            <Chip
              key={option}
              label={`${option}`}
              selected={inches === option}
              onSelect={() => pick(feet, option)}
            />
          ))}
        </div>
      </div>
      {parsed && (
        <p className="mt-3 text-[13px] text-[#3E5C46]">{formatHeight(parsed.feet, parsed.inches)}</p>
      )}
    </div>
  );
}

function Chip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`mef-focus-ring mef-press inline-flex h-12 min-w-[48px] items-center justify-center gap-1 rounded-2xl border px-3 text-[15px] transition ${
        selected
          ? 'border-[#B08F3E] bg-[#C4A050] font-bold text-[#173025]'
          : 'border-[#1B3A2D]/12 bg-[#F1F6F2] text-[#1B3A2D] hover:border-[#C4A050]/45'
      }`}
    >
      {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
      {label}
    </button>
  );
}

/**
 * A repeatable list: medications, conditions, events.
 *
 * NOBODY IS SHOWN SIX EMPTY ROWS. The list opens with one button. Adding
 * opens a small form; saving closes it and prints a clean summary card;
 * editing reopens it on that card's own entry. A member who needs one adds
 * one, and a member who needs five adds five.
 */
function EntryList({
  field,
  entries,
  onChange,
}: {
  field: Extract<IntakeField, { kind: 'entry_list' }>;
  entries: IntakeEntry[];
  onChange: (fieldId: string, next: IntakeAnswerValue) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<IntakeEntry>({});

  function openNew() {
    setDraft({});
    setEditing(entries.length);
  }
  function openExisting(index: number) {
    setDraft({ ...entries[index]! });
    setEditing(index);
  }
  function save() {
    if (editing === null) return;
    const next = [...entries];
    next[editing] = draft;
    onChange(field.id, next);
    setEditing(null);
    setDraft({});
  }
  function remove(index: number) {
    onChange(
      field.id,
      entries.filter((_, position) => position !== index)
    );
    setEditing(null);
  }

  const required = field.entryFields.filter((entryField) => entryField.optional !== true);
  const canSave = required.every((entryField) => (draft[entryField.id] ?? '').trim().length > 0);

  return (
    <div>
      <p className={LABEL}>{field.label}</p>

      {entries.length === 0 && editing === null && (
        <p className="mt-3 text-[14px] text-[#6B7A72]">{HLI_COPY.entryEmptyHint}</p>
      )}

      <ul className="mt-3 space-y-2.5">
        {entries.map((entry, index) =>
          editing === index ? null : (
            <li
              key={index}
              className="mef-wbs-card-in rounded-2xl border border-[#1B3A2D]/10 bg-[#F7FAF8] px-4 py-3.5"
            >
              <p className="text-[15px] font-semibold leading-snug text-[#1B3A2D]">
                {field.summaryFieldIds
                  .map((id) => (entry[id] ?? '').trim())
                  .filter((part) => part.length > 0)
                  .join(' / ')}
              </p>
              <div className="mt-1.5 flex items-center gap-1">
                <button type="button" onClick={() => openExisting(index)} className={SMALL_BUTTON}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {HLI_COPY.editLabel}
                </button>
                <button type="button" onClick={() => remove(index)} className={SMALL_BUTTON}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {HLI_COPY.removeLabel}
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {editing !== null && (
        <div className="mef-wbs-question-in mt-3 rounded-2xl border border-[#C4A050]/40 bg-white p-4">
          <div className="space-y-4">
            {field.entryFields.map((entryField) => (
              <EntryFieldInput
                key={entryField.id}
                field={entryField}
                value={draft[entryField.id] ?? ''}
                onChange={(next) => setDraft((current) => ({ ...current, [entryField.id]: next }))}
              />
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="mef-focus-ring mef-press inline-flex flex-1 items-center justify-center rounded-2xl bg-[#1B3A2D] px-5 py-3 text-[15px] font-semibold text-[#F5F0E4] transition disabled:cursor-not-allowed disabled:bg-[#1B3A2D]/25"
            >
              {HLI_COPY.saveEntryLabel}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="mef-focus-ring mef-press inline-flex items-center justify-center rounded-2xl border border-[#1B3A2D]/12 px-5 py-3 text-[15px] font-semibold text-[#3E5C46]"
            >
              {HLI_COPY.cancelLabel}
            </button>
          </div>
        </div>
      )}

      {editing === null && (
        <button type="button" onClick={openNew} className={`${GHOST_BUTTON} mt-3 w-full`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {entries.length === 0 ? field.addLabel : field.addAnotherLabel}
        </button>
      )}
    </div>
  );
}

function EntryFieldInput({
  field,
  value,
  onChange,
}: {
  field: IntakeEntryField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();

  if (field.kind === 'select') {
    return (
      <fieldset>
        <legend className={LABEL}>{field.label}</legend>
        <div role="radiogroup" aria-label={field.label} className="mt-3 space-y-2">
          {field.options.map((option: IntakeOption) => (
            <QuestionOptionButton
              key={option.value}
              tone="gold-on-light"
              label={option.label}
              selected={value === option.value}
              onSelect={() => onChange(option.value)}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {field.label}
        {field.optional && <OptionalTag />}
      </label>
      <input
        id={id}
        type="text"
        inputMode={field.kind === 'year' ? 'numeric' : 'text'}
        autoComplete="off"
        maxLength={field.kind === 'year' ? 4 : undefined}
        value={value}
        placeholder={field.kind === 'year' ? '2019' : field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${TEXT_BOX} mt-3`}
      />
    </div>
  );
}

/** Exported for the taker, which draws per item follow-ups itself. */
export { LABEL as INTAKE_LABEL_CLASS };
/** Kept beside the field renderers so a screen and its summary read one list. */
export { optionsForField, optionLabel, readItemMap };
