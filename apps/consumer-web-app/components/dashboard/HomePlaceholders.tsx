/**
 * What sits in Home's regions while they are still resolving.
 *
 * ONE TREATMENT, NOT FIVE. Every placeholder here is the same quiet
 * brand-green wash that breathes rather than spins (`.mef-settling`,
 * app/globals.css, which carries its own prefers-reduced-motion override).
 * A screen that streams in four pieces must still read as one screen
 * settling, not as four separate things loading.
 *
 * THEY HOLD THE SHAPE THEY ARE STANDING IN FOR. The point of a placeholder
 * on this page is not decoration, it is that nothing moves when the real
 * thing lands: the priority placeholder is a card of the card's height, the
 * day-frame placeholder is two rows of the rows' height. `PriorityPlaceholder`
 * takes `expectCard` from lib/home/frame.ts, which reads today's stored
 * priority row, so a member who has already finished hers gets the small
 * pointer's shape reserved and not a card's.
 *
 * Every one is `aria-hidden` and marked `data-settling`, so a screen reader
 * is never read a row of empty boxes and a verification run can ask the DOM
 * whether the page has finished settling.
 */

function Bar({ className }: { className: string }) {
  return <div className={`mef-settling rounded-full ${className}`} />;
}

/** The dominant slot at the top of <main>. */
export function PriorityPlaceholder({ expectCard }: { expectCard: boolean }) {
  if (!expectCard) {
    // The pointer line she gets once today's priority is saved or done.
    return (
      <div data-settling="true" aria-hidden="true" className="pt-3">
        <Bar className="h-4 w-56" />
      </div>
    );
  }
  return (
    <div data-settling="true" aria-hidden="true" className="pt-3">
      <div className="mef-card">
        <Bar className="h-3 w-32" />
        <Bar className="mt-4 h-5 w-full" />
        <Bar className="mt-2 h-5 w-4/5" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-2/3" />
        <div className="mt-6 flex gap-3">
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}

/** Her program, the weekly review, the invites, and the first zone she taps. */
export function DayFramePlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true">
      <div className="mef-settling mt-6 h-44 rounded-[28px] md:mt-8" />
      <div className="mt-8 md:mt-10">
        <Bar className="h-3 w-28" />
        <div className="mt-3 flex gap-3">
          <div className="mef-settling h-16 flex-1 rounded-[24px]" />
          <div className="mef-settling h-16 flex-1 rounded-[24px]" />
        </div>
      </div>
    </div>
  );
}

/** Everything below the first screenful. Deliberately short: it is off screen when it is drawn, and a tall placeholder there only makes the scrollbar lie. */
export function StreamPlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true" className="mt-14 md:mt-20">
      <Bar className="h-3 w-40" />
      <div className="mef-settling mt-4 h-32 rounded-[28px]" />
    </div>
  );
}

/**
 * The whole of Home, before the first byte of it exists.
 *
 * Next wraps a route in Suspense the moment `loading.tsx` exists, so this
 * is what she sees between the tap and Home's first streamed response. It
 * used to be the generic `PageSkeleton`, which has no hero: a light page
 * with three cards, replaced a moment later by a 440px full-bleed dark
 * photo band, which is a whole screen of movement on the one screen this
 * build is about.
 *
 * So this is Home's own shape. The band is the hero's height in the brand's
 * deep green rather than the photo (which one is right depends on her
 * clock, and her clock is exactly what has not been read yet), and below it
 * are the same placeholders the regions use. The swap into the real Home is
 * then a photo arriving inside a box that is already the right size.
 */
export function HomeShellPlaceholder() {
  return (
    <div
      data-settling="true"
      aria-hidden="true"
      className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]"
    >
      <section className="relative flex min-h-[440px] w-full flex-col bg-[#0F241C] px-5 pb-10 pt-8 sm:px-6 md:min-h-[500px] md:px-10 md:pb-14 md:pl-28">
        <div className="flex items-center justify-between">
          <div className="mef-settling-on-photo h-12 w-44 rounded-2xl" />
          <div className="mef-settling-on-photo h-10 w-10 rounded-full" />
        </div>
        <div className="mt-auto pt-10">
          <div className="mef-settling-on-photo h-9 w-3/4 rounded-full" />
          <div className="mef-settling-on-photo mt-3 h-4 w-2/3 rounded-full" />
          <div className="mef-settling-on-photo mt-6 h-12 w-32 rounded-2xl" />
          <div className="mef-settling-on-photo mt-4 h-4 w-full max-w-md rounded-full" />
          <div className="mef-settling-on-photo mt-2 h-4 w-5/6 max-w-md rounded-full" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <div className="pt-3">
          <div className="mef-card">
            <Bar className="h-3 w-32" />
            <Bar className="mt-4 h-5 w-full" />
            <Bar className="mt-2 h-5 w-4/5" />
            <Bar className="mt-4 h-4 w-full" />
            <Bar className="mt-2 h-4 w-2/3" />
            <div className="mt-6 flex gap-3">
              <Bar className="h-9 w-24" />
              <Bar className="h-9 w-24" />
            </div>
          </div>
        </div>
        <div className="mef-settling mt-6 h-44 rounded-[28px] md:mt-8" />
      </main>
    </div>
  );
}

/** One tile of the "What Root Is Noticing" carousel, shaped like the real tile so the row does not jump once its own fetch resolves. */
export function NoticingTilePlaceholder() {
  return (
    <div
      data-settling="true"
      aria-hidden="true"
      className="mef-settling aspect-[3/4] w-[172px] shrink-0 rounded-[24px]"
    />
  );
}
