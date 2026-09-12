/**
 * Everything a member could have sent, reduced to what this instrument can
 * actually hold.
 *
 * THE SERVER DECIDES WHAT IS STORED, NOT THE SCREEN. The taker posts an
 * answers object. This turns it into answers to questions that exist, with
 * values those questions actually offer, for screens her own earlier
 * answers genuinely opened. A hand made POST therefore cannot answer a
 * question she was never asked, cannot invent an option, cannot store a
 * stress mark of ninety, and cannot leave a medication behind on a branch
 * she closed.
 *
 * IT IS PURE, AND IT IS THE SAME FUNCTION ON BOTH SIDES. The taker runs it
 * on the way in so a stored answer that is no longer valid (a question
 * whose options changed while she was partway through) is simply asked
 * again rather than carried; the server runs it on every save and again at
 * submit. One implementation, so the two cannot disagree about what
 * survived.
 *
 * A BLANK IS NOT AN ERASURE OF SOMETHING ELSE. An empty string is dropped
 * as "not answered" rather than stored, so a field she cleared stops
 * counting, and no other field is touched by it.
 */

import { applyMultiSelect, itemsForFollowUp, pruneAnswers } from './branching';
import { allFields, allScreens } from './questions';
import type { IntakeAnswers, IntakeAnswerValue, IntakeEntry, IntakeField, IntakeOption } from './types';

/** Longest a single line answer may be. Generous for a person, bounded for a row. */
export const MAX_TEXT = 240;
/** Longest a free response may be. */
export const MAX_LONG_TEXT = 1200;
/** Most entries one repeatable list may hold. */
export const MAX_ENTRIES = 20;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const YEAR_PATTERN = /^(19|20)\d{2}$/;
/** The one stored spelling of a height, produced by the picker and nothing else. */
export const HEIGHT_PATTERN = /^[3-7] ft (0|[1-9]|1[01]) in$/;

/** The feet a member can pick, and the inches, so the picker and the guard agree. */
export const HEIGHT_FEET = [3, 4, 5, 6, 7];
export const HEIGHT_INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function formatHeight(feet: number, inches: number): string {
  return `${feet} ft ${inches} in`;
}

export function parseHeight(value: string): { feet: number; inches: number } | null {
  if (!HEIGHT_PATTERN.test(value)) return null;
  const parts = value.split(' ');
  return { feet: Number(parts[0]), inches: Number(parts[2]) };
}

/**
 * Every option one field offers, merged across every screen that draws it.
 *
 * Section eleven's symptoms list is one field spread over four screens, so
 * a validator reading only the first screen would refuse eleven of its own
 * seventeen options.
 */
export function optionsForField(fieldId: string): IntakeOption[] {
  const merged: IntakeOption[] = [];
  for (const field of allFields()) {
    if (field.id !== fieldId) continue;
    if (field.kind !== 'single_select' && field.kind !== 'multi_select' && field.kind !== 'per_item')
      continue;
    for (const option of field.options) {
      if (merged.some((entry) => entry.value === option.value)) continue;
      merged.push(option);
    }
  }
  return merged;
}

function trimmed(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function sanitizeEntry(
  field: Extract<IntakeField, { kind: 'entry_list' }>,
  raw: unknown
): IntakeEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const entry: IntakeEntry = {};
  for (const entryField of field.entryFields) {
    const value = trimmed(source[entryField.id], MAX_TEXT);
    if (value.length === 0) continue;
    if (entryField.kind === 'year') {
      if (!YEAR_PATTERN.test(value)) continue;
    }
    if (entryField.kind === 'select') {
      if (!entryField.options.some((option) => option.value === value)) continue;
    }
    entry[entryField.id] = value;
  }
  // An entry with nothing in any REQUIRED field is not an entry. A member
  // who opened the form and closed it again has added nothing.
  const required = field.entryFields.filter((entryField) => entryField.optional !== true);
  const hasRequired = required.every((entryField) => (entry[entryField.id] ?? '').length > 0);
  if (!hasRequired) return null;
  return entry;
}

function sanitizeOne(field: IntakeField, raw: unknown, answers: IntakeAnswers): IntakeAnswerValue | null {
  switch (field.kind) {
    case 'short_text': {
      const value = trimmed(raw, MAX_TEXT);
      return value.length > 0 ? value : null;
    }
    case 'long_text': {
      const value = trimmed(raw, MAX_LONG_TEXT);
      return value.length > 0 ? value : null;
    }
    case 'date': {
      const value = trimmed(raw, 10);
      return DATE_PATTERN.test(value) ? value : null;
    }
    case 'time': {
      const value = trimmed(raw, 5);
      return TIME_PATTERN.test(value) ? value : null;
    }
    case 'height': {
      const value = trimmed(raw, MAX_TEXT);
      return HEIGHT_PATTERN.test(value) ? value : null;
    }
    case 'gate': {
      const value = trimmed(raw, 8);
      return value === 'yes' || value === 'no' ? value : null;
    }
    case 'scale_ten': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
      const whole = Math.round(raw);
      return whole >= 1 && whole <= 10 ? whole : null;
    }
    case 'single_select': {
      const value = trimmed(raw, MAX_TEXT);
      return optionsForField(field.id).some((option) => option.value === value) ? value : null;
    }
    case 'multi_select': {
      if (!Array.isArray(raw)) return null;
      const allowed = optionsForField(field.id);
      const exclusives = new Set(
        allowed.filter((option) => option.exclusive).map((option) => option.value)
      );
      const chosen: string[] = [];
      for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        if (!allowed.some((option) => option.value === entry)) continue;
        if (chosen.includes(entry)) continue;
        chosen.push(entry);
      }
      // The exclusive rule applied server side too, so a hand made POST
      // cannot store "No meaningful change" beside four changed areas.
      const exclusive = chosen.find((value) => exclusives.has(value));
      const kept = exclusive ? [exclusive] : chosen;
      return kept.length > 0 ? kept : null;
    }
    case 'entry_list': {
      if (!Array.isArray(raw)) return null;
      const entries: IntakeEntry[] = [];
      for (const candidate of raw.slice(0, MAX_ENTRIES)) {
        const entry = sanitizeEntry(field, candidate);
        if (entry) entries.push(entry);
      }
      return entries.length > 0 ? entries : null;
    }
    case 'per_item': {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const source = raw as Record<string, unknown>;
      const allowedItems = new Set(itemsForFollowUp(field, answers));
      const allowedValues = new Set(field.options.map((option) => option.value));
      const map: Record<string, string> = {};
      for (const [item, value] of Object.entries(source)) {
        if (!allowedItems.has(item)) continue;
        const clean = trimmed(value, MAX_TEXT);
        if (!allowedValues.has(clean)) continue;
        map[item] = clean;
      }
      return Object.keys(map).length > 0 ? map : null;
    }
  }
}

/**
 * One pass of sanitising, applied in the order answers depend on each
 * other.
 *
 * GATES AND MULTI-SELECTS FIRST, because everything that decides which
 * screens exist is one of those, and a per item follow-up cannot be checked
 * against the list of items it is asked about until that list has itself
 * been cleaned.
 *
 * WHAT IT TAKES OUT IS RETURNED, NOT THROWN AWAY. The kept set is what
 * every coach facing surface reads. The dropped set is what she removed by
 * changing a gate, stored in its own column for audit and handed to
 * nothing else.
 */
export function sanitizeWithArchive(raw: unknown): { kept: IntakeAnswers; dropped: IntakeAnswers } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kept: {}, dropped: {} };
  const source = raw as Record<string, unknown>;

  const fieldsById = new Map<string, IntakeField>();
  for (const screen of allScreens()) {
    for (const field of screen.fields) {
      if (!fieldsById.has(field.id)) fieldsById.set(field.id, field);
    }
  }

  const answers: IntakeAnswers = {};
  const all = [...fieldsById.values()];
  for (const field of all) {
    if (field.kind === 'per_item') continue;
    const value = sanitizeOne(field, source[field.id], answers);
    if (value !== null) answers[field.id] = value;
  }
  for (const field of all) {
    if (field.kind !== 'per_item') continue;
    const value = sanitizeOne(field, source[field.id], answers);
    if (value !== null) answers[field.id] = value;
  }

  // And finally, everything she is no longer being asked is taken out. This
  // is the one place an answer is dropped, and it runs on the client when
  // she confirms a flip and on the server on every write.
  return pruneAnswers(answers);
}

/** The kept set alone, for the callers that have no archive to write. */
export function sanitizeAnswers(raw: unknown): IntakeAnswers {
  return sanitizeWithArchive(raw).kept;
}

/** Re-exported so a screen and the server apply the same exclusive rule. */
export { applyMultiSelect };
