'use client';

/**
 * Add Signal. The coach's fast entry tool.
 *
 * IT IS BUILT FOR MID CONVERSATION, which is the only requirement that
 * shaped it. A coach is sitting with a member who has just said "my right
 * hip clicks", and the tool has to be finished before the sentence is. So:
 * no long form, no required free text, no modal to dismiss, and every
 * choice is a tap or a word typed into one field.
 *
 * TWO WAYS IN, AND THEY MEET IN THE SAME PLACE.
 *
 *   TYPE IT. The search field runs over the standardized signal names the
 *     library already holds, matching case insensitively and partially
 *     over the name and its stored search terms. Choosing one fills in its
 *     category and its usual body area, and the coach is straight on to
 *     side and frequency.
 *   TAP IT. Category, then body area if the category has one, then the
 *     symptom word. The two taps compose a standardized name, and if the
 *     library has never held that name it becomes one, once, so the next
 *     coach finds it by typing.
 *
 * THE SIDE SELECTOR DISAPPEARS WHERE IT MAKES NO SENSE. "Whole body" and
 * "Abdomen" carry takes_side false in the library, so the tool offers N/A
 * and nothing else rather than asking which abdomen.
 *
 * NOTHING HERE DECIDES WHAT IS SAVED. The form posts taps. The server
 * resolves the standardized name, the category, the numeric value, the
 * source label and the date from the library and from the MEMBER'S own
 * timezone (app/actions/crossSystemSignals.ts), so a hand built request
 * cannot choose its own category or date a signal in the past.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { addCoachSignalAction } from '@/app/actions/crossSystemSignals';
import { COACH_FREQUENCY_OPTIONS, COACH_NOTE_MAX_LENGTH } from '@/lib/cross-system-signals/constants';
import { searchSignalNames } from '@/lib/cross-system-signals/library';
import { SIDE_LABELS } from '@/lib/cross-system-signals/coachView';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalSide,
  SignalSymptomType,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';

const CHIP =
  'mef-focus-ring rounded-full border px-3 py-2 text-sm font-medium transition-colors min-h-[40px]';
const CHIP_OFF = 'border-[#1B3A2D]/12 bg-white text-[#3E5C46] hover:bg-[#1B3A2D]/[0.04]';
const CHIP_ON = 'border-transparent bg-[#1B3A2D] text-white';

const SIDE_ORDER: SignalSide[] = ['left', 'right', 'both', 'not_applicable'];

type Props = {
  memberId: string;
  categories: SignalCategory[];
  bodyAreas: SignalBodyArea[];
  symptoms: SignalSymptomType[];
  searchableNames: StandardizedSignalName[];
};

export function AddSignalForm({
  memberId,
  categories,
  bodyAreas,
  symptoms,
  searchableNames,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chosenName, setChosenName] = useState<StandardizedSignalName | null>(null);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [areaKey, setAreaKey] = useState<string | null>(null);
  const [symptomKey, setSymptomKey] = useState<string | null>(null);
  const [side, setSide] = useState<SignalSide>('not_applicable');
  const [frequencyKey, setFrequencyKey] = useState<string>('sometimes');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = useMemo(
    () => (chosenName ? [] : searchSignalNames(searchableNames, query)),
    [chosenName, query, searchableNames]
  );

  const area = areaKey ? (bodyAreas.find((row) => row.areaKey === areaKey) ?? null) : null;
  const symptom = symptomKey
    ? (symptoms.find((row) => row.symptomKey === symptomKey) ?? null)
    : null;
  const takesSide = area === null ? true : area.takesSide;

  // What the row will be called, shown back before it is saved so the
  // coach reads the standardized name rather than guessing at it.
  const preview = chosenName
    ? chosenName.displayName
    : symptom
      ? area
        ? `${area.displayName} ${symptom.phrase}`
        : symptom.displayName
      : null;

  const canSave = Boolean(chosenName || symptom) && !isPending;

  function reset() {
    setQuery('');
    setChosenName(null);
    setCategoryKey(null);
    setAreaKey(null);
    setSymptomKey(null);
    setSide('not_applicable');
    setFrequencyKey('sometimes');
    setNote('');
    setError(null);
  }

  function chooseName(name: StandardizedSignalName) {
    setChosenName(name);
    setQuery(name.displayName);
    setCategoryKey(name.categoryKey);
    setAreaKey(name.defaultBodyAreaKey);
    setSymptomKey(name.defaultSymptomKey);
  }

  function handleSave() {
    if (!canSave) return;
    setError(null);
    setSaved(null);
    const chosenLabel = preview;
    startTransition(async () => {
      const result = await addCoachSignalAction(memberId, {
        signalSlug: chosenName?.signalSlug ?? null,
        bodyAreaKey: areaKey,
        symptomKey: symptomKey,
        side: takesSide ? side : 'not_applicable',
        frequencyKey,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(chosenLabel ? `${chosenLabel} saved.` : 'Signal saved.');
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mef-focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Add Signal
        </button>
        {saved ? (
          <p className="mt-2 text-sm text-[#3E5C46]" role="status">
            {saved}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Add Signal</p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Close Add Signal"
          className="mef-focus-ring rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* 1. Type it. */}
      <label htmlFor="signal-search" className="mt-3 block text-xs font-medium text-[#3E5C46]">
        Search signals
      </label>
      <div className="relative mt-1.5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          id="signal-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Hip clicking, frequent urination, low-back tightness"
          onChange={(event) => {
            setQuery(event.target.value);
            setChosenName(null);
          }}
          className="mef-focus-ring min-h-[44px] w-full rounded-full border border-[#1B3A2D]/12 bg-white pl-9 pr-4 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
        />
      </div>
      {matches.length > 0 ? (
        <ul className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-[#1B3A2D]/10 bg-white">
          {matches.map((name) => (
            <li key={name.signalSlug}>
              <button
                type="button"
                onClick={() => chooseName(name)}
                className="mef-focus-ring block w-full px-4 py-2.5 text-left text-sm text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.04]"
              >
                {name.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 2. Or tap it. */}
      {!chosenName ? (
        <>
          <p className="mt-4 text-xs font-medium text-[#3E5C46]">Or tap a category</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <button
                key={category.categoryKey}
                type="button"
                aria-pressed={categoryKey === category.categoryKey}
                onClick={() =>
                  setCategoryKey((current) =>
                    current === category.categoryKey ? null : category.categoryKey
                  )
                }
                className={`${CHIP} ${categoryKey === category.categoryKey ? CHIP_ON : CHIP_OFF}`}
              >
                {category.displayName}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-medium text-[#3E5C46]">Body area, if there is one</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {bodyAreas.map((row) => (
              <button
                key={row.areaKey}
                type="button"
                aria-pressed={areaKey === row.areaKey}
                onClick={() => {
                  setAreaKey((current) => (current === row.areaKey ? null : row.areaKey));
                  if (!row.takesSide) setSide('not_applicable');
                }}
                className={`${CHIP} ${areaKey === row.areaKey ? CHIP_ON : CHIP_OFF}`}
              >
                {row.displayName}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-medium text-[#3E5C46]">Symptom</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {symptoms.map((row) => (
              <button
                key={row.symptomKey}
                type="button"
                aria-pressed={symptomKey === row.symptomKey}
                onClick={() =>
                  setSymptomKey((current) => (current === row.symptomKey ? null : row.symptomKey))
                }
                className={`${CHIP} ${symptomKey === row.symptomKey ? CHIP_ON : CHIP_OFF}`}
              >
                {row.displayName}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* 3. Side. */}
      <p className="mt-4 text-xs font-medium text-[#3E5C46]">Side</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {SIDE_ORDER.map((option) => {
          const disabled = !takesSide && option !== 'not_applicable';
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={side === option}
              onClick={() => setSide(option)}
              className={`${CHIP} ${side === option ? CHIP_ON : CHIP_OFF} ${
                disabled ? 'cursor-not-allowed opacity-35' : ''
              }`}
            >
              {SIDE_LABELS[option]}
            </button>
          );
        })}
      </div>

      {/* 4. How often. */}
      <p className="mt-4 text-xs font-medium text-[#3E5C46]">How often</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {COACH_FREQUENCY_OPTIONS.map((option) => (
          <button
            key={option.valueKey}
            type="button"
            aria-pressed={frequencyKey === option.valueKey}
            onClick={() => setFrequencyKey(option.valueKey)}
            className={`${CHIP} ${frequencyKey === option.valueKey ? CHIP_ON : CHIP_OFF}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 5. One optional line. Never required. */}
      <label htmlFor="signal-note" className="mt-4 block text-xs font-medium text-[#3E5C46]">
        Note, optional
      </label>
      <input
        id="signal-note"
        type="text"
        value={note}
        maxLength={COACH_NOTE_MAX_LENGTH}
        placeholder="One line, if it helps"
        onChange={(event) => setNote(event.target.value)}
        className="mef-focus-ring mt-1.5 min-h-[44px] w-full rounded-full border border-[#1B3A2D]/12 bg-white px-4 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />

      {preview ? (
        <p className="mt-4 text-sm text-[#3E5C46]">
          Saving <span className="font-semibold text-[#1B3A2D]">{preview}</span> as a coach entered
          signal, dated today.
        </p>
      ) : (
        <p className="mt-4 text-sm text-[#6B7A72]">
          Choose a signal, or an area and a symptom.
        </p>
      )}

      {error ? (
        <p className="mt-2 text-sm text-[#8C2F1F]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="mef-focus-ring min-h-[44px] rounded-full bg-[#1B3A2D] px-5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Saving' : 'Save signal'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="mef-focus-ring min-h-[44px] rounded-full px-4 text-sm font-medium text-[#3E5C46] hover:bg-[#1B3A2D]/[0.05]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
