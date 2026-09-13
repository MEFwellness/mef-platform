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

/**
 * The day's chosen action, in the active/today half of <main>.
 *
 * Shaped to the ordinary card both Home and Today draw since the final
 * structural pass (2026-09-13): the label, a two-line priority sentence,
 * two lines of reason and a wrapping row of three pill buttons. The
 * offsets are the region's own (`mt-8` under a card that carries its own
 * `mt-6`, `mef-home-section` for the pointer line), so the block that
 * lands is the block that was reserved.
 */
export function PriorityPlaceholder({ expectCard }: { expectCard: boolean }) {
  if (!expectCard) {
    // The pointer line she gets once today's priority is saved or done.
    return (
      <div data-settling="true" aria-hidden="true" className="mef-home-section">
        <div className="mef-settling h-[92px] w-full rounded-[28px]" />
      </div>
    );
  }
  return (
    <div data-settling="true" aria-hidden="true" className="mt-8">
      <div className="mef-card mt-6 bg-white">
        <Bar className="h-4 w-28" />
        <Bar className="mt-4 h-6 w-full" />
        <Bar className="mt-2 h-6 w-2/3" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-1/2" />
        <div className="mt-5 flex flex-wrap gap-2">
          <Bar className="h-10 w-28" />
          <Bar className="h-10 w-28" />
          <Bar className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * QUICK ACTIONS, the compact row under the hero.
 *
 * It reserves the row's real geometry rather than a generic band: the
 * 11px section label, the 16px gap under it, and two whole tiles plus a
 * fifth of a third at the tile's own committed height. The fractional
 * third is the point — if the placeholder reserved two tiles and the real
 * row draws two and a slice, the row grows sideways under her thumb.
 *
 * The widths are the same `calc((100% - 1.5rem) / 2.2)` the real tile
 * carries (`.mef-home-quick-tile`, app/globals.css), written here as the
 * one place a settling block is allowed to restate a layout value,
 * because a placeholder that does not match is worse than none.
 */
export function QuickActionsPlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true" className="pt-6">
      <Bar className="h-3 w-28" />
      <div className="mt-4 flex gap-3 overflow-hidden">
        <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
        <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
        <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
      </div>
    </div>
  );
}

/**
 * What is assigned to her, her program, the weekly review, the invites and
 * the Today zone.
 *
 * Two blocks, in the order the region draws them since the editorial pass
 * (2026-09-13): an assigned card at its own medium height and 24px radius
 * first, the program's 32px feature card under it. Quick Actions left this
 * boundary for one of its own, so the label-plus-two-pills shape this used
 * to reserve went with it.
 */
export function DayFramePlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true">
      <div className="mef-home-section">
        <Bar className="h-3 w-32" />
        <div className="mef-settling mt-5 h-40 rounded-[24px]" />
      </div>
      <div className="mef-settling mef-home-section h-48 rounded-[32px]" />
    </div>
  );
}

/** Everything below the first screenful. Deliberately short: it is off screen when it is drawn, and a tall placeholder there only makes the scrollbar lie. */
export function StreamPlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true" className="mef-home-section">
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
      className="mef-home min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#F7F3EA] font-[family-name:var(--font-dm-sans)]"
    >
      {/* The same committed height the real hero now carries (HomeHero.tsx),
          so the route skeleton and the screen that replaces it are the same
          size and the swap moves nothing. */}
      <section className="relative flex min-h-[400px] w-full flex-col bg-[#0F241C] px-5 pb-8 pt-8 sm:px-6 md:px-10 md:pb-12 md:pl-28">
        <div className="flex items-center justify-between">
          <div className="mef-settling-on-photo h-12 w-44 rounded-2xl" />
          <div className="mef-settling-on-photo h-10 w-10 rounded-full" />
        </div>
        {/* The greeting, then the same blocks HomeHeroBodyPlaceholder
            reserves, at the same heights. */}
        <div className="mt-auto pt-6">
          <div className="mef-settling-on-photo h-10 w-3/4 rounded-full" />
          <div className="mt-2 flex items-start gap-5">
            <div className="mef-settling-on-photo mt-1 h-[22px] w-1/2 rounded-full" />
            <div className="mef-settling-on-photo ml-auto h-[64px] w-[64px] shrink-0 rounded-full" />
          </div>
          <div className="mef-settling-on-photo mt-3 h-[46px] w-full max-w-md rounded-2xl" />
          <div className="mef-settling-on-photo mt-3 h-9 w-56 rounded-full" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {/* Quick Actions leads <main>, so it leads the route skeleton too. */}
        <div className="pt-6">
          <Bar className="h-3 w-28" />
          <div className="mt-4 flex gap-3 overflow-hidden">
            <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
            <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
            <div className="mef-settling h-[124px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] rounded-[18px]" />
          </div>
        </div>
        <div className="mef-home-section">
          <Bar className="h-3 w-32" />
          <div className="mef-settling mt-5 h-40 rounded-[24px]" />
        </div>
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
      className="mef-settling aspect-[3/4] w-[196px] shrink-0 rounded-[28px]"
    />
  );
}
