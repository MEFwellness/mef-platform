import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, ChevronLeft } from 'lucide-react';
import { listCoachReviewQueue } from '@/app/actions/safety';
import { BottomNav } from '@/components/BottomNav';
import { STATUS_STYLES } from '@/lib/wellness/status';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  approved_for_limited_coaching: 'Approved (limited)',
  referred_out: 'Referred out',
  urgent_follow_up: 'Urgent follow-up',
  closed: 'Closed',
};

const URGENCY_BADGE: Record<string, { bg: string; text: string }> = {
  critical: { bg: STATUS_STYLES.poor.bg, text: STATUS_STYLES.poor.text },
  high: { bg: STATUS_STYLES.poor.bg, text: STATUS_STYLES.poor.text },
  medium: { bg: STATUS_STYLES.attention.bg, text: STATUS_STYLES.attention.text },
  low: { bg: STATUS_STYLES['no-data'].bg, text: STATUS_STYLES['no-data'].text },
  none: { bg: STATUS_STYLES['no-data'].bg, text: STATUS_STYLES['no-data'].text },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function ReviewQueuePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const entries = await listCoachReviewQueue();

  const memberIds = Array.from(new Set(entries.map((e) => e.member_id)));
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', memberIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? 'Unnamed client']));

  const open = entries.filter(
    (e) => e.status !== 'closed' && e.status !== 'approved_for_limited_coaching'
  );
  const resolved = entries.filter(
    (e) => e.status === 'closed' || e.status === 'approved_for_limited_coaching'
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/coach"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to dashboard
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Review Queue
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Cases flagged by the coaching safety layer for your review.
        </p>

        <section className={`${CARD} mt-6 p-6`}>
          <div className={`flex items-center gap-2 ${STATUS_STYLES.poor.text}`}>
            <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Open Cases ({open.length})
            </p>
          </div>
          {open.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7A72]">No open cases right now.</p>
          ) : (
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {open.map((entry) => {
                const urgencyBadge = URGENCY_BADGE[entry.urgency] ?? URGENCY_BADGE.none!;
                return (
                  <Link
                    key={entry.id}
                    href={`/coach/review-queue/${entry.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm transition hover:opacity-80"
                  >
                    <div>
                      <span className="font-medium text-[#1B3A2D]">
                        {nameById.get(entry.member_id) ?? 'Unnamed client'}
                      </span>
                      <span className="ml-2 text-xs text-[#6B7A72]">
                        {formatDate(entry.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${urgencyBadge.bg} ${urgencyBadge.text}`}
                      >
                        {entry.urgency}
                      </span>
                      <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                        {STATUS_LABEL[entry.status] ?? entry.status}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {resolved.length > 0 && (
          <section className={`${CARD} mt-5 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Resolved ({resolved.length})
            </p>
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {resolved.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/coach/review-queue/${entry.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm transition hover:opacity-80"
                >
                  <span className="font-medium text-[#1B3A2D]">
                    {nameById.get(entry.member_id) ?? 'Unnamed client'}
                  </span>
                  <span className="text-[#6B7A72]">
                    {STATUS_LABEL[entry.status] ?? entry.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <BottomNav isCoach />
    </div>
  );
}
