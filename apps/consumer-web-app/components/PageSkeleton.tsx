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
 */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-40 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
        </div>
        <div className="mt-3 h-9 w-2/3 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />

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
