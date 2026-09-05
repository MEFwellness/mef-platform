/**
 * Root Map — "take me to that area", in one place.
 *
 * FACTORED OUT OF RootMapRing.tsx, NOT REWRITTEN (2026-09-05). The ring's
 * twelve wedges and the numbered key that names them now live in two
 * different components, because the key moved inside the page's "See all
 * 12 areas" reveal while the ring stayed above it. Both still have to land
 * on exactly the same place with exactly the same alignment, and every
 * line below is the behaviour RootMapRing already shipped, moved rather
 * than re-derived. Its guard tests moved with it.
 *
 * The three things this has to keep getting right, each one a bug that was
 * found live before it was fixed:
 *
 *   block: 'start'  not 'center'. A domain whose card sits near the end of
 *                   the document cannot be centred, so the browser clamps
 *                   to max-scroll and lands on whatever card happens to be
 *                   nearest that clamped centre. Every anchor already
 *                   carries `scroll-mt-24` for start alignment.
 *   the four uninstrumented domains land on their shared section's own id,
 *                   not their own list item's, so that section's heading is
 *                   what arrives at the top of the viewport rather than
 *                   scrolling out of view above it. A highlight request
 *                   then names which of the four identical-looking items
 *                   the tap was actually about.
 *   the reveal is opened first (new, 2026-09-05). The twelve entries now
 *                   sit inside a closed `<details>`, and `scrollIntoView`
 *                   on an element inside a closed one does nothing at all,
 *                   silently. Opening it and waiting one frame for layout
 *                   is what makes a tap on the ring still work.
 */

import { domainAnchorId, NOT_COVERED_SECTION_ANCHOR_ID, ALL_AREAS_SECTION_ID } from '@/lib/root-map/anchors';
import { requestRootMapHighlight } from '@/lib/root-map/highlightBus';

export type ScrollableDomain = {
  domain: string;
  isUninstrumented: boolean;
};

export function scrollToRootMapDomain(domain: ScrollableDomain, reducedMotion: boolean): void {
  const targetId = domain.isUninstrumented
    ? NOT_COVERED_SECTION_ANCHOR_ID
    : domainAnchorId(domain.domain);

  // The entries live inside a reveal that is closed by default. A closed
  // <details> is display:none inside, and scrolling to something that is
  // not laid out is a no-op with no error, so this is opened first.
  const reveal = document.getElementById(ALL_AREAS_SECTION_ID);
  const needsOpen = reveal instanceof HTMLDetailsElement && !reveal.open;
  if (reveal instanceof HTMLDetailsElement) reveal.open = true;

  const go = () => {
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (domain.isUninstrumented) requestRootMapHighlight(domain.domain);
  };

  // One frame, and only when something actually had to open: the newly
  // revealed content has to be laid out before its position means anything.
  if (needsOpen) requestAnimationFrame(go);
  else go();
}
