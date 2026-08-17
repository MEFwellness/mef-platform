'use client';

/**
 * Root Map — the actual map (Root Map redesign, 2026-07-28, Part 5). A
 * twelve-segment ring, one segment per Coaching Domain, in the same
 * canonical order COACHING_DOMAINS itself defines — not the
 * priority-sorted order the cards below use, so the map itself stays a
 * stable layout rather than reshuffling as findings come in.
 *
 * Reveal mechanism is reused, not reinvented: `useChartRevealOnce()` is
 * the same scroll-triggered, one-shot hook the Home/Progress trend charts
 * already use, driving a `stroke-dashoffset` transition — the exact
 * technique FourDoctorsWheel.tsx already uses for its own ring, just with
 * each segment's arc length carrying real meaning (fill fraction) instead
 * of all four being equal.
 *
 * What a segment's fill actually encodes (confirmed by reading
 * `fillFractionFor`/`colorFor` below before touching any of this): gold =
 * this domain already has a real earned finding; deep green, filled
 * proportionally to `coverage.count / coverage.windowDays` = how many of
 * the last `windowDays` were logged. A domain with very little coverage
 * renders as a very short arc — with `strokeLinecap="round"` that's
 * visually just a small rounded dot, not a second kind of marker; "dots"
 * and "segments" are the same encoding at different magnitudes, not two
 * different data dimensions.
 *
 * Two on-map identification bugs fixed here (confirmed live first, not
 * assumed — see docs/BUILD_STATUS.md):
 *
 * 1. Nothing on the ring said which segment was which. Fixed with a small
 *    upright number (1-12) just outside each segment, in the same
 *    canonical order as the ordered legend list rendered directly below
 *    the ring (same tap behavior, same domain order) — the numbers are
 *    the shared key between the two.
 *
 * 2. Tapping a segment on a real phone landed at the bottom of the page,
 *    not the segment's own section — NOT a missing/mismatched anchor id
 *    (all twelve ids were confirmed present, unique, and correctly
 *    matched between here and the three card components). The real
 *    cause: each segment's only hit target was a `fill="none"` circle
 *    with a real but thin stroke (~14.6 of 236 SVG units, roughly a
 *    19px band on a real phone) — `fill="none"` means only that thin
 *    stroke band is hit-testable at all; anything inside or outside it
 *    (most of a real fingertip's contact area, especially near the
 *    segment's own gap) hits nothing, so the tap fell through to the
 *    page's native touch-scroll instead of the segment's onClick — on a
 *    page this tall, a real finger's incidental drag during a near-miss
 *    tap can carry the viewport a long way, reading as "jumps to the
 *    bottom." Fixed by replacing the thin stroke hit target with a real
 *    filled pie-wedge `<path>` per segment, spanning its whole angular
 *    slot from the ring's center out past its outer edge — the entire
 *    wedge is hit-testable, not just a thin ring band.
 *
 * The rotation that used to live as a CSS `-rotate-90` class on the whole
 * `<svg>` now lives as a `rotate(-90 cx cy)` SVG transform on a `<g>`
 * wrapping only the ring circles/wedges — the number labels are siblings
 * of that `<g>`, never rotated, computed directly in the same "12
 * o'clock, clockwise" frame instead of needing a second counter-rotation
 * to stay upright.
 *
 * Three more bugs found and fixed here, all confirmed live before
 * changing anything (real Chromium + Playwright's `webkit` engine, the
 * actual Safari rendering engine, not just headless Chromium):
 *
 * 3. Tapping a segment focused it and drew the browser's own default
 *    focus ring — an axis-aligned blue rectangle boxing the whole wedge,
 *    since SVG focus outlines are always axis-aligned regardless of the
 *    element's real shape. Fixed the same way every other focusable
 *    control in this app already handles it (see the legend buttons just
 *    below): suppress the plain `:focus` outline, restore a gold
 *    `:focus-visible` one sized to the app's own accent color — visible
 *    for keyboard users, gone for a mouse/touch tap.
 *
 * 4. `scrollToDomain` used `block: 'center'`. For a domain whose card
 *    sits near the very end of the page (confirmed live: the four
 *    `isUninstrumented` domains render as small inline list items in the
 *    very last section, `RootMapNotCoveredSection.tsx`), the browser
 *    cannot scroll far enough to center something that close to the
 *    document's own end — it clamps to max-scroll instead, which lands
 *    on whatever real card happens to be nearest the viewport's center at
 *    that clamped position, not the tapped domain. Reproduced live for
 *    all twelve segments individually (fresh page load per tap, no
 *    cross-tap interference): the four uninstrumented domains and two
 *    domains near them all landed on the wrong card. `block: 'start'`
 *    doesn't have this failure mode — it only needs the target's own top
 *    edge at the viewport's top, which is achievable even for the very
 *    last element on the page. Every anchor already carries `scroll-mt-24`
 *    (`RootMapFindingCard.tsx`/`RootMapBuildingRow.tsx`/
 *    `RootMapNotCoveredSection.tsx`) for exactly this alignment — that
 *    class only meaningfully does anything for `start`/`nearest`
 *    alignment, a leftover clue that `start` was the original intent.
 *
 *    Follow-up (2026-07-29): "lands correctly" for the four
 *    `isUninstrumented` domains meant landing on their own list item's id
 *    — which sits BELOW the "Not Covered Yet" heading inside
 *    `RootMapNotCoveredSection.tsx`, since `block: 'start'` pins that
 *    item's own top edge to the viewport top, scrolling the block's
 *    heading itself out of view above it. Tapping segment 1, 2, 11, or 12
 *    now scrolls to the section's own id (`NOT_COVERED_SECTION_ANCHOR_ID`)
 *    instead of the individual item's id, so the heading is what lands at
 *    the top of the viewport, and separately fires a highlight request
 *    (`./highlightBus.ts`) naming which of the four was actually tapped,
 *    since four identical-looking list items with no marker gave no
 *    indication which one the tap was even about.
 *
 * 5. Only 4 of 12 numbers rendered on a real iPhone (Safari/WebKit),
 *    though all 12 were always present in Chromium. Root cause: text
 *    vertical-centering via `dominantBaseline="middle"` is inconsistently
 *    supported in WebKit; the actual rendered position it produces can
 *    land a label's bounding box outside the SVG's own clipping bounds
 *    when the label sits close to the viewBox edge (the four numbers at
 *    the ring's cardinal-adjacent positions, closest to the box's own
 *    edges, were exactly the ones that survived — the ones near a
 *    corner, the position with the most real clearance). Confirmed
 *    directly with Playwright's `webkit` engine: 8 of 12 labels measured
 *    `insideSvgBounds: false`. Fixed with the standard, WebKit-safe
 *    technique — a numeric `dy` offset instead of `dominantBaseline` —
 *    plus a small viewBox margin so every label has real clearance
 *    regardless of a browser's own baseline math.
 *
 * 6. Nothing on the page said what gold vs. green actually meant (2026-07-29
 *    follow-up). Added a two-line key directly below the ring, above the
 *    numbered legend, naming both states in plain language. Written to
 *    match what the ring actually encodes (confirmed by re-reading
 *    `colorFor`/`fillFractionFor` above, not assumed): gold means this
 *    domain already has a real earned finding; green means it doesn't yet
 *    — which covers both an instrumented domain still building coverage
 *    and the four domains with no tracker at all, not "tracked vs.
 *    untracked" on its own (an instrumented domain with no finding yet is
 *    green too, same as an uninstrumented one).
 */

import { useChartRevealOnce } from '@/components/useChartRevealOnce';
import { COACHING_DOMAINS, type CoachingDomain } from '@/lib/investigation-engine/domains';
import type { DomainCoverage } from '@/lib/root-map';
import { domainAnchorId, NOT_COVERED_SECTION_ANCHOR_ID } from '@/lib/root-map/anchors';
import { requestRootMapHighlight } from '@/lib/root-map/highlightBus';

const DEEP_GREEN = '#1B3A2D';
const GOLD = '#F5B700';
const TRACK = 'rgba(27,58,45,0.08)';
const VIEWBOX_MARGIN = 16;

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
  isUninstrumented: boolean;
};

export function fillFractionFor(domain: RingDomain, coverage: DomainCoverage | undefined): number {
  if (domain.whatWeUnderstand.length > 0) return 1;
  if (!coverage || coverage.windowDays === 0) return 0;
  return Math.max(0, Math.min(1, coverage.count / coverage.windowDays));
}

export function colorFor(domain: RingDomain): string {
  return domain.whatWeUnderstand.length > 0 ? GOLD : DEEP_GREEN;
}

/** Point on a circle of radius r centered at (cx,cy), 0deg = 12 o'clock, increasing clockwise. */
export function pointOnCircle(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** A filled pie-wedge path from the ring's center out to `outerRadius`, spanning [startDeg, endDeg). Always a minor arc (each of 12 equal slots is 30deg). */
export function wedgePath(
  cx: number,
  cy: number,
  outerRadius: number,
  startDeg: number,
  endDeg: number
): string {
  const start = pointOnCircle(cx, cy, outerRadius, startDeg);
  const end = pointOnCircle(cx, cy, outerRadius, endDeg);
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 0 1 ${end.x} ${end.y} Z`;
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

  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.062;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const slotDeg = 360 / ordered.length;
  const segmentLength = circumference / ordered.length;
  const gap = segmentLength * 0.16;
  const fullSegment = segmentLength - gap;
  const labelRadius = radius + stroke / 2 + size * 0.05;
  const wedgeOuterRadius = radius + stroke / 2 + 4;

  function scrollToDomain(domain: RingDomain) {
    const targetId = domain.isUninstrumented
      ? NOT_COVERED_SECTION_ANCHOR_ID
      : domainAnchorId(domain.domain);
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (domain.isUninstrumented) requestRootMapHighlight(domain.domain);
  }

  const revealed = drawn || reducedMotion;

  return (
    <div ref={ref} className="mx-auto w-full" style={{ maxWidth: size }}>
      <div className="relative mx-auto" style={{ maxWidth: size }}>
        <svg
          viewBox={`${-VIEWBOX_MARGIN} ${-VIEWBOX_MARGIN} ${size + 2 * VIEWBOX_MARGIN} ${size + 2 * VIEWBOX_MARGIN}`}
          className="h-auto w-full"
          role="img"
          aria-label="Your Root Map: twelve dimensions, filling in as you record more data. Tap a segment, or its name in the key below, to jump to that dimension."
        >
          {/* The visual arcs use the classic stroke-dashoffset technique,
              which relies on a plain SVG <circle>'s own default path start
              (3 o'clock) — this <g>'s rotate(-90) is what turns that into a
              12-o'clock start, exactly as before. The wedge hit-targets
              below are NOT in here: wedgePath()/pointOnCircle() already
              compute final, already-oriented (12 o'clock, clockwise)
              coordinates directly, the same way the text labels do — nesting
              them inside this rotated <g> as well would rotate them a
              second time, landing each wedge three segments away from its
              own visual arc and label (caught live before shipping: every
              tap resolved to the segment sitting 90 degrees off). */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke={TRACK} strokeWidth={stroke} />
            {ordered.map((domain, index) => {
              const targetOffset = -(index * segmentLength);
              const hiddenOffset = circumference + targetOffset;
              const fraction = fillFractionFor(domain, coverageByDomain[domain.domain]);
              const arcLength = fullSegment * fraction;

              return (
                <circle
                  key={domain.domain}
                  cx={cx}
                  cy={cy}
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
              );
            })}
          </g>

          {ordered.map((domain, index) => (
            <path
              key={domain.domain}
              d={wedgePath(cx, cy, wedgeOuterRadius, index * slotDeg, (index + 1) * slotDeg)}
              fill="transparent"
              // Not `outline-none` (unconditional): Tailwind v4's outline
              // utilities are backed by a `--tw-outline-style` custom
              // property, which is inherited/persisted per-element
              // regardless of pseudo-class — an unconditional `outline-none`
              // pins that variable to `none` permanently on this element,
              // so `focus-visible:outline` (which only *reads* the variable)
              // stayed `none` even while truly focus-visible. Confirmed live
              // via the compiled CSS and a real keyboard Tab before landing
              // on this fix. Scoping the suppression to `:not(:focus-visible)`
              // leaves the variable at its real default (`solid`) exactly
              // when `:focus-visible` is what's actually active.
              className="cursor-pointer [&:not(:focus-visible)]:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
              role="button"
              tabIndex={0}
              aria-label={`Jump to ${domain.label}`}
              onClick={() => scrollToDomain(domain)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToDomain(domain);
                }
              }}
            />
          ))}

          {ordered.map((domain, index) => {
            const mid = pointOnCircle(cx, cy, labelRadius, index * slotDeg + slotDeg / 2);
            return (
              <text
                key={domain.domain}
                x={mid.x}
                y={mid.y}
                dy="0.35em"
                textAnchor="middle"
                fontSize={size * 0.042}
                fontWeight={600}
                fill="#6B7A72"
                className="pointer-events-none select-none"
                aria-hidden="true"
              >
                {index + 1}
              </text>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] leading-snug text-[#6B7A72]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: GOLD }} />
          Gold: we&apos;ve noticed something here
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: DEEP_GREEN }}
          />
          Green: still gathering information
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {ordered.map((domain, index) => (
          <li key={domain.domain}>
            <button
              type="button"
              onClick={() => scrollToDomain(domain)}
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
    </div>
  );
}
