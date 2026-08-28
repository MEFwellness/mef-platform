import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft, Beef } from 'lucide-react';
import { getProteinTargetForReviewAction } from '@/app/actions/protein-review';
import { ACTIVITY_LEVELS } from '@/lib/protein/calculation';
import { ProteinApprovalControls } from '../ProteinApprovalControls';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITY_LEVELS.map((option) => [option.key, option.label])
);

export default async function ProteinReviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const target = await getProteinTargetForReviewAction(params.id);
  if (!target) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', target.memberId)
    .single();
  const memberName = profile?.display_name ?? 'Unnamed client';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={'/coach/protein-review' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Protein Targets
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
          {memberName}
        </h1>

        <div className="mt-6 space-y-5">
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <Beef className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Submitted info</p>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">Body weight</dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">{target.bodyWeightLb} lb</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">
                  Activity level
                </dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">
                  {ACTIVITY_LABEL[target.activityLevel]}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">
                  Computed target
                </dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-cormorant-garamond)] text-[#1B3A2D]">
                  {target.computedGrams}g / day
                </dd>
              </div>
            </dl>
          </section>

          <ProteinApprovalControls targetId={target.id} computedGrams={target.computedGrams} />
        </div>
      </main>

    </div>
  );
}
