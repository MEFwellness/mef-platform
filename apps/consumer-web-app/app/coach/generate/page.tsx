/**
 * Coach-only entry point for Your Move-powered generation. Members never
 * see a generate button anywhere — this route (and everything under it)
 * is gated by the same coach-role redirect every /coach/* page uses.
 * Sits alongside the Program Library (see /coach/programs) rather than
 * replacing it: a generated draft only ever becomes a normal Program
 * Library entry once the coach explicitly saves it.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Dumbbell, CalendarRange, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function GenerateEntryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Generate</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Generate a Starting Point
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Pick a few parameters, review the draft, and edit it before it ever reaches a client. Nothing saves to
            the Program Library until you say so.
          </p>
        </div>

        <div className="mt-7 space-y-3">
          <Link
            href="/coach/generate/workout"
            className={`${CARD} flex items-center justify-between p-6 transition hover:opacity-90`}
          >
            <div className="flex items-center gap-3">
              <Dumbbell className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <p className="text-base font-semibold text-[#1B3A2D]">Generate a Workout</p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">One session — muscle group, equipment, difficulty.</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
          </Link>

          <Link
            href="/coach/generate/program"
            className={`${CARD} flex items-center justify-between p-6 transition hover:opacity-90`}
          >
            <div className="flex items-center gap-3">
              <CalendarRange className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <p className="text-base font-semibold text-[#1B3A2D]">Generate a Program</p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">Multi-week — goal and number of weeks.</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
