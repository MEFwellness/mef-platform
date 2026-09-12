/**
 * Reading a stored rule or trigger, safely.
 *
 * A SHAPE AND NO WORDS. This module is imported by the content loader,
 * which a member's own screens reach, so it deliberately holds nothing a
 * coach reads. The same separation lib/body-systems/trigger.ts draws, and
 * for the same reason: a type import is erased at compile time, but the
 * honest fix is that a member surface has no path to the module holding
 * practitioner TEXT at all.
 *
 * ANYTHING THAT DOES NOT PARSE IS DROPPED, never guessed at, so a mistyped
 * edit removes one entry from a coach's library rather than firing it on
 * every member.
 */

import type { CoachingTrigger, PatternRule } from './types';

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) return null;
    out.push(entry);
  }
  return out.length > 0 ? out : null;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parsePatternRule(raw: unknown): PatternRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (value.type === 'sections_at_or_above') {
    const sections = asStringArray(value.sections);
    if (!sections) return null;
    const minPercent = asOptionalNumber(value.minPercent);
    return minPercent === undefined
      ? { type: 'sections_at_or_above', sections }
      : { type: 'sections_at_or_above', sections, minPercent };
  }

  if (value.type === 'sections_count_at_or_above') {
    const minCount = asOptionalNumber(value.minCount);
    if (minCount === undefined || minCount < 1) return null;
    const minPercent = asOptionalNumber(value.minPercent);
    return minPercent === undefined
      ? { type: 'sections_count_at_or_above', minCount }
      : { type: 'sections_count_at_or_above', minCount, minPercent };
  }

  return null;
}

export function parseCoachingTrigger(raw: unknown): CoachingTrigger | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (value.type === 'sections_at_or_above') {
    const sections = asStringArray(value.sections);
    if (!sections) return null;
    const minPercent = asOptionalNumber(value.minPercent);
    return minPercent === undefined
      ? { type: 'sections_at_or_above', sections }
      : { type: 'sections_at_or_above', sections, minPercent };
  }

  if (value.type === 'section') {
    if (typeof value.section !== 'string' || value.section.length === 0) return null;
    const minPercent = asOptionalNumber(value.minPercent);
    return minPercent === undefined
      ? { type: 'section', section: value.section }
      : { type: 'section', section: value.section, minPercent };
  }

  if (value.type === 'answer') {
    const questions = asStringArray(value.questions);
    if (!questions) return null;
    const minSignal = asOptionalNumber(value.minSignal);
    return minSignal === undefined
      ? { type: 'answer', questions }
      : { type: 'answer', questions, minSignal };
  }

  if (value.type === 'primary_zone') {
    if (typeof value.zone !== 'string' || value.zone.length === 0) return null;
    return { type: 'primary_zone', zone: value.zone };
  }

  return null;
}
