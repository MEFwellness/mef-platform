/**
 * Elegant, minimal explanation of the three zones printed on the source
 * instrument's "Suggested Use of Exercise" table (docs/assessments/
 * four-doctors/SPEC.md section 7): each zone gets its own softly tinted
 * card in its own color, never a paragraph. Reads the same ZONES config
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
      <div className="mt-5 space-y-3">
        {ZONE_ORDER.map((zoneId) => {
          const zone = ZONES[zoneId];
          return (
            <div
              key={zone.id}
              className="flex items-start gap-3.5 rounded-2xl p-4"
              style={{ backgroundColor: zone.tint }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ backgroundColor: zone.color, color: '#FFFFFF' }}
                aria-hidden="true"
              >
                {zone.label.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: zone.color }}>
                  {zone.label}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{zone.meaning}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
