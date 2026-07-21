import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  AlertTriangle,
  Calendar,
  ClipboardList,
  ShieldAlert,
  Dumbbell,
  ChevronRight,
} from 'lucide-react';
import { listAssignedClients } from '@/app/actions/coach';
import { listCoachReviewQueue } from '@/app/actions/safety';
import { buildAllClientSummaries } from './lib';
import { BottomNav } from '@/components/BottomNav';
import { STATUS_STYLES } from '@/lib/wellness/status';
import { ClientListPanel } from './ClientListPanel';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const STAT_CARD = `${CARD} flex flex-col p-5`;

function timeAgo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'less than an hour ago';
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default async function CoachPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const firstName = coachProfile?.display_name?.split(' ')[0] ?? 'there';

  const clients = await listAssignedClients();
  const summaries = await buildAllClientSummaries(clients);
  const reviewQueue = await listCoachReviewQueue();
  const openReviewCases = reviewQueue.filter(
    (entry) => entry.status !== 'closed' && entry.status !== 'approved_for_limited_coaching'
  );

  const totalActive = summaries.length;
  const needingAttention = summaries.filter((s) => s.attentionReasons.length > 0);
  const notCheckedInToday = summaries.filter((s) => !s.hasCheckedInToday);
  const onTrackCount = summaries.filter(
    (s) => s.wellnessIndex && s.wellnessIndex.status === 'good'
  ).length;

  // Recent activity: every client's check-ins, flattened and sorted by
  // when they were actually recorded — real data, not a separate feed.
  const recentActivity = summaries
    .flatMap((s) => s.checkins.map((c) => ({ client: s.profile, checkin: c })))
    .sort(
      (a, b) =>
        new Date(b.checkin.recorded_at).getTime() - new Date(a.checkin.recorded_at).getTime()
    )
    .slice(0, 5);

  const summarySentence =
    totalActive === 0
      ? 'No clients are currently assigned to you.'
      : needingAttention.length === 0
        ? `All ${totalActive} of your active clients are on track today.`
        : `${onTrackCount} of ${totalActive} active clients are on track today. ${needingAttention.length} need${needingAttention.length === 1 ? 's' : ''} attention.`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Good Morning, {firstName}
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Here&apos;s how your clients are doing today.
        </p>

        {/* ---------------------------------------------------- */}
        {/* Coach Home Dashboard — stats                          */}
        {/* ---------------------------------------------------- */}
        <div className="mt-7 grid grid-cols-2 gap-5 md:grid-cols-4">
          <div className={STAT_CARD}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Active Clients</p>
            </div>
            <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">{totalActive}</p>
          </div>

          <div className={STAT_CARD}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Needs Attention</p>
            </div>
            <p
              className={`mt-3 text-3xl font-semibold ${needingAttention.length > 0 ? STATUS_STYLES.poor.text : 'text-[#1B3A2D]'}`}
            >
              {needingAttention.length}
            </p>
          </div>

          <div className={STAT_CARD}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <UserCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Not Checked In</p>
            </div>
            <p
              className={`mt-3 text-3xl font-semibold ${notCheckedInToday.length > 0 ? STATUS_STYLES.attention.text : 'text-[#1B3A2D]'}`}
            >
              {notCheckedInToday.length}
            </p>
          </div>

          <div className={STAT_CARD}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <Calendar className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Upcoming Sessions</p>
            </div>
            <p className="mt-3 text-lg font-medium text-[#1B3A2D]">Nothing scheduled</p>
            <p className="mt-1 text-xs text-[#6B7A72]">Booking isn&apos;t connected yet.</p>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* Daily coaching summary                                */}
        {/* ---------------------------------------------------- */}
        <section className={`${CARD} mt-5 p-6`}>
          <div className="flex items-center gap-2 text-[#854D0E]">
            <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Daily Coaching Summary</p>
          </div>
          <p className="mt-2 text-base text-[#1B3A2D]">{summarySentence}</p>
        </section>

        {/* ---------------------------------------------------- */}
        {/* Program Library — reusable coach-authored workout       */}
        {/* templates (Coach Program Builder milestone). Always      */}
        {/* shown, unlike the conditional Safety Review Queue link   */}
        {/* below, since building/reusing programs is a routine      */}
        {/* coaching task, not an exception state.                   */}
        {/* ---------------------------------------------------- */}
        <Link
          href="/coach/programs"
          className={`${CARD} mt-5 flex items-center justify-between p-6 transition hover:opacity-90`}
        >
          <div className="flex items-center gap-2 text-[#854D0E]">
            <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Program Library</p>
          </div>
          <ChevronRight className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        {/* ---------------------------------------------------- */}
        {/* Safety Review Queue — cases flagged by the coaching    */}
        {/* safety layer (Milestone 1). Only shown when there's    */}
        {/* something open, so it never clutters an empty queue.   */}
        {/* ---------------------------------------------------- */}
        {openReviewCases.length > 0 && (
          <Link
            href="/coach/review-queue"
            className={`${CARD} mt-5 flex items-center justify-between p-6 transition hover:opacity-90`}
          >
            <div className={`flex items-center gap-2 ${STATUS_STYLES.poor.text}`}>
              <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Safety Review Queue</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES.poor.bg} ${STATUS_STYLES.poor.text}`}
            >
              {openReviewCases.length} open
            </span>
          </Link>
        )}

        {/* ---------------------------------------------------- */}
        {/* Priority Queue — clients needing attention, real data  */}
        {/* only (missed check-in, index below threshold, sudden   */}
        {/* drop, rising pain/stress — see app/coach/lib.ts).       */}
        {/* ---------------------------------------------------- */}
        {needingAttention.length > 0 && (
          <section className={`${CARD} mt-5 p-6`}>
            <div className={`flex items-center gap-2 ${STATUS_STYLES.poor.text}`}>
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Priority Queue</p>
            </div>
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {needingAttention
                .sort((a, b) => b.attentionReasons.length - a.attentionReasons.length)
                .map((s) => (
                  <a
                    key={s.profile.id}
                    href={`/coach/clients/${s.profile.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm transition hover:opacity-80"
                  >
                    <span className="font-medium text-[#1B3A2D]">
                      {s.profile.display_name ?? 'Unnamed client'}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {s.attentionReasons.map((reason) => (
                        <span
                          key={reason}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES.poor.bg} ${STATUS_STYLES.poor.text}`}
                        >
                          {reason}
                        </span>
                      ))}
                    </span>
                  </a>
                ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------- */}
        {/* Recent client activity                                */}
        {/* ---------------------------------------------------- */}
        {recentActivity.length > 0 && (
          <section className={`${CARD} mt-5 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Recent Client Activity
            </p>
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {recentActivity.map(({ client, checkin }) => (
                <div
                  key={checkin.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-[#1B3A2D]">
                    {client.display_name ?? 'Unnamed client'}
                  </span>
                  <span className="text-[#6B7A72]">checked in {timeAgo(checkin.recorded_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------- */}
        {/* Client List — searchable + sortable, client component  */}
        {/* ---------------------------------------------------- */}
        <section className="mt-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Your Clients
          </p>
          {summaries.length > 0 ? (
            <ClientListPanel
              clients={summaries.map((s) => ({
                id: s.profile.id,
                name: s.profile.display_name ?? 'Unnamed client',
                score: s.wellnessIndex?.score ?? null,
                status: s.wellnessIndex?.status ?? 'no-data',
                trend: s.trend,
                lastCheckinDate: s.lastCheckinDate,
                hasCheckedInToday: s.hasCheckedInToday,
                attentionReasons: s.attentionReasons,
              }))}
            />
          ) : (
            <div className={`${CARD} mt-3 p-6`}>
              <p className="text-sm text-[#6B7A72]">No clients are currently assigned to you.</p>
            </div>
          )}
        </section>
      </main>

      {/* middleware.ts already redirected anyone without the coach role
          before this page rendered, so isCoach is always true here. */}
      <BottomNav isCoach />
    </div>
  );
}
