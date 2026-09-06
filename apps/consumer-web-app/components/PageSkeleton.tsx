import { BottomNav } from '@/components/BottomNav';

const CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

/**
 * Premium UX Milestone 1, navigation performance: every primary route used
 * to have no loading.tsx at all, so Next.js kept the *previous* screen
 * frozen on screen for the full length of the destination page's server
 * data fetch (several sequential/parallel Supabase reads — see each
 * page's own Promise.all) before painting anything. A tap felt like it
 * hadn't registered. This renders instantly on navigation (Next wraps the
 * route in Suspense the moment loading.tsx exists) so every tap gets
 * immediate visual feedback, while the real page's data resolves behind
 * it. It intentionally mirrors each page's actual shape (header bar, a
 * few stacked cards, the same bottom nav so it doesn't flash) rather than
 * a generic spinner, so the transition reads as "the page is arriving,"
 * not "something broke."
 *
 * Root Presence System (Prompt 4), requirement 3: an optional `message`
 * replaces the shimmer's own silence with a short, Root-voiced purpose
 * line ("Getting your results ready...") on the Moment-classified routes
 * that use this skeleton — never a new wait, just words describing the
 * fetch that was already happening. Omitted entirely by default so every
 * Tool route's skeleton stays exactly as it was.
 */
export function PageSkeleton({ message }: { message?: string } = {}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-40 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
        </div>
        <div className="mt-3 h-9 w-2/3 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
        {message && <p className="mt-3 text-sm text-[#6B7A72]">{message}</p>}

        <div className="mt-7 space-y-5">
          <div className={`${CARD} h-32`} />
          <div className={`${CARD} h-44`} />
          <div className={`${CARD} h-24`} />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

/**
 * THE SHAPE OF EVERY SCREEN A MEMBER REACHES THROUGH A BACK BUTTON.
 *
 * PageSkeleton above stands in for the tabbed screens, whose header is an
 * eyebrow line and her avatar. Roughly thirty other member screens are not
 * shaped like that at all: Programs, the Conversation, each deep-dive
 * Experience, the trial screens, the Weekly Reflection, Notifications and
 * the rest all open with a Back button, then a small label, then a large
 * serif heading, then a subtitle, then their cards. Standing in for those
 * with the tabbed shape would move the whole page down by a row the moment
 * the real screen arrived, which is the opposite of what a placeholder is
 * for.
 *
 * MANY OF THEM HAD NO PLACEHOLDER AT ALL (performance and stability audit,
 * 2026-09-06). Without a `loading.tsx`, Next keeps the PREVIOUS screen
 * frozen on the display for the whole of the destination's server render,
 * which on production was two seconds on Programs and about one and a half
 * on the Conversation. A tap read as though it had not registered.
 *
 * The measurements are the same treatment Home's own placeholders use
 * (`.mef-settling`, app/globals.css), which breathes rather than spins and
 * carries its own reduced-motion override, and each one is marked
 * `data-settling` and `aria-hidden` so a screen reader is never read a row
 * of empty boxes and a verification run can ask the DOM whether the screen
 * has finished settling.
 *
 * `cards` is how many card-shaped blocks to reserve. Give it the number the
 * real screen opens with, not the number it can grow to.
 */
export function DetailPageSkeleton({
  cards = 3,
  wide = false,
}: {
  cards?: number;
  /** True for the screens whose `main` is `md:max-w-5xl` rather than `md:max-w-2xl`. */
  wide?: boolean;
} = {}) {
  return (
    <div
      data-settling="true"
      aria-hidden="true"
      className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]"
    >
      <main
        className={`mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:px-10 md:pb-16 md:pl-28 ${
          wide ? 'md:max-w-5xl' : 'md:max-w-2xl'
        }`}
      >
        {/* The Back button's own row. */}
        <div className="mef-settling h-5 w-28 rounded-full" />
        {/* The small label above the heading. */}
        <div className="mef-settling mt-4 h-4 w-32 rounded-full" />
        {/* The serif heading: two lines of its real height, not one. */}
        <div className="mef-settling mt-2 h-9 w-3/4 rounded-full" />
        {/* The subtitle under it. */}
        <div className="mef-settling mt-3 h-4 w-full rounded-full" />
        <div className="mef-settling mt-2 h-4 w-5/6 rounded-full" />

        <div className="mt-7 space-y-5">
          {Array.from({ length: cards }, (_, index) => (
            <div
              key={index}
              className={`mef-settling rounded-[28px] ${index === 0 ? 'h-40' : 'h-32'}`}
            />
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

/**
 * The same screen without the bottom bar, for the flows that deliberately
 * hide it: a taker, a wizard, a close-out screen. Reserving a bar that the
 * real screen does not draw would leave a strip of chrome that vanishes.
 */
export function FlowPageSkeleton({ cards = 2 }: { cards?: number } = {}) {
  return (
    <div
      data-settling="true"
      aria-hidden="true"
      className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]"
    >
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <div className="mef-settling h-5 w-28 rounded-full" />
        <div className="mef-settling mt-6 h-9 w-3/4 rounded-full" />
        <div className="mef-settling mt-3 h-4 w-full rounded-full" />
        <div className="mef-settling mt-2 h-4 w-5/6 rounded-full" />
        <div className="mt-8 space-y-5">
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="mef-settling h-44 rounded-[28px]" />
          ))}
        </div>
      </main>
    </div>
  );
}
