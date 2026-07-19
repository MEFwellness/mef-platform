/**
 * Take-flow loading skeleton — deliberately not the shared PageSkeleton
 * (components/PageSkeleton.tsx), since that includes BottomNav and this
 * route intentionally renders without one (see take/page.tsx's own
 * "minimal chrome during a focused flow" note). Mirrors this page's own
 * shape instead: a back link, a progress bar, and a question card.
 */

const CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10">
        <div className="h-4 w-28 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />

        <div className="mt-5">
          <div className="h-1.5 w-full rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
          <div className={`${CARD} mt-6 h-80`} />
          <div className="mt-7 flex items-center justify-between gap-3">
            <div className="h-11 w-24 rounded-2xl bg-[#1B3A2D]/[0.08] animate-pulse" />
            <div className="h-11 w-28 rounded-2xl bg-[#1B3A2D]/[0.08] animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}
