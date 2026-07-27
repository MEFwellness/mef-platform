import { useEffect, useRef } from 'react';

export type ScreenUnitLike = { key: string; required: boolean; answered: boolean };

/** True once every required unit on the screen is answered — optional units (revealed follow-ups included) never block this, matching the pre-existing "optional units never block moving on" rule. Pure and directly testable without a rendering harness (this repo's vitest.config.ts runs a plain 'node' environment, no jsdom/RTL). */
export function isRequiredComplete(screen: readonly ScreenUnitLike[]): boolean {
  return screen.every((unit) => !unit.required || unit.answered);
}

/**
 * A stable fingerprint of "everything currently visible on this screen,
 * and what's been answered so far." Changes whenever a unit is revealed
 * or hidden (a conditional follow-up appearing) or any single unit's
 * answered state flips (required or optional) — which is exactly the
 * set of events that should re-arm the settle pause, per the task's own
 * definition: "every question currently visible ... including any
 * revealed by an answer given moments earlier." Two screens with the
 * same units in the same answered state always produce the same
 * signature, and only that — order-sensitive by design, since a
 * genuinely different screen (different mode, different day's rotating
 * picks) is expected to differ.
 */
export function screenSettleSignature(screen: readonly ScreenUnitLike[]): string {
  return screen.map((unit) => `${unit.key}:${unit.answered}`).join('|');
}

/**
 * A screen "settles" once every required unit on it is answered AND
 * nothing about what's visible has changed for `pauseMs` — never the
 * instant the required units alone become complete. That distinction is
 * the actual fix for a real, reported bug: answering "How much stress
 * are you carrying as you wake up?" with High used to auto-advance
 * immediately once mood/energy/stress (the screen's only *required*
 * units) were all answered, carrying her away before she could see or
 * answer "What's most of today's stress coming from, if anything?" —
 * an optional sibling already sitting right there on the same screen.
 * The same fault applied to every conditional local follow-up in the
 * bank (digestion_rating -> digestive_symptom_type, desk_hours_today ->
 * got_up_hourly, and 6 others — see the audit in BUILD_STATUS.md) and,
 * structurally, to *any* optional unit on a required-complete screen,
 * since the old hook only ever looked at required-completeness and had
 * no concept of the unit list itself.
 *
 * `screen` is passed in full (not just a boolean) specifically so a
 * newly revealed or newly answered unit — required or not — resets the
 * pause: the signature below changes on every one of those, and the
 * effect re-arms a fresh `pauseMs` timer each time it does. Only once
 * nothing has changed for a full `pauseMs` window, with every required
 * unit answered, does `onAdvance` fire — "genuinely optional ... given
 * the chance to be seen" per the task's own definition of settled,
 * not "answered."
 *
 * Auto-advance is a convenience layered on top of the persistent
 * Continue button, never a replacement for it — CheckinWizard's
 * `onContinue` calls `goNext`/`performSave` directly, entirely
 * independent of this hook, so a member can always move on by tapping
 * Continue even if this hook never fires for any reason.
 */
export function useScreenAutoAdvance(
  screen: readonly ScreenUnitLike[],
  screenIndex: number,
  onAdvance: () => void,
  pauseMs = 700
): void {
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;

  const requiredComplete = isRequiredComplete(screen);
  const signature = screenSettleSignature(screen);

  const lastScreenIndex = useRef(screenIndex);
  const firedForScreen = useRef(false);

  // Landing on a different screen always gets a clean slate — never
  // treated as "already fired" just because a previous screen was.
  if (lastScreenIndex.current !== screenIndex) {
    lastScreenIndex.current = screenIndex;
    firedForScreen.current = false;
  }

  useEffect(() => {
    if (!requiredComplete || firedForScreen.current) return undefined;

    const timer = setTimeout(() => {
      firedForScreen.current = true;
      advanceRef.current();
    }, pauseMs);

    return () => clearTimeout(timer);
    // Re-arming whenever `signature` changes (a reveal, or any answer
    // changing) is the actual settle behavior — deliberately not
    // narrowed to fewer deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, requiredComplete, screenIndex, pauseMs]);
}
