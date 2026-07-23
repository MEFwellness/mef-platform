/**
 * apps/consumer-web-app/app/recommendations/page.tsx
 *
 * The Recommendation Engine + Lifestyle Experiments member surface
 * (Prompt 11). Mirrors app/root-map/page.tsx's structure exactly
 * (back-link, CARD constant, BottomNav, safety statement footer). All
 * interactivity (mark done/not helpful, start/reflect an experiment) lives
 * in the client component below — this page only fetches and lays out.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Compass, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyRecommendations } from '@/app/actions/recommendations';
import { getMyLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { RecommendationsClient } from '@/components/recommendations/RecommendationsClient';

const SAFETY_STATEMENT =
  'These recommendations are a wellness coaching guide built from your own check-ins, activity, and assessments — never a medical diagnosis or a prediction about your health. Working suggestions only, held loosely, and always something to confirm or correct with your coach.';

export default async function RecommendationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [recommendations, experiments, isCoach] = await Promise.all([
    getMyRecommendations(),
    getMyLifestyleExperiments(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Dashboard
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Recommendations</p>
        </div>

        <RecommendationsClient recommendations={recommendations} experiments={experiments} />

        <section className="mt-5 flex items-start gap-3 px-1">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{SAFETY_STATEMENT}</p>
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
