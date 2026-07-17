import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { getFoodLensLabelScanAction } from '@/app/actions/food-label';
import { LabelConfirmForm } from '@/components/food-lens/LabelConfirmForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function FoodLensLabelScanPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, detail] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getFoodLensLabelScanAction(params.id),
  ]);
  if (!detail) notFound();

  const { scan, labelScan, validationWarnings, captures } = detail;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          Review what Root read
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
          Check each value below — anything Root wasn&apos;t confident about is flagged. Nothing is
          saved until you confirm.
        </p>

        <div className="mt-6">
          {scan.status === 'not_configured' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                Label scanning isn&apos;t available yet — this scan is saved and will be read
                automatically once it is.
              </p>
            </div>
          )}

          {scan.status === 'analyzing' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">Reading the label…</p>
            </div>
          )}

          {scan.status === 'failed' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#B45309]">
                {scan.provider_error ?? "This label couldn't be read. Try retaking the photo with more light."}
              </p>
              <Link
                href={'/food-lens/label/new' as Route}
                className="mt-4 inline-block rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white"
              >
                Try again
              </Link>
            </div>
          )}

          {labelScan && (
            <LabelConfirmForm
              scanId={scan.id}
              initialLabelScan={labelScan}
              initialWarnings={validationWarnings}
              captures={captures}
            />
          )}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
