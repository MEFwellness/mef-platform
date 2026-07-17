import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { listMyPantryAction } from '@/app/actions/pantry';
import { PantryDashboard } from '@/components/pantry/PantryDashboard';

export default async function PantryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, overview] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    listMyPantryAction(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your pantry
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          What you have on hand, what&apos;s about to expire, and simple combinations Root notices
          from what&apos;s actually here right now.
        </p>

        <PantryDashboard initialActive={overview.active} />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
