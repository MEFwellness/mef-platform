/**
 * Daily Check-In redesign — "rotating probe questions from the adaptive
 * picker slot into whichever screen matches their driver domain" (task
 * requirement 1). Driver ids are "<DOMAIN>-<n>" (e.g. 'SLP-2', 'STR-1' —
 * see driver_domains/drivers, migration 106); the domain prefix is
 * enough to route a question to the right wizard screen without a
 * second lookup table. A new driver domain added in the future falls
 * back to 'other' rather than throwing, so an unmapped domain never
 * blocks the check-in from rendering.
 */

import type { DriverProbeQuestion } from './types';

export type MorningScreenKey = 'feeling' | 'night' | 'body' | 'other';
export type EveningScreenKey = 'day' | 'body' | 'other';

const DOMAIN_TO_MORNING_SCREEN: Record<string, MorningScreenKey> = {
  STR: 'feeling',
  SLP: 'night',
  DIG: 'body',
  MOV: 'body',
  MEC: 'body',
  FUE: 'body',
  CTX: 'other',
};

const DOMAIN_TO_EVENING_SCREEN: Record<string, EveningScreenKey> = {
  SLP: 'day',
  STR: 'day',
  DIG: 'body',
  MOV: 'body',
  MEC: 'body',
  FUE: 'body',
  CTX: 'other',
};

/**
 * A local follow-up (driver_id null) has no domain of its own — its
 * `requires` rules reference its parent question_key instead, and it
 * only ever appears alongside the question that triggers it (e.g. "What
 * kept you up?" always follows "Did you go to bed later than you
 * wanted to?"). This is a small, explicit map of the handful of known
 * parent keys to the domain (or, for the fixed-core pain question,
 * literally "body") they belong to — there is no schema link from a
 * requires-rule's question_key back to that question's own driverId
 * without an extra query, so this stays a deliberately tiny lookup
 * rather than a guess.
 */
const PARENT_KEY_DOMAIN_HINTS: Record<string, string> = {
  'checkin_probe.bedtime_later_than_wanted': 'SLP',
  'checkin_probe.energy_crash_today': 'FUE',
  'checkin_probe.last_meal_timing': 'FUE',
  'checkin_probe.meals_skipped_today': 'FUE',
  'checkin_probe.alcohol_present': 'FUE',
  'checkin_probe.medication_or_supplement_change': 'CTX',
  'checkin_probe.emotional_load_today': 'STR',
  'checkin_probe.digestion_rating': 'DIG',
  'checkin.pain': 'body',
};

export function domainOfDriverId(driverId: string | null): string | null {
  if (!driverId) return null;
  const dashIndex = driverId.indexOf('-');
  return dashIndex === -1 ? driverId : driverId.slice(0, dashIndex);
}

function parentDomainOf(question: DriverProbeQuestion): string | null {
  return PARENT_KEY_DOMAIN_HINTS[question.requires[0]?.question_key ?? ''] ?? null;
}

export function morningScreenForQuestion(question: DriverProbeQuestion): MorningScreenKey {
  if (question.driverId) {
    return DOMAIN_TO_MORNING_SCREEN[domainOfDriverId(question.driverId) ?? ''] ?? 'other';
  }
  const parentDomain = parentDomainOf(question);
  if (parentDomain === 'body') return 'body';
  return parentDomain ? (DOMAIN_TO_MORNING_SCREEN[parentDomain] ?? 'other') : 'other';
}

export function eveningScreenForQuestion(question: DriverProbeQuestion): EveningScreenKey {
  if (question.driverId) {
    return DOMAIN_TO_EVENING_SCREEN[domainOfDriverId(question.driverId) ?? ''] ?? 'other';
  }
  const parentDomain = parentDomainOf(question);
  if (parentDomain === 'body') return 'body';
  return parentDomain ? (DOMAIN_TO_EVENING_SCREEN[parentDomain] ?? 'other') : 'other';
}
