'use client';

/**
 * Root Map — the actual map (Root Map redesign, 2026-07-28, Part 5). A
 * twelve-segment ring, one segment per Coaching Domain, in the same
 * canonical order COACHING_DOMAINS itself defines — not the
 * priority-sorted order the cards below render in, so the map itself
 * stays a stable layout rather than reshuffling as findings come in.
 *
 * Reveal mechanism is reused, not reinvented: `useChartRevealOnce()` is
 * the same scroll-triggered, one-shot hook the Home/Progress trend charts
 * already use, driving a `stroke-dashoffset` transition — the exact
 * technique FourDoctorsWheel.tsx already uses for its own ring, just with
 * each segment's arc length carrying real meaning (fill fraction) instead
 * of all four being equal.
 *
 * Each segment is drawn twice: a wide, fully-transparent hit-target arc
 * (always the domain's full slot, so an empty/near-empty segment is still
 * easy to tap) underneath the real, proportionally-filled, non-interactive
 * visual arc on top.
 */

import { useChartRevealOnce } from '@/components/useChartRevealOnce';
import { COACHING_DOMAINS, type CoachingDomain } from '@/lib/investigation-engine/domains';
import type { DomainCoverage } from '@/lib/root-map';
import { domainAnchorId } from '@/lib/root-map/anchors';

const DEEP_GREEN = '#1B3A2D';
const GOLD = '#F5B700';
const TRACK = 'rgba(27,58,45,0.08)';

/**
 * Only what the ring actually needs to draw and label itself — never the
 * full RootMapDomainView. That view carries `definition`, the coach-only
 * third-person text (RootMapDomainCard.tsx's field, untouched) — passing
 * the whole object into this 'use client' component would serialize it
 * into the member page's own RSC payload even though nothing here ever
 * renders it.
 */
export type RingDomain = {
  domain: CoachingDomain;
  label: string;
  whatWeUnderstand: unknown[];
};

function fillFractionFor(domain: RingDomain, coverage: DomainCoverage | undefined): number {
  if (domain.whatWeUnderstand.length > 0) return 1;
  if (!coverage || coverage.windowDays === 0) return 0;
  return Math.max(0, Math.min(1, coverage.count / coverage.windowDays));
}

function colorFor(domain: RingDomain): string {
  return domain.whatWeUnderstand.length > 0 ? GOLD : DEEP_GREEN;
}

export function RootMapRing({
  domains,
  coverageByDomain,
  size = 236,
}: {
  domains: RingDomain[];
  coverageByDomain: Partial<Record<CoachingDomain, DomainCoverage>>;
  size?: number;
}) {
  const { ref, drawn, reducedMotion } = useChartRevealOnce();

  const byDomain = new Map(domains.map((d) => [d.domain, d]));
  const ordered = COACHING_DOMAINS.map((info) => byDomain.get(info.domain)).filter(
    (d): d is RingDomain => Boolean(d)
  );

  const stroke = size * 0.062;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference / ordered.length;
  const gap = segmentLength * 0.16;
  const fullSegment = segmentLength - gap;

  function scrollToDomain(domain: string) {
    document
      .getElementById(domainAnchorId(domain))
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  const revealed = drawn || reducedMotion;

  return (
    <div ref={ref} className="relative mx-auto w-full" style={{ maxWidth: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full -rotate-90"
        role="img"
        aria-label="Your Root Map — twelve dimensions, filling in as you record more data. Tap a segment to jump to that dimension."
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={TRACK} strokeWidth={stroke} />
        {ordered.map((domain, index) => {
          const targetOffset = -(index * segmentLength);
          const hiddenOffset = circumference + targetOffset;
          const fraction = fillFractionFor(domain, coverageByDomain[domain.domain]);
          const arcLength = fullSegment * fraction;

          return (
            <g key={domain.domain}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="transparent"
                strokeWidth={stroke}
                strokeDasharray={`${fullSegment} ${circumference - fullSegment}`}
                strokeDashoffset={targetOffset}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Jump to ${domain.label}`}
                onClick={() => scrollToDomain(domain.domain)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    scrollToDomain(domain.domain);
                  }
                }}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colorFor(domain)}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                strokeDashoffset={revealed ? targetOffset : hiddenOffset}
                className="pointer-events-none transition-[stroke-dashoffset] duration-[1000ms] ease-out motion-reduce:transition-none"
                style={{ transitionDelay: `${index * 55}ms` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
