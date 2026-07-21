import { redirect, notFound } from 'next/navigation';
import { ChevronLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import {
  listPrescriptionSnapshotsForClientAction,
  getPrescriptionSnapshotAction,
} from '@/app/actions/prescription-intelligence';
import { PrescriptionGeneratorPanel } from '@/components/prescription-intelligence/PrescriptionGeneratorPanel';
import { PrescriptionReviewPanel } from '@/components/prescription-intelligence/PrescriptionReviewPanel';

export default async function ClientPrescriptionPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS (coach_read_assigned_client_profile) — a client this coach isn't
  // assigned to simply returns no row.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();
  const displayName = clientProfile.display_name ?? 'This client';
  const firstName = displayName.split(' ')[0];

  const snapshots = await listPrescriptionSnapshotsForClientAction(params.id);
  const pending = snapshots.find((s) => s.status === 'pending_coach_review');
  const latestBlocked = !pending ? snapshots.find((s) => s.status === 'blocked') : null;
  const focusSnapshot = pending ?? latestBlocked ?? null;
  const hydratedSnapshot = focusSnapshot
    ? await getPrescriptionSnapshotAction(focusSnapshot.id)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Prescription Intelligence
          </p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {firstName}&apos;s Strategy
          </h1>
        </div>

        <div className="mt-7 space-y-5">
          {!hydratedSnapshot && <PrescriptionGeneratorPanel clientId={params.id} />}

          {hydratedSnapshot && (
            <PrescriptionReviewPanel
              snapshot={hydratedSnapshot}
              clientId={params.id}
              clientDisplayName={displayName}
            />
          )}

          {!pending && snapshots.length > 0 && (
            <section className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Recent Runs
              </p>
              <div className="mt-3 divide-y divide-[#1B3A2D]/5">
                {snapshots.slice(0, 8).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="text-[#1B3A2D]">
                      {new Date(s.generated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-xs capitalize text-[#6B7A72]">
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
