import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Beef, ChevronLeft } from 'lucide-react';
import { listPendingProteinTargetsAction } from '@/app/actions/protein-review';
import { BottomNav } from '@/components/BottomNav';
import { ACTIVITY_LEVELS } from '@/lib/protein/calculation';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITY_LEVELS.map((option) => [option.key, option.label])
);

export default async function ProteinReviewQueuePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const entries = await listPendingProteinTargetsAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/coach"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to dashboard
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Protein Targets
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Computed targets for your 24-week program members, waiting on your review.
        </p>

        <section className={`${CARD} mt-6 p-6`}>
          <div className="flex items-center gap-2 text-[#854D0E]">
            <Beef className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Pending Review ({entries.length})
            </p>
          </div>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7A72]">Nothing waiting on you right now.</p>
          ) : (
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {entries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/coach/protein-review/${entry.id}` as Route}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm transition hover:opacity-80"
                >
                  <div>
                    <span className="font-medium text-[#1B3A2D]">{entry.memberName}</span>
                    <span className="ml-2 text-xs text-[#6B7A72]">
                      {formatDisplayDate(entry.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <p className="mt-0.5 text-xs text-[#6B7A72]">
                      {entry.bodyWeightLb} lb &middot; {ACTIVITY_LABEL[entry.activityLevel]}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                    {entry.computedGrams}g computed
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
