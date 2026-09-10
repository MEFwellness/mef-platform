/**
 * Reading a stored trigger out of a jsonb column.
 *
 * ITS OWN MODULE, AND THAT IS NOT TIDINESS. ./contentData.ts has to parse
 * a trigger to load the library, and a member's own screens load their
 * content through that same file. If the parser lived beside the
 * evaluation engine, every member surface in this feature would have a
 * transitive import of the module that holds the coach association text,
 * and tests/body-systems-member-language.test.tsx would fail, correctly.
 * A trigger shape carries no association language, so it can live here on
 * its own and be reachable from anywhere.
 *
 * A ROW THAT DOES NOT PARSE IS DROPPED, never guessed at, so a mistyped
 * edit removes one entry from a coach's library instead of firing it on
 * everybody.
 */

import type { AssociationTrigger } from './types';

export function parseTrigger(raw: unknown): AssociationTrigger | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const type = value.type;
  const refs = Array.isArray(value.questions)
    ? value.questions.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const sections = Array.isArray(value.sections)
    ? value.sections.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : null;
  const band = typeof value.band === 'string' ? value.band : null;

  switch (type) {
    case 'cluster':
    case 'min_elevated':
      if (refs.length === 0 || min === null) return null;
      return { type, questions: refs, min };
    case 'all_elevated':
    case 'any_elevated':
      if (refs.length === 0) return null;
      return { type, questions: refs };
    case 'all_of':
    case 'any_of': {
      if (!Array.isArray(value.conditions)) return null;
      const parsed = value.conditions.map(parseTrigger);
      if (parsed.length === 0 || parsed.some((entry) => entry === null)) return null;
      return { type, conditions: parsed as AssociationTrigger[] };
    }
    case 'sections_at_band':
      if (sections.length === 0 || band === null) return null;
      return { type, sections, band };
    case 'sections_count_at_band':
      if (band === null || min === null) return null;
      return { type, band, min };
    default:
      return null;
  }
}
