import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ShieldAlert, History } from 'lucide-react';
import { getCoachReviewQueueEntry } from '@/app/actions/safety';
import { BottomNav } from '@/components/BottomNav';
import { STATUS_STYLES } from '@/lib/wellness/status';
import { ReviewCaseControls } from '../ReviewCaseControls';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function ReviewCaseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { entry, classification, auditLog } = await getCoachReviewQueueEntry(params.id);
  if (!entry) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', entry.member_id)
    .single();
  const memberName = profile?.display_name ?? 'Unnamed client';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/coach/review-queue"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to review queue
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
            {memberName}
          </h1>
          <Link
            href={`/coach/clients/${entry.member_id}`}
            className="text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
          >
            View client profile
          </Link>
        </div>

        <div className="mt-6 space-y-5">
          <section className={`${CARD} p-6`}>
            <div className={`flex items-center gap-2 ${STATUS_STYLES.poor.text}`}>
              <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Case Details</p>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">Classification</dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">{entry.classification_level}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">Urgency</dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">{entry.urgency}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">Source</dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">{entry.source_feature}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">Created</dt>
                <dd className="mt-1 font-medium text-[#1B3A2D]">{formatDate(entry.created_at)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">
                  Concern categories
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.concern_categories.map((category) => (
                    <span
                      key={category}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES.attention.bg} ${STATUS_STYLES.attention.text}`}
                    >
                      {category}
                    </span>
                  ))}
                </dd>
              </div>
              {entry.member_input_excerpt && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">
                    Member input excerpt
                  </dt>
                  <dd className="mt-1.5 rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]/85">
                    &ldquo;{entry.member_input_excerpt}&rdquo;
                  </dd>
                </div>
              )}
              {classification?.member_message_shown && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">
                    Message shown to member
                  </dt>
                  <dd className="mt-1.5 rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]/85 whitespace-pre-line">
                    {classification.member_message_shown}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <ReviewCaseControls
            reviewId={entry.id}
            currentStatus={entry.status}
            currentNotes={entry.coach_notes}
          />

          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Audit History</p>
            </div>
            {auditLog.length === 0 ? (
              <p className="mt-3 text-sm text-[#6B7A72]">No audit events recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
                {auditLog.map((entryLog) => (
                  <li key={entryLog.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-[#1B3A2D]">{entryLog.event_type}</span>
                      <span className="text-xs text-[#6B7A72]">
                        {formatDate(entryLog.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[#6B7A72]">{entryLog.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
