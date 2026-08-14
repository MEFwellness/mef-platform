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
import type { DriverProbeQuestion } from './types';

export type CheckinMode = 'cinematic' | 'section';

export type CheckinUnit = {
  key: string;
  section: string;
  /**
   * The one field that decides whether this unit gates Continue, AND the
   * short member-facing line shown when it does. `null` means optional
   * (rotating probes, notes, the concern flag) and never blocks moving on.
   *
   * 2026-08-14 fix, "Continue must never silently do nothing": this used
   * to be a plain `required: boolean`, so a screen could block Continue
   * with nothing on screen saying why — which is exactly how the reported
   * "Continue is dead and gives no feedback" bug felt from the member's
   * side. Fusing the two into a single field makes a silent block
   * structurally impossible to write: there is no way to mark a unit
   * blocking without also supplying the sentence the member reads. That
   * is a stronger guarantee than any test, because it fails at compile
   * time rather than at review time.
   *
   * Keep it short, second person, and free of em dashes (member-facing
   * copy rule), e.g. 'Select 2 meals.'
   */
  blockedReason: string | null;
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

/** A screen (array of units) is "complete" once every blocking unit on it is answered — optional units (rotating probes, notes, concern) never block moving on, in either mode. */
export function isScreenComplete(screen: readonly CheckinUnit[]): boolean {
  return screen.every((unit) => unit.blockedReason === null || unit.answered);
}

/**
 * The first blocking-and-unanswered unit's reason, or null when the screen
 * is complete — what the wizard shows above a disabled Continue so the
 * member is never left tapping a dead control with no explanation
 * (2026-08-14 fix). One line, not a list: the topmost missing thing is the
 * one she should deal with first, and a stack of four sentences under the
 * button reads as an error state rather than a nudge.
 */
export function screenBlockedReason(screen: readonly CheckinUnit[]): string | null {
  return screen.find((unit) => unit.blockedReason !== null && !unit.answered)?.blockedReason ?? null;
}

/**
 * Every follow-up must render directly beneath the question that
 * triggered it (2026-07-28 fix) — both CheckinForm.tsx and
 * EveningReflectionForm.tsx used to build the rotating-probe question
 * list and the local-follow-up question list as two separate arrays,
 * concatenated (or pushed in two loops), so EVERY follow-up landed after
 * EVERY rotating probe on the screen regardless of which probe actually
 * triggered it. This orders `probes` with each probe's own eligible
 * follow-ups spliced in immediately after it — a follow-up's parent is
 * its own `requires[0].question_key` (the same convention
 * screenGrouping.ts's parentDomainOf() already reads to route a
 * follow-up's screen). A follow-up whose parent isn't among `probes` at
 * all (shouldn't happen — a follow-up is only ever eligible once its
 * parent has actually been answered today, which requires the parent to
 * have been rendered today) is appended at the end rather than silently
 * dropped.
 */
export function interleaveFollowUps(
  probes: readonly DriverProbeQuestion[],
  followUps: readonly DriverProbeQuestion[]
): DriverProbeQuestion[] {
  const ordered: DriverProbeQuestion[] = [];
  const matchedKeys = new Set<string>();

  for (const probe of probes) {
    ordered.push(probe);
    for (const followUp of followUps) {
      if (followUp.requires[0]?.question_key !== probe.questionKey) continue;
      ordered.push(followUp);
      matchedKeys.add(followUp.questionKey);
    }
  }
  for (const followUp of followUps) {
    if (!matchedKeys.has(followUp.questionKey)) ordered.push(followUp);
  }
  return ordered;
}
