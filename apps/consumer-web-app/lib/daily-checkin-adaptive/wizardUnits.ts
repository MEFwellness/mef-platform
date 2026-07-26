/**
 * Daily Check-In redesign v2 — the shared "unit" model both check-in
 * forms build their screens from. A unit is one focused thing to answer
 * (a single question, or one combined gesture like the sleep arc or the
 * body-outline+severity control). How units are grouped into wizard
 * screens is the ONLY thing that differs between the two modes:
 *
 * - Section mode (every check-in after the first): units are grouped by
 *   their `section` key into the flow's fixed screens — e.g. morning's
 *   "How you're feeling" screen groups the mood/energy/stress units.
 * - Cinematic mode (the member's very first check-in only): every unit
 *   gets its own screen, full ceremony, one at a time.
 *
 * Neither mode ever splits an already-combined gesture (the sleep arc,
 * the body outline) into smaller pieces — those are each already a
 * single unit, in both modes.
 */

import type { ReactNode } from 'react';

export type CheckinMode = 'cinematic' | 'section';

export type CheckinUnit = {
  key: string;
  section: string;
  /** Whether this unit gates auto-advance / the final submit. Optional units (rotating probes, notes, the concern flag) never block moving on. */
  required: boolean;
  answered: boolean;
  render: () => ReactNode;
};

/** Groups units into the wizard's actual screens for the given mode and section order. Section-mode groups are only ever empty if a section has no units at all — doesn't happen for morning/evening today, since each section always carries at least its own fixed content, but the filter keeps this honest rather than assuming it. */
export function groupUnitsIntoScreens(
  units: readonly CheckinUnit[],
  mode: CheckinMode,
  sectionOrder: readonly string[]
): CheckinUnit[][] {
  if (mode === 'cinematic') {
    return units.map((unit) => [unit]);
  }
  return sectionOrder
    .map((section) => units.filter((unit) => unit.section === section))
    .filter((group) => group.length > 0);
}

/** A screen (array of units) is "complete" for auto-advance purposes once every REQUIRED unit on it is answered — optional units (rotating probes, notes, concern) never block moving on, in either mode. */
export function isScreenComplete(screen: readonly CheckinUnit[]): boolean {
  return screen.every((unit) => !unit.required || unit.answered);
}
