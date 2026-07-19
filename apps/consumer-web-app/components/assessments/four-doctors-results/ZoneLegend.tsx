/**
 * Elegant, minimal explanation of the three zones printed on the source
 * instrument's "Suggested Use of Exercise" table (docs/assessments/
 * four-doctors/SPEC.md section 7): a color swatch, the zone's own name,
 * and one short phrase, never a paragraph. Reads the same ZONES config
 * the Wheel and Doctor cards use, so a color here always matches what a
 * member already saw elsewhere on the page.
 */

import { ZONE_ORDER, ZONES } from '@/lib/assessments/four-doctors/premium/zones';

export function ZoneLegend() {
  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Understanding Your Zones
      </p>
      <div className="mt-5 space-y-4">
        {ZONE_ORDER.map((zoneId) => {
          const zone = ZONES[zoneId];
          return (
            <div key={zone.id} className="flex items-start gap-3">
              <span
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: zone.color }}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-[#1B3A2D]">{zone.label}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[#6B7A72]">{zone.meaning}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
