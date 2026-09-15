/**
 * What a coach may enter, decided on the server.
 *
 * THE CLIENT POSTS TAPS, NOT A ROW. It sends a signal slug or an area plus
 * a symptom, a side, a frequency and an optional line. Everything the row
 * actually carries, its standardized name, its category, its numeric
 * value, its source label and its date, is resolved here from the library
 * and from the member's own timezone, so a hand built request cannot
 * choose its own category, invent a frequency the scale does not hold or
 * date a signal in the past.
 *
 * PURE. No client, no clock. The caller passes today, resolved from HER
 * timezone, which is what keeps this testable and what keeps a coach in
 * London and a member in Denver from disagreeing about what today is.
 */

import { COACH_FREQUENCY_OPTIONS, COACH_NOTE_MAX_LENGTH } from './constants';
import { composeSignalName, findBodyArea, findCategory, findName, findSymptom } from './library';
import type { SignalLibrary, SignalSide } from './types';

const SIDES: readonly SignalSide[] = ['left', 'right', 'both', 'not_applicable'];

/** Exactly what the entry form sends. Every field is untrusted. */
export type CoachSignalInput = {
  /** An existing standardized name, when the coach chose one from the search field. */
  signalSlug?: string | null;
  /** A body area, when the coach tapped her way to a composed name. */
  bodyAreaKey?: string | null;
  /** A symptom word. Required when there is no signalSlug. */
  symptomKey?: string | null;
  side?: string | null;
  frequencyKey?: string | null;
  note?: string | null;
};

/** Everything a row needs, once the server has decided it. */
export type ResolvedCoachSignal = {
  signalSlug: string;
  signalName: string;
  categoryKey: string;
  bodyAreaKey: string | null;
  symptomKey: string | null;
  side: SignalSide;
  valueKey: string;
  valueLabel: string;
  valueNumeric: number;
  note: string | null;
  /** True when this composed name is not yet in the library and has to be added. */
  isNewName: boolean;
};

export type CoachSignalResolution =
  | { ok: true; signal: ResolvedCoachSignal }
  | { ok: false; error: string };

function readSide(value: unknown): SignalSide | null {
  return typeof value === 'string' && (SIDES as readonly string[]).includes(value)
    ? (value as SignalSide)
    : null;
}

/**
 * One line, trimmed, collapsed to single spaces, and cut at the stored
 * maximum. Newlines go because this is a one line note by design: a coach
 * writing paragraphs about a client has Coach Notes, which is a different
 * tool with a different audience.
 */
export function normalizeNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, COACH_NOTE_MAX_LENGTH);
}

export function resolveCoachSignal(
  input: CoachSignalInput,
  library: SignalLibrary
): CoachSignalResolution {
  const frequency = COACH_FREQUENCY_OPTIONS.find(
    (option) => option.valueKey === input.frequencyKey
  );
  if (!frequency) return { ok: false, error: 'Choose how often this shows up.' };

  const side = readSide(input.side);
  if (!side) return { ok: false, error: 'Choose a side, or N/A.' };

  const area = findBodyArea(library, input.bodyAreaKey ?? null);
  if (input.bodyAreaKey && !area) return { ok: false, error: 'That body area is not in the library.' };

  const note = normalizeNote(input.note);

  // A name the coach picked out of the search field. The library's own row
  // decides the category, whatever the client sent.
  const slug = typeof input.signalSlug === 'string' ? input.signalSlug.trim() : '';
  if (slug.length > 0) {
    const name = findName(library, slug);
    if (!name || !name.isCoachAddable) {
      return { ok: false, error: 'That signal is not in the library.' };
    }
    if (!findCategory(library, name.categoryKey)) {
      return { ok: false, error: 'That signal is not in the library.' };
    }
    return {
      ok: true,
      signal: {
        signalSlug: name.signalSlug,
        signalName: name.displayName,
        categoryKey: name.categoryKey,
        bodyAreaKey: area?.areaKey ?? name.defaultBodyAreaKey,
        symptomKey: findSymptom(library, input.symptomKey ?? null)?.symptomKey ?? name.defaultSymptomKey,
        side,
        valueKey: frequency.valueKey,
        valueLabel: frequency.label,
        valueNumeric: frequency.numeric,
        note,
        isNewName: false,
      },
    };
  }

  // A name composed from a tap on an area and a tap on a symptom.
  const symptom = findSymptom(library, input.symptomKey ?? null);
  if (!symptom) return { ok: false, error: 'Choose a signal, or an area and a symptom.' };

  const composed = composeSignalName(area, symptom);
  const existing = findName(library, composed.slug);
  const categoryKey = existing?.categoryKey ?? symptom.defaultCategoryKey ?? 'other';
  if (!findCategory(library, categoryKey)) {
    return { ok: false, error: 'That category is not in the library.' };
  }

  return {
    ok: true,
    signal: {
      signalSlug: composed.slug,
      signalName: existing?.displayName ?? composed.displayName,
      categoryKey,
      bodyAreaKey: area?.areaKey ?? null,
      symptomKey: symptom.symptomKey,
      side,
      valueKey: frequency.valueKey,
      valueLabel: frequency.label,
      valueNumeric: frequency.numeric,
      note,
      isNewName: existing === null,
    },
  };
}
