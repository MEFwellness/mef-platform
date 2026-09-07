'use client';

/**
 * The ambient layer behind a Happiness deep-dive's question screens.
 *
 * MOVEMENT YOU FEEL RATHER THAN SEE. One very large, very soft warm field
 * drifting a few percent of its own width over eighteen seconds, at an
 * opacity that never rises above a fifth. It is not decoration competing
 * for her attention: it exists so a screen she sits on for four minutes
 * writing is not completely still, and it must never be the reason a word
 * is harder to read.
 *
 * IT REUSES THE SHIPPED AMBIENT KEYFRAME rather than defining a second
 * one. `.mef-gradient-drift` (app/globals.css) is the Home hero's own slow
 * drift: GPU friendly properties only, opacity inside the motion bible's
 * ambient ceiling, and its own prefers-reduced-motion override built in, so
 * a member who asks for reduced motion gets a completely still field with
 * no JavaScript branch needed here at all.
 *
 * PURELY DECORATIVE. aria-hidden and pointer-events-none, so it is invisible
 * to assistive technology and can never intercept a tap meant for the
 * writing box.
 */

export function AmbientDrift() {
  return (
    <div
      className="mef-gradient-drift pointer-events-none absolute -bottom-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-[#C4A050]/25 blur-[90px]"
      aria-hidden="true"
    />
  );
}
