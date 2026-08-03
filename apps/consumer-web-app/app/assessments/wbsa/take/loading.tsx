/**
 * WBSA take-flow loading skeleton — same shape as the generic engine's
 * take/loading.tsx: no BottomNav, mirrors this route's own layout.
 */

const CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <div className="h-4 w-28 rounded-full bg-[#1B3A2D]/[0.08] animate-pulse" />
        <p className="mt-3 text-sm text-[#6B7A72]">Getting your next question ready...</p>

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
