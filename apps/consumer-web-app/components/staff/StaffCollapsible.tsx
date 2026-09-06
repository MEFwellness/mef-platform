'use client';

/**
 * One titled, folded group on a coach or admin screen.
 *
 * THE SAME FOLD THE CLIENT DETAIL PAGE ALREADY SHIPPED, made available to
 * the rest of the staff side. `app/coach/clients/[id]/detail/DetailSection.tsx`
 * proved the pattern and keeps its own copy, because it carries two things
 * only that page has: a section digest computed from the page's own data,
 * and a subscription to the detail page's deep-link bus. Nothing else on
 * the staff side has either, and importing that component would have meant
 * inventing a fake digest and a bus channel nobody publishes to.
 *
 * So this is the same visual language with the couplings removed: the same
 * card, the same 72px header tap target, the same chevron rotation, the
 * same forest-on-white type. The two read as one design, which is the
 * point, and neither has to carry the other's dependencies.
 *
 * IT RENDERS NO CHILDREN WHILE FOLDED, for the reason DetailSection
 * documents: keeping them mounted behind a height animation fixes the
 * scrolling and keeps the DOM, and on the two screens this is aimed at
 * (88 check-in questions, and every answer a member ever entered) the DOM
 * is the weight. The data is already in the payload either way, so this is
 * a rendering decision and never a fetching one.
 *
 * `defaultOpen` exists for the one honest exception: a group that is the
 * only thing on its screen, or a group a coach opens on every single
 * visit, is worse folded. It is off by default deliberately.
 */

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type StaffCollapsibleProps = {
  /** The group's name. */
  title: string;
  /**
   * One line of arithmetic over data the screen already has, so a folded
   * header still answers "is there anything in here". Never a promise:
   * if the count is zero the digest says so.
   */
  digest?: string | undefined;
  /** Starts open. Off by default: the whole point is that it is folded. */
  defaultOpen?: boolean | undefined;
  /** Optional anchor, so a link can address this group. */
  id?: string | undefined;
  children: ReactNode;
};

export function StaffCollapsible({
  title,
  digest,
  defaultOpen = false,
  id,
  children,
}: StaffCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const generatedId = useId();
  const contentId = `${id ?? generatedId}-content`;

  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-24 rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
        className="mef-focus-ring flex min-h-[72px] w-full items-center justify-between gap-3 rounded-[28px] px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-snug text-[#1B3A2D]">
            {title}
          </span>
          {digest ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-[#6B7A72]">{digest}</span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#6B7A72] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={contentId} className="space-y-5 border-t border-[#1B3A2D]/5 px-4 pb-5 pt-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
