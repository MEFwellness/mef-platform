/**
 * THE PRIORITY CARD'S BUTTONS, DECIDED FROM THE PRIORITY ITSELF.
 *
 * WHAT WENT WRONG (2026-09-05, found on a real phone). The pop-up read
 * "Morning Mobility is there if you want it today." and offered Done,
 * Help me and Save for later. Nothing had been started. "Done" was an
 * offer of a completion claim about a session she had not opened, and
 * tapping it wrote `member_daily_priorities.status = 'done'`, an outcome
 * ledger row answered 'done', and a `coaching_action_acted` event. Three
 * rows saying she did a workout that never happened, and the adaptation
 * guardrails read all three.
 *
 * THE RULE THIS FILE ENFORCES, and it is one sentence: a priority whose
 * thing lives inside this app is an OFFER, and an offer is never answered
 * with a completion claim, because the app records what actually happened
 * at the destination. A priority whose thing happens in her life is
 * SELF-REPORTED, and there the claim is hers to make and Done is honest.
 *
 * THE DISCRIMINATOR IS A ROW, NOT A WORD. `href` is written onto the
 * `member_daily_priorities` row by the engine that chose the priority
 * (lib/priority/select.ts), and it is non-null exactly when the priority
 * points at a screen in this app. Nothing here reads a title, a help
 * string or any other copy, so no re-wording of a priority can ever move
 * it between modes, and a rule that gains or loses a destination moves
 * with its own data.
 *
 * WHY AN OFFER STILL NEEDS NO DONE BUTTON, stated per destination rather
 * than as a promise:
 *
 *   movement      lib/coaching-direction/movementOutcome.ts already marks
 *                 today's priority done when she finishes the session Root
 *                 offered. Its own header says it: "a member who does the
 *                 workout must never also have to tap Done."
 *   the check-in  lib/priority/data.ts's redecideDailyPriority replaces the
 *                 day's priority once her Daily Reset exists, so the card
 *                 stops asking for the thing she has done.
 *   the rest      Food Lens and a half-finished assessment are not marked
 *                 done by this card today, and this build does not add
 *                 that. She leaves them, or she sets them aside. Neither
 *                 writes a false completion, which is the thing that was
 *                 wrong.
 *
 * THE THIRD MODE. The safety override says "Nothing is being asked of you
 * today. Take it gently." There is nothing to open and nothing to claim,
 * so it gets neither button: one way to acknowledge it, and the help text
 * that names her care team. A Done there was a completion claim over
 * nothing at all.
 */

import type { PriorityRule } from './types';
import {
  PRIORITY_BUTTON_LABELS,
  PRIORITY_OPEN_FALLBACK_LABEL,
  PRIORITY_NOT_TODAY_TEXT,
  PRIORITY_ACKNOWLEDGED_TEXT,
  PRIORITY_SAVED_TEXT,
} from './copy';

/**
 * Which of the three shapes today's priority is.
 *
 *   'offer'        it names a screen in this app. Open it, or not today.
 *   'self_report'  it happens in her life. Only she can say it happened.
 *   'acknowledge'  the safety override. Nothing is being asked at all.
 */
export type PriorityActionMode = 'offer' | 'self_report' | 'acknowledge';

export type PriorityPrimaryAction =
  | { kind: 'open'; label: string; href: string }
  | { kind: 'done'; label: string };

export type PriorityActionSet = {
  mode: PriorityActionMode;
  /** The one action that leads somewhere. Null only for the safety override. */
  primary: PriorityPrimaryAction | null;
  /** Every rule authors a smaller way in, so this is present in all three modes. */
  helpLabel: string;
  /** The way out that claims nothing. */
  setAsideLabel: string;
  /** What the card says once she has taken that way out. */
  setAsideText: string;
};

/**
 * The mode, from the two fields the stored row carries. Exported on its
 * own because the server action guard
 * (app/actions/priority.ts's completePriorityAction) asks this question
 * about a `DailyPriorityRecord` and must get the identical answer the card
 * got, without building a whole action set to find out.
 */
export function priorityActionMode(rule: PriorityRule, href: string | null): PriorityActionMode {
  if (rule === 'safety') return 'acknowledge';
  return href ? 'offer' : 'self_report';
}

/** True only where a member is genuinely the only witness, which is the only place a Done claim is honest. */
export function acceptsDoneClaim(rule: PriorityRule, href: string | null): boolean {
  return priorityActionMode(rule, href) === 'self_report';
}

/**
 * The buttons for one priority.
 *
 * `openTarget` is the destination's own display name, carried from the
 * system that owns it (a Root Movement template's name, the assessment
 * registry's name). Null is not an error: the label falls back to the
 * app's existing plain "Open it", which is what the inline card's link has
 * always said.
 */
export function priorityActionSet({
  rule,
  href,
  openTarget,
}: {
  rule: PriorityRule;
  href: string | null;
  openTarget: string | null;
}): PriorityActionSet {
  const mode = priorityActionMode(rule, href);

  if (mode === 'acknowledge') {
    return {
      mode,
      primary: null,
      helpLabel: PRIORITY_BUTTON_LABELS.help,
      setAsideLabel: PRIORITY_BUTTON_LABELS.acknowledge,
      setAsideText: PRIORITY_ACKNOWLEDGED_TEXT,
    };
  }

  if (mode === 'offer') {
    return {
      mode,
      primary: {
        kind: 'open',
        label: openTarget ? `Open ${openTarget}` : PRIORITY_OPEN_FALLBACK_LABEL,
        // Narrowed by `mode === 'offer'`, which is only reachable with a
        // non-null href. Stated rather than asserted, so a later change to
        // priorityActionMode cannot silently produce a link to nowhere.
        href: href ?? '',
      },
      helpLabel: PRIORITY_BUTTON_LABELS.help,
      setAsideLabel: PRIORITY_BUTTON_LABELS.notToday,
      setAsideText: PRIORITY_NOT_TODAY_TEXT,
    };
  }

  return {
    mode,
    primary: { kind: 'done', label: PRIORITY_BUTTON_LABELS.done },
    helpLabel: PRIORITY_BUTTON_LABELS.help,
    setAsideLabel: PRIORITY_BUTTON_LABELS.save,
    setAsideText: PRIORITY_SAVED_TEXT,
  };
}
