'use client';

/**
 * Root Map — "Not Covered Yet" section (Root Map redesign, 2026-07-28,
 * Part 4). The four domains with no assessment behind them at all
 * (`isUninstrumented`), condensed into one small section with a single
 * shared explanation instead of four separate full cards.
 *
 * A 'use client' component since 2026-07-29: tapping one of the four
 * segments on the ring above now scrolls to this section's own id (not an
 * individual item's — see lib/root-map/anchors.ts's
 * `NOT_COVERED_SECTION_ANCHOR_ID` doc comment for why) and separately
 * requests a highlight naming which one was tapped
 * (lib/root-map/highlightBus.ts), since four identical-looking items gave
 * no indication which the tap was even about.
 */

import { useEffect, useState } from 'react';
import type { RootMapDomainView } from '@/lib/root-map';
import { domainAnchorId, NOT_COVERED_SECTION_ANCHOR_ID } from '@/lib/root-map/anchors';
import { useRootMapHighlightRequests } from '@/lib/root-map/highlightBus';

const EXPLANATION =
  "These four are real coaching territory. There just isn't a dedicated assessment for them on the platform yet, so nothing here is tracked from your activity today.";

/** How long the tapped domain stays visually marked before fading back to normal. */
const HIGHLIGHT_DURATION_MS = 2600;

export function RootMapNotCoveredSection({ domains }: { domains: RootMapDomainView[] }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useRootMapHighlightRequests(setHighlighted);

  useEffect(() => {
    if (!highlighted) return undefined;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  if (domains.length === 0) return null;

  return (
    <section
      id={NOT_COVERED_SECTION_ANCHOR_ID}
      className="scroll-mt-24 rounded-2xl bg-white/50 px-4 py-3.5"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Not Covered Yet</p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{EXPLANATION}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {domains.map((d) => (
          <li
            key={d.domain}
            id={domainAnchorId(d.domain)}
            className={`scroll-mt-24 rounded-full px-2 py-0.5 text-sm text-[#1B3A2D]/80 transition-colors duration-500 ${
              highlighted === d.domain ? 'bg-[#FDF2E3] text-[#1B3A2D] ring-1 ring-[#F5B700]' : ''
            }`}
          >
            {d.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
