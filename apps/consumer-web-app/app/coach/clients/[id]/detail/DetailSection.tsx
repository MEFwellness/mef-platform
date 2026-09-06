'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SectionDigest, SectionDot } from '@/lib/coach-detail/digests';
import { useDetailSectionRequests } from '@/lib/coach-detail/detailBus';

/**
 * One titled, folded group on the client detail page.
 *
 * COLLAPSED BY DEFAULT, AND ITS CONTENTS ARE NOT RENDERED WHILE IT IS.
 * Roughly thirty panels used to be laid out at once, which is what made
 * this page two minutes of scrolling in the first place. Keeping them all
 * mounted behind a height animation would have kept the DOM and left only
 * the scrolling fixed, so a folded section renders nothing at all and the
 * page opens on one screen of headers. The children are already in the
 * payload either way, so nothing is fetched twice and nothing is fetched
 * late: this is a rendering decision, not a loading one.
 *
 * WHAT A HEADER SAYS. Its title, one line of arithmetic over data the page
 * already had, and one dot. The dot is gold only when something inside is
 * asking for something. See lib/coach-detail/digests.ts for why it is
 * never an evidence tier.
 *
 * IT ALSO ANSWERS THE TWO DEEP LINKS. The coach brief still links to
 * `#member-visibility` and the entries page still links to `#case-view`,
 * and both of those anchors now start inside a folded section. The page
 * shell resolves the hash to a section and asks that section to open
 * itself, which is the request this component listens for.
 */

const DOT_CLASS: Record<SectionDot, string> = {
  // Forest for settled, brand gold for worth a look, and a recessive
  // stone for a section that is empty or holds switches.
  green: 'bg-[#1B3A2D]',
  gold: 'bg-[#F5B700]',
  grey: 'bg-[#C7CFC9]',
};

const DOT_LABEL: Record<SectionDot, string> = {
  green: 'Nothing here needs attention',
  gold: 'Something here is worth a look',
  grey: 'Nothing recorded here',
};

export function DetailSection({
  id,
  title,
  digest,
  children,
}: {
  id: string;
  title: string;
  digest: SectionDigest;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const headerRef = useRef<HTMLButtonElement | null>(null);

  useDetailSectionRequests(id, (anchorId) => {
    setOpen(true);
    setPendingAnchor(anchorId);
  });

  // The scroll happens AFTER the contents exist. A folded section renders
  // nothing, and scrollIntoView on an element that is not in the document
  // is a silent no-op, so asking for the scroll in the same tick as the
  // open would land nowhere and say nothing about it. One frame after the
  // children have mounted, their position is real.
  useEffect(() => {
    if (!open || pendingAnchor === null) return;
    const anchor = pendingAnchor;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(anchor) ?? headerRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, pendingAnchor]);

  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-24 rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
    >
      <button
        ref={headerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        /* min-h-[72px] and the generous padding are the tap target: this
           page is read on a phone, and a header is the only control on it
           a coach presses on every visit. */
        className="mef-focus-ring flex w-full min-h-[72px] items-center justify-between gap-3 rounded-[28px] px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[digest.dot]}`}
            role="img"
            aria-label={DOT_LABEL[digest.dot]}
          />
          <span className="min-w-0">
            {/* DM Sans, not the serif. The serif on this page belongs to
                the client's name and to nothing else, and a section
                heading is a level of the same document as the card
                headings under it rather than a second title for the
                page. It is larger, sentence case and forest, so it reads
                above the small uppercase gold card headings without
                borrowing a typeface it has no claim to. */}
            <span className="block text-[17px] font-semibold leading-snug text-[#1B3A2D]">
              {title}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[#6B7A72]">
              {digest.text}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#6B7A72] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={`${id}-content`} className="space-y-5 border-t border-[#1B3A2D]/5 px-4 pb-5 pt-5">
          {children}
        </div>
      )}
    </section>
  );
}
