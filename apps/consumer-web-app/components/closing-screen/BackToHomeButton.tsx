/**
 * THE WAY OUT OF A CLOSING SCREEN. One implementation, every closing.
 *
 * WHAT WAS WRONG (2026-09-05, found on a real phone). Every closing screen
 * ended with a bare text link, coloured forest on cream with no border, no
 * fill and no shape: on the Core Values Snapshot results screen it sat
 * under the resource card and "What Root knows so far", read as a footer
 * rather than a control, and was easy to miss entirely. Three separate
 * copies of it existed, one per experience, all identical, so there was no
 * one place to fix.
 *
 * THE STANDING DECISION IT ANSWERS, taken during the check-in redesign and
 * applied app-wide: leaving a screen must never be hard or take hunting,
 * especially for a member who is not young and is holding a phone at arm's
 * length. So the exit is a full-width control at the app's own 56px tap
 * height, in the app's own secondary button style, with a border a member
 * can see.
 *
 * IT IS THE SECONDARY STYLE ON PURPOSE. Several of these screens end with
 * a real primary next step (start the next conversation, see what
 * membership includes), and the way out must be unmissable without
 * out-shouting the thing she came here for. This is the same bordered
 * full-width shape those screens already use for their own "not now"
 * control, so a closing screen reads as one set of choices rather than two
 * button systems stacked.
 *
 * ONE NAME FOR HOME. "Back to Home", which is what /questionnaires,
 * /progress, /food-lens, /movement, /conversation and the trial arc's own
 * close already call it. The old copies said "Return to Dashboard", a
 * screen no member-facing surface has called the dashboard for a long
 * time.
 */

'use client';

import Link from 'next/link';
import type { Route } from 'next';

/** The one label. Exported so a test can assert it rather than retyping it. */
export const BACK_TO_HOME_LABEL = 'Back to Home';

export function BackToHomeButton({
  /**
   * Where the way out goes. Defaults to Home, which is right everywhere
   * except the day 8 continuation screen, where Home is behind the lock
   * and that screen passes its own address (see TrialArcRecapView).
   */
  href = '/dashboard',
  /** Its words, when a screen has its own already-approved wording for the same exit. */
  label = BACK_TO_HOME_LABEL,
  /**
   * Recorded on the way out, where a screen counts which door was taken.
   * The trial arc's close does, and choosing no door there is a real
   * outcome rather than an absence.
   */
  onClick,
  className = '',
}: {
  href?: string;
  label?: string;
  onClick?: () => void;
  className?: string;
} = {}) {
  return (
    <Link
      href={href as Route}
      // Spread rather than passed as `onClick={onClick}`: under
      // exactOptionalPropertyTypes an explicit `undefined` is not the same
      // as an absent prop, and next/link's own types refuse it.
      {...(onClick ? { onClick } : {})}
      className={`mef-focus-ring mef-press block w-full rounded-2xl border border-[#1B3A2D]/20 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] ${className}`}
    >
      {label}
    </Link>
  );
}
