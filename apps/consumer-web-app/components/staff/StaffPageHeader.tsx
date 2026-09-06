/**
 * The header every coach and admin screen wears.
 *
 * WHY IT EXISTS. A survey of the fifty staff pages found three different
 * headers doing one job. Twenty pages used `components/BackButton.tsx`
 * with an eyebrow and a serif title; seventeen hand-rolled their own
 * `<Link href="/coach"><ChevronLeft />Back to dashboard</Link>` with no
 * eyebrow; and twelve, the whole admin analytics subtree among them, had
 * no back control at all, so the only way out of a drill-down was the
 * browser's own button or a nav tab that threw the context away.
 *
 * Deciding a header per page meant it was only ever as consistent as the
 * last person who copied a neighbour, and the three variants are why the
 * staff side reads as three eras of the build rather than one product.
 * This is that decision made once.
 *
 * IT IS THE PATTERN THE GOOD PAGES ALREADY USED. Nothing here is new
 * design: the geometry, the type scale and the spacing are lifted from
 * /coach/assign, /coach/programs, /coach/generate, /coach/questions and
 * /coach/corrective-programs, which already agreed with each other. The
 * pages that disagreed are the ones that moved.
 *
 * THE SUBTITLE COLOUR IS #4F645A, NOT #6B7A72, and that is deliberate.
 * `tests/subhead-contrast-ratio.test.ts` owns this decision: at 15px on
 * these backgrounds the lighter grey does not carry enough contrast, so
 * every subhead in this exact style across the app was darkened once. A
 * shared header that reintroduced the old value would have undone that
 * fix on every staff screen at once, which is exactly what the guard
 * caught when this component was first written.
 *
 * NOT A GUARD, and not navigation. middleware.ts decides who reaches a
 * staff route and app/coach/layout.tsx draws the nav bar. This draws the
 * top of the page and nothing else.
 */

import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

export type StaffPageHeaderProps = {
  /**
   * Where "back" goes when there is no in-app history to return to.
   * Omitted only by the two section homes (/coach and /admin), which are
   * themselves the place back would lead.
   */
  backHref?: Route | undefined;
  /** The destination's name, read aloud by the control: "Coach Dashboard". */
  backLabel?: string | undefined;
  /**
   * Always go to `backHref` rather than to wherever the browser came from.
   * For a screen inside a section that has its own tabs: the admin
   * analytics views move between themselves constantly, so a smart back
   * from Drop-off would land on Funnel, which is sideways, not out.
   */
  forceBack?: boolean | undefined;
  /**
   * The small uppercase line above the title, naming the section this
   * screen belongs to. Optional, because a section home has no parent to
   * name.
   */
  eyebrow?: string | undefined;
  /** The eyebrow's icon, drawn at the same weight every staff screen uses. */
  eyebrowIcon?: LucideIcon | undefined;
  /** The screen's own name, in the display serif. */
  title: string;
  /** One sentence saying what the screen is for. */
  subtitle?: string | undefined;
  /**
   * Anything that belongs beside the title rather than below it: a count,
   * a state chip, a single control. Kept to the right on a wide screen and
   * wrapped underneath on a phone.
   */
  aside?: React.ReactNode | undefined;
};

export function StaffPageHeader({
  backHref,
  backLabel,
  forceBack = false,
  eyebrow,
  eyebrowIcon: Icon,
  title,
  subtitle,
  aside,
}: StaffPageHeaderProps) {
  return (
    <header>
      {backHref && backLabel ? (
        <BackButton fallbackHref={backHref} label={backLabel} forceFallback={forceBack} />
      ) : null}

      {eyebrow ? (
        <div className={`flex items-center gap-2 text-[#6B7A72] ${backHref ? 'mt-4' : ''}`}>
          {Icon ? <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : null}
          <p className="text-sm font-semibold uppercase tracking-wider">{eyebrow}</p>
        </div>
      ) : null}

      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 ${
          eyebrow ? 'mt-2' : backHref ? 'mt-4' : ''
        }`}
      >
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {title}
        </h1>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>

      {subtitle ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#4F645A]">{subtitle}</p>
      ) : null}
    </header>
  );
}
