/**
 * Daily Check-In redesign — resolves the visual treatment for a question
 * from its responseType, falling back to the row's explicit
 * displayStyle only when set (migration 112). This is the one place the
 * "driven by data, not hardcoded per question" rule lives: adding a new
 * driver_probe_questions row never requires touching this file, since
 * every responseType already has a sensible default here.
 */

import type { DisplayStyle, DriverProbeQuestion } from './types';

const DEFAULT_BY_RESPONSE_TYPE: Record<DriverProbeQuestion['responseType'], DisplayStyle> = {
  scale: 'segmented',
  single_select: 'pill_row',
  boolean: 'boolean_pills',
  count: 'dots',
  // No driver_probe_questions row uses time_pair today (the bedtime/wake
  // pair is a fixed-core field, not a schema row) — segmented is a
  // harmless fallback if one ever is added without an explicit style.
  time_pair: 'segmented',
};

export function resolveDisplayStyle(question: Pick<DriverProbeQuestion, 'responseType' | 'displayStyle'>): DisplayStyle {
  return question.displayStyle ?? DEFAULT_BY_RESPONSE_TYPE[question.responseType];
}
