/**
 * Root Map — "Not Covered Yet" section (Root Map redesign, 2026-07-28,
 * Part 4). The four domains with no assessment behind them at all
 * (`isUninstrumented`), condensed into one small section with a single
 * shared explanation instead of four separate full cards.
 */

import type { RootMapDomainView } from '@/lib/root-map';
import { domainAnchorId } from '@/lib/root-map/anchors';

const EXPLANATION =
  "These four are real coaching territory — there just isn't a dedicated assessment for them on the platform yet, so nothing here is tracked from your activity today.";

export function RootMapNotCoveredSection({ domains }: { domains: RootMapDomainView[] }) {
  if (domains.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white/50 px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Not Covered Yet</p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{EXPLANATION}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {domains.map((d) => (
          <li
            key={d.domain}
            id={domainAnchorId(d.domain)}
            className="scroll-mt-24 text-sm text-[#1B3A2D]/80"
          >
            {d.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
