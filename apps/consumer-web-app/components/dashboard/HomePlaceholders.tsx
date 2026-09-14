/**
 * What sits in Home's regions while they are still resolving.
 *
 * ONE TREATMENT, NOT FIVE. Every placeholder here is the same quiet
 * brand-green wash that breathes rather than spins (`.mef-settling`,
 * app/globals.css, which carries its own prefers-reduced-motion override).
 * A screen that streams in four pieces must still read as one screen
 * settling, not as four separate things loading. Nothing shimmers, nothing
 * sweeps and nothing spins: the only movement is opacity, between 0.6 and
 * 0.85, and reduced motion removes even that.
 *
 * THEY HOLD THE SHAPE THEY ARE STANDING IN FOR. The point of a placeholder
 * on this page is not decoration, it is that nothing moves when the real
 * thing lands: the priority placeholder is a card of the card's height, the
 * day-frame placeholder is the section's own heading and card at the
 * heights they were measured at on production, and a quick-action tile
 * placeholder is a TILE, with the tile's padding, the tile's icon chip and
 * the tile's two lines of text, rather than a rectangle of the tile's size.
 * `PriorityPlaceholder` takes `expectCard` from lib/home/frame.ts, which
 * reads today's stored priority row, so a member who has already finished
 * hers gets the small pointer's shape reserved and not a card's.
 *
 * THE ROUTE SKELETON IS ASSEMBLED FROM THE SAME PARTS (2026-09-13).
 * `HomeShellPlaceholder` used to restate the Quick Actions row and the
 * assigned block in its own markup, which is two copies of one layout and
 * therefore two chances to disagree: the route skeleton would reserve one
 * thing and the shell that replaced it a moment later would reserve
 * another, and the page moved between them. It now composes the very
 * components the regions use, so the swap from the route skeleton into the
 * streaming shell is by construction a no-op on layout.
 *
 * Every one is `aria-hidden` and marked `data-settling`, so a screen reader
 * is never read a row of empty boxes and a verification run can ask the DOM
 * whether the page has finished settling.
 */

import { HomeHeroBodyPlaceholder } from './HomeHero';

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
 * ONE QUICK ACTION TILE, AS A TILE (2026-09-13).
 *
 * It was a flat rectangle of the tile's height, which reserved the right
 * space and told her nothing: a row of three grey slabs where a row of
 * five coloured doors was about to be. This is the tile's own anatomy at
 * the tile's own measurements, on the palette's quietest cream surface
 * (`.mef-settling-surface`) rather than in the bar wash, so the row reads
 * as tiles arriving rather than as holes being filled:
 *
 *   the 14px padding the tile carries (`padding: 0.875rem`)
 *   the 36px icon chip at 12px radius, top left, where the icon lands
 *   the label, pushed to the foot of the tile the way `margin-top: auto`
 *   pushes the real one
 *   the one short status line under it
 *
 * THE HEIGHT IS THE ROW'S MEASURED HEIGHT, NOT THE TILE'S FLOOR.
 * `.mef-home-quick-tile` sets a 124px min-height, and the rendered row is
 * 126px at every phone width, because the longest label in it ("Your Week
 * with Root") wraps to two lines and carries the tile past its own floor.
 * Reserving the floor made the whole page drop six pixels the moment the
 * row resolved (four of them the row's own `padding-bottom`, two the
 * tile): measured on production, that one swap was 0.019 of Home's 0.030
 * layout shift, the largest single movement on the screen. So the number
 * here is the measured one and the floor is what it is checked against.
 *
 * The widths are the same `calc((100% - 1.5rem) / 2.2)` fraction the real
 * tile carries, which is what keeps the fifth-of-a-third peek.
 */
function QuickTilePlaceholder() {
  return (
    <div className="mef-settling-surface flex h-[126px] shrink-0 basis-[calc((100%-1.5rem)/2.2)] flex-col rounded-[18px] p-[0.875rem]">
      {/* The icon chip. */}
      <div className="mef-settling h-9 w-9 rounded-[12px]" />
      {/* The label sits at the foot of the tile, exactly as the real one does. */}
      <Bar className="mt-auto h-4 w-3/4" />
      {/* And its one status line under it. */}
      <Bar className="mt-[3px] h-3 w-1/2" />
    </div>
  );
}

/**
 * QUICK ACTIONS, the compact row under the hero and the first thing in
 * <main>.
 *
 * It reserves the row's real geometry rather than a generic band: the
 * 11px section label, the 16px gap under it, and two whole tiles plus a
 * fifth of a third at the tile's own committed height. The fractional
 * third is the point — if the placeholder reserved two tiles and the real
 * row draws two and a slice, the row grows sideways under her thumb.
 */
export function QuickActionsPlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true" className="pt-6">
      <Bar className="h-3 w-28" />
      {/* `pb-1` is `.mef-home-quick-row`'s own padding-bottom, which is
          part of the band's height whether or not anything is scrolling
          in it yet. */}
      <div className="mt-4 flex gap-3 overflow-hidden pb-1">
        <QuickTilePlaceholder />
        <QuickTilePlaceholder />
        <QuickTilePlaceholder />
      </div>
    </div>
  );
}

/**
 * ASSIGNED TO YOU and her program: the two blocks the day frame opens
 * with, in the order it draws them since the editorial pass (2026-09-13).
 *
 * MEASURED, NOT ESTIMATED (2026-09-13). Both heights were read off the
 * real rendered page at 390px rather than guessed: an assigned card is
 * 213px there, and it used to be reserved at 160, so the page dropped
 * fifty pixels the moment a coach's request landed. The card's inner
 * shape is reserved too (eyebrow, two-line title, a line of body, a
 * button), which is what makes the swap a change of colour rather than a
 * change of size.
 *
 * THE PROGRAM CARD STAYS DELIBERATELY SHORT. It is the one block on this
 * page whose real height genuinely varies (a member with no program has
 * none at all), and over-reserving a block that may not render is a
 * bigger jump than under-reserving one that does.
 */
export function DayFramePlaceholder() {
  return (
    <div data-settling="true" aria-hidden="true">
      <div className="mef-home-section">
        <Bar className="h-3 w-32" />
        <div className="mef-settling-surface mt-4 h-[212px] rounded-[24px] p-[1.375rem]">
          <Bar className="h-3 w-24" />
          <Bar className="mt-4 h-5 w-full" />
          <Bar className="mt-2 h-5 w-2/3" />
          <Bar className="mt-4 h-3 w-full" />
          <Bar className="mt-2 h-3 w-4/5" />
          <Bar className="mt-5 h-9 w-36" />
        </div>
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
 * are THE SAME placeholder components the regions themselves use, in the
 * same order, so the moment the real shell arrives with its own
 * placeholders in place, not one pixel of the page moves.
 *
 * The one thing it cannot know is whether the day's chosen action is still
 * outstanding, which is what decides between a card and a one-line pointer
 * (`expectPriorityCard`, lib/home/frame.ts, read from today's stored row).
 * The card is reserved, because that is the state a member who is arriving
 * at Home is overwhelmingly in, and the slot sits below the program card,
 * well past the first screenful either way.
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
        {/* The greeting, and then the hero body's OWN placeholder rather
            than a second copy of its measurements. `mt-auto pt-6` is the
            real block's own wrapper, so the greeting sits where the
            greeting sits. `hasCheckins` is the one thing this cannot know
            (it needs her row count) and the tall state is what a member
            arriving at Home is overwhelmingly in. */}
        <div className="mt-auto pt-6">
          <div className="mef-settling-on-photo h-10 w-3/4 rounded-full" />
          <HomeHeroBodyPlaceholder hasCheckins />
        </div>
      </section>

      <main className="mx-auto w-full max-w-md px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {/* The four regions of <main>, in the markup order the page itself
            draws them (tests/home-streaming-structure.test.ts holds that
            order), each standing in for itself. */}
        <QuickActionsPlaceholder />
        <DayFramePlaceholder />
        <PriorityPlaceholder expectCard />
        <StreamPlaceholder />
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
