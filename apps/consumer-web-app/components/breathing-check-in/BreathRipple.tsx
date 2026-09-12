'use client';

/**
 * The completion moment's animation: a still centre that breathes, inside
 * two rings opening outward.
 *
 * IT IS NOT A SPINNER AND IT IS NOT PROGRESS. The submit it covers is
 * genuinely in flight, and the screen around it says in words what is
 * happening ("Your breathing pattern is ready."), so nothing here has to
 * stand in for a status. If the submit fails, the screen underneath this
 * says so and offers the button again; this component knows nothing about
 * that and simply keeps breathing.
 *
 * IT ARRIVES WHOLE. Every element is laid out and occupying its final box
 * in the first frame, and the only thing that animates is how it is
 * painted inside that box. That is the rule the section beat learned on a
 * real phone (components/questionnaire/SectionTransition.tsx): a member
 * watching a screen assemble itself cannot tell it apart from a screen
 * that has not finished loading.
 *
 * UNDER REDUCED MOTION IT IS A STILL RING, and that is a finished picture
 * rather than an empty box. The CSS at the bottom of app/globals.css stops
 * both loops.
 */

export function BreathRipple({ size = 132 }: { size?: number }) {
  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/*
        Two rings on one keyframe, the second delayed by half the cycle, so
        one is always opening while the other fades. Two elements rather
        than one longer animation, because a single ring reads as a pulse
        and two read as something continuous.
      */}
      <span
        className="mef-bpc-ripple absolute inset-0 rounded-full border border-[#C4A050]/45"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="mef-bpc-ripple absolute inset-0 rounded-full border border-[#C4A050]/30"
        style={{ animationDelay: '1200ms' }}
      />

      {/* The still centre, breathing at four seconds a cycle. */}
      <span
        className="mef-bpc-breathe block rounded-full bg-gradient-to-b from-[#C4A050]/25 to-[#1B3A2D]/10"
        style={{ width: size * 0.46, height: size * 0.46 }}
      />
    </div>
  );
}
