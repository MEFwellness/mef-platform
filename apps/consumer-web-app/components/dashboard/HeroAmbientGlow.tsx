'use client';

/**
 * Dashboard Evolution (Prompt 5), requirement 4: Ambient Motion — "subtle
 * life on the hero" / "slow gradient drift." A single soft, blurred glow
 * behind the hero's text column that very slowly shifts opacity and
 * position (`.mef-gradient-drift`, app/globals.css) — GPU-friendly
 * properties only (opacity + transform), per this prompt's own
 * performance budget. Purely decorative, so per Bible §10 it's gated
 * behind useLowPowerMode (battery/device tier, not just reduced motion)
 * exactly like components/motion/Float.tsx: on a low-power device this
 * renders nothing at all rather than a static substitute, since there's
 * nothing here worth keeping once it can't move.
 *
 * Deliberately the *only* ambient element on Home that isn't gated
 * through the Breathe primitive — per Bible §10's "never more than one
 * breathing/pulsing/floating element visible on screen at once," this
 * gradient drift is its own, different animation type (color/position
 * wash, not breathing/pulsing/floating a discrete element), so it can
 * coexist with the one Breathe instance on the Root Score without
 * violating that rule.
 */

import { useLowPowerMode } from '@/lib/motion/useLowPowerMode';

export function HeroAmbientGlow() {
  const lowPowerMode = useLowPowerMode();
  if (lowPowerMode) return null;

  return (
    <div
      aria-hidden="true"
      className="mef-gradient-drift pointer-events-none absolute -right-10 top-0 h-72 w-72 rounded-full bg-[#F5B700] blur-3xl"
    />
  );
}
