/**
 * One sub-header inside Assessments and Findings, over the cards it names.
 *
 * WHY THE FINDINGS ARE GROUPED AT ALL. The section holds three different
 * kinds of thing, and they were one undifferentiated column: the durable
 * picture of who this client is, the short recurring pulses, and the long
 * narratives a finished deep-dive produces. A coach looking for one of the
 * three had to read past the other two. Naming them costs one line each
 * and makes the whole section scannable.
 *
 * A HEADING, NOT A SECOND FOLD. Everything inside is rendered. The fold on
 * this page belongs to the six sections, and a second layer of things to
 * open would put a coach back to tapping her way to a finding she can
 * currently see.
 *
 * It is a plain Server Component with no state, so it costs the page
 * nothing and adds no client bundle.
 */

import type { ReactNode } from 'react';

export function FindingsGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</h3>
        <span className="h-px flex-1 bg-[#1B3A2D]/10" aria-hidden="true" />
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
