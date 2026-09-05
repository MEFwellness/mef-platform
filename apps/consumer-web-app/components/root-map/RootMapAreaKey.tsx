'use client';

/**
 * Root Map — the numbered key that says which area each segment is.
 *
 * MOVED, NOT REWRITTEN (2026-09-05). This is the ordered, tappable list
 * that used to render directly under the ring inside RootMapRing.tsx: the
 * same canonical order, the same numbers, the same gold/green chip from
 * the same `colorFor`, the same tap behaviour. What changed is where it
 * sits. The Root Map opened five and a half screens long, and the twelve
 * names were the first thing between a member and the one line that says
 * what was actually noticed, so the key now opens with the entries it is a
 * key TO, inside the page's "See all 12 areas" reveal.
 *
 * The numbers on the ring stay where they are. They are its identification
 * fix and they cost no vertical space; a member who wants to know what
 * number 7 is taps the reveal once and reads it here, next to what Root
 * actually has to say about it.
 *
 * IT MAKES NO CLAIM OF ITS OWN. The chip is gold exactly when `colorFor`
 * says gold, which is exactly when that domain has a real earned finding,
 * which is exactly what the ring's own segment shows. One predicate, one
 * meaning, two places it is drawn.
 */

import { COACHING_DOMAINS } from '@/lib/investigation-engine/domains';
import { useChartRevealOnce } from '@/components/useChartRevealOnce';
import { colorFor, type RingDomain } from './ringDomains';
import { scrollToRootMapDomain } from './scrollToDomain';

export function RootMapAreaKey({ domains }: { domains: RingDomain[] }) {
  // Only for its `reducedMotion` reading, which decides whether the jump
  // is smooth or instant. The same hook the ring uses, so the two agree.
  const { reducedMotion } = useChartRevealOnce();

  const byDomain = new Map(domains.map((d) => [d.domain, d]));
  const ordered = COACHING_DOMAINS.map((info) => byDomain.get(info.domain)).filter(
    (d): d is RingDomain => Boolean(d)
  );

  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
      {ordered.map((domain, index) => (
        <li key={domain.domain}>
          <button
            type="button"
            onClick={() => scrollToRootMapDomain(domain, reducedMotion)}
            className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs leading-snug text-[#1B3A2D] transition hover:text-[#3E5C46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: colorFor(domain) }}
            >
              {index + 1}
            </span>
            <span>{domain.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
