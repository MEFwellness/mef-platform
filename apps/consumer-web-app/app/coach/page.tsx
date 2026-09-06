/**
 * The coach's front door.
 *
 * WHAT THE COACH SIDE EXPERIENCE PASS FOUND HERE, measured on production
 * on a 390px phone. The page was 2,400px, and the client list a coach
 * opens the app to read started at about 1,750px of that: below four stat
 * tiles, below a summary card, and below eight full-width navigation cards
 * carrying one word each. Roughly two screens of scrolling to reach the
 * work, past tools that are visited once a week.
 *
 * So the order is inverted. Who needs attention, then every client, then
 * the tools, then the numbers. Nothing was deleted to do it: every card
 * that was here is still here, and every destination that had a card has a
 * tile in the grid (components/staff/StaffToolGrid.tsx), in the same
 * order, to the same href.
 *
 * THREE THINGS THAT REPEATED, now said once.
 *   1. "Daily Coaching Summary" was a card whose whole content was one
 *      sentence restating the two stat tiles directly above it. The
 *      sentence is the page's subtitle now, where it reads as the header's
 *      own line instead of a third statement of the same two numbers.
 *   2. "Upcoming Sessions" was a stat tile of equal weight to the three
 *      live ones, permanently reading "Nothing scheduled. Booking isn't
 *      connected yet." It is true, so it stays, as one quiet line under
 *      the numbers rather than a quarter of the row.
 *   3. Change password sat third from the top, above all the work. It is
 *      an account errand, not a coaching one, and it is at the foot of the
 *      page now.
 *
 * THE GREETING NAMES ITS TIMEZONE. It used to be the literal string
 * "Good Morning", rendered at any hour: the live walk photographed it at
 * one in the afternoon. It reads the coach's own `profiles.timezone`
 * through `timeContextInTimezone`, the same helper the member Home uses,
 * so the two sides cannot disagree about what time it is and no `new Date()`
 * decides anything.
 *
 * NO DATA BEHAVIOUR CHANGED. Every query, every count and every threshold
 * is the one that was here. `buildAllClientSummaries`, `listCoachReviewQueue`
 * and `listPendingProteinTargetsAction` are called with the same arguments,
 * the attention rules live in app/coach/lib.ts exactly as before, and test
 * accounts reach this screen through the same caseload exception in
 * lib/staff/testAccounts.ts that put Ebony on it. This file only decides
 * what is drawn and in what order.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  Users,
  UserCheck,
  AlertTriangle,
  ClipboardList,
  ShieldAlert,
  Dumbbell,
  ListChecks,
  Sparkles,
  Activity,
  Beef,
  Compass,
} from 'lucide-react';
import { listAssignedClients } from '@/app/actions/coach';
import { listCoachReviewQueue } from '@/app/actions/safety';
import { listPendingProteinTargetsAction } from '@/app/actions/protein-review';
import { buildAllClientSummaries } from './lib';
import { STATUS_STYLES } from '@/lib/wellness/status';
import { ClientListPanel } from './ClientListPanel';
import { TestAccountChip } from '@/components/staff/TestAccountChip';
import { StaffPageHeader } from '@/components/staff/StaffPageHeader';
import { StaffToolGrid, type StaffTool } from '@/components/staff/StaffToolGrid';
import { StaffCollapsible } from '@/components/staff/StaffCollapsible';
import { firstNameFrom, greetingHeadline } from '@/lib/profile/greeting';
import { timeContextInTimezone } from '@/lib/feed/timeContext';
import { ChangePasswordLink } from '@/components/auth/ChangePasswordLink';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function timeAgo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'less than an hour ago';
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** One compact number, three to a row instead of two large tiles to a row. */
function StatTile({
  Icon,
  label,
  value,
  valueClass,
}: {
  Icon: typeof Users;
  label: string;
  value: string | number;
  valueClass?: string | undefined;
}) {
  return (
    <div className={`${CARD} flex flex-col gap-1.5 p-4`}>
      <span className="flex items-center gap-1.5 text-[#6B7A72]">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wider">
          {label}
        </span>
      </span>
      <span className={`text-2xl font-semibold ${valueClass ?? 'text-[#1B3A2D]'}`}>{value}</span>
    </div>
  );
}

export default async function CoachPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .single();
  const firstName = firstNameFrom(coachProfile?.display_name);
  const { greetingWord } = timeContextInTimezone(coachProfile?.timezone ?? 'America/New_York');

  const clients = await listAssignedClients();
  const summaries = await buildAllClientSummaries(clients);
  const reviewQueue = await listCoachReviewQueue();
  const openReviewCases = reviewQueue.filter(
    (entry) => entry.status !== 'closed' && entry.status !== 'approved_for_limited_coaching'
  );
  const pendingProteinTargets = await listPendingProteinTargetsAction();

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

  /*
   * The two queues are tools that only exist when they hold something, so
   * they lead the grid and carry their count, exactly as the two
   * conditional cards they replace did. Everything after them is always
   * present and in the order the cards were in.
   */
  const tools: StaffTool[] = [
    ...(openReviewCases.length > 0
      ? [
          {
            label: 'Safety Review Queue',
            href: '/coach/review-queue',
            Icon: ShieldAlert,
            badge: `${openReviewCases.length} open`,
            tone: 'waiting' as const,
          },
        ]
      : []),
    ...(pendingProteinTargets.length > 0
      ? [
          {
            label: 'Protein Targets',
            href: '/coach/protein-review',
            Icon: Beef,
            badge: `${pendingProteinTargets.length} pending`,
            tone: 'waiting' as const,
          },
        ]
      : []),
    { label: 'Assign a Program', href: '/coach/assign', Icon: ClipboardList },
    { label: 'Program Library', href: '/coach/programs', Icon: Dumbbell },
    { label: 'Corrective Programs', href: '/coach/corrective-programs', Icon: Activity },
    { label: 'Generate', href: '/coach/generate', Icon: Sparkles },
    { label: 'Question Bank', href: '/coach/questions', Icon: ListChecks },
    { label: 'Exercise Library', href: '/exercises', Icon: Dumbbell },
    { label: 'Movement Profile', href: '/movement/profile', Icon: Compass },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <StaffPageHeader
          title={greetingHeadline(greetingWord, firstName)}
          subtitle={summarySentence}
        />

        {/* ---------------------------------------------------- */}
        {/* Who needs you. First on the page, because it is the    */}
        {/* reason a coach opened it. Same rows, same rules, same  */}
        {/* order as before (app/coach/lib.ts decides both).       */}
        {/* ---------------------------------------------------- */}
        {needingAttention.length > 0 && (
          <section className={`${CARD} mt-6 p-6`}>
            <div className={`flex items-center gap-2 ${STATUS_STYLES.poor.text}`}>
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Needs Attention</p>
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
                    <span className="flex flex-wrap items-center gap-2 font-medium text-[#1B3A2D]">
                      {s.profile.display_name ?? 'Unnamed client'}
                      {s.profile.is_test ? <TestAccountChip /> : null}
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
        {/* Every client, searchable and sortable. Was the last    */}
        {/* thing on the page and is now the second.              */}
        {/* ---------------------------------------------------- */}
        <section className="mt-6">
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
                isTest: Boolean(s.profile.is_test),
              }))}
            />
          ) : (
            <div className={`${CARD} mt-3 p-6`}>
              <p className="text-sm text-[#6B7A72]">No clients are currently assigned to you.</p>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- */}
        {/* The tools, as tiles. Eight stacked full-width cards    */}
        {/* became one grid; nothing lost a destination.          */}
        {/* ---------------------------------------------------- */}
        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Tools</p>
          <div className="mt-3">
            <StaffToolGrid tools={tools} label="Coach tools" />
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* The numbers, and the activity feed behind a fold.      */}
        {/* ---------------------------------------------------- */}
        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Today</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatTile Icon={Users} label="Active" value={totalActive} />
            <StatTile
              Icon={AlertTriangle}
              label="Needs attention"
              value={needingAttention.length}
              valueClass={needingAttention.length > 0 ? STATUS_STYLES.poor.text : undefined}
            />
            <StatTile
              Icon={UserCheck}
              label="Not checked in"
              value={notCheckedInToday.length}
              valueClass={notCheckedInToday.length > 0 ? STATUS_STYLES.attention.text : undefined}
            />
          </div>
          <p className="mt-2 text-xs text-[#6B7A72]">
            Nothing scheduled. Booking isn&apos;t connected yet.
          </p>
        </section>

        {recentActivity.length > 0 && (
          <div className="mt-5">
            <StaffCollapsible
              title="Recent client activity"
              digest={`The last ${recentActivity.length} check-${recentActivity.length === 1 ? 'in' : 'ins'} across your clients.`}
            >
              <div className="divide-y divide-[#1B3A2D]/5">
                {recentActivity.map(({ client, checkin }) => (
                  <div
                    key={checkin.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-2 font-medium text-[#1B3A2D]">
                      {client.display_name ?? 'Unnamed client'}
                      {client.is_test ? <TestAccountChip /> : null}
                    </span>
                    <span className="text-[#6B7A72]">
                      checked in {timeAgo(checkin.recorded_at)}
                    </span>
                  </div>
                ))}
              </div>
            </StaffCollapsible>
          </div>
        )}

        {/* An account errand, not a coaching one. It was third from
            the top of this page and is now at the foot of it. */}
        <ChangePasswordLink className="mt-8" />
      </main>
    </div>
  );
}
