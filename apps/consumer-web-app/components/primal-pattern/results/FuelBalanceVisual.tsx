'use client';

/**
 * Visual Fuel Balance — animated rounded bars for Protein / Healthy Fat /
 * Carbohydrates, Deep Forest / Gold / Amber per the brief. Animates the
 * fill on mount using the same "mount, then animate on next frame" CSS
 * transition pattern as components/assessments/ScoreRing.tsx, rather than
 * a new keyframe, so it's consistent with how this app already animates
 * a value filling in.
 */

import { useEffect, useState } from 'react';
import { Beef, Droplet, Wheat } from 'lucide-react';
import {
  EDUCATIONAL_EXAMPLE_DISCLAIMER,
  FUEL_MACRO_COLOR,
  FUEL_MACRO_LABEL,
  type FuelBalance,
} from '@/lib/primal-pattern/premium/content';

const MACRO_ICON = { protein: Beef, fat: Droplet, carbohydrate: Wheat } as const;

export function FuelBalanceVisual({ balance }: { balance: FuelBalance }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const macros: (keyof FuelBalance)[] = ['protein', 'fat', 'carbohydrate'];

  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Visual Fuel Balance
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">
        A visual illustration of how your fuel mix tends to lean for your result.
      </p>

      <div className="mt-6 space-y-5">
        {macros.map((macro) => {
          const Icon = MACRO_ICON[macro];
          const percent = balance[macro];
          return (
            <div key={macro}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-[#1B3A2D]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {FUEL_MACRO_LABEL[macro]}
                </span>
                <span className="font-semibold text-[#1B3A2D]">{percent}%</span>
              </div>
              <div
                className="mt-2 h-4 w-full overflow-hidden rounded-full bg-[#F3F6F4]"
                role="img"
                aria-label={`${FUEL_MACRO_LABEL[macro]}, approximately ${percent} percent`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-[1.1s] ease-out motion-reduce:transition-none"
                  style={{
                    width: mounted ? `${percent}%` : '0%',
                    backgroundColor: FUEL_MACRO_COLOR[macro],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#6B7A72]">
        {EDUCATIONAL_EXAMPLE_DISCLAIMER}
      </p>
    </section>
  );
}
