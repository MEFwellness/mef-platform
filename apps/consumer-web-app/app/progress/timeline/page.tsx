import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ClipboardCheck,
  RefreshCw,
  ScanFace,
  CalendarCheck,
  Milestone,
  Watch,
} from 'lucide-react';
import type { HealthTimelineEvent } from '@mef/shared-types-contracts';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { getMyTimelineEvents } from '@/app/actions/health-profile';
import { getAnalysisById } from '@/lib/coach-intelligence/data';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const EVENT_ICON = {
  onboarding_completed: ClipboardCheck,
  reassessment_completed: RefreshCw,
  checkin_submitted: CalendarCheck,
  assessment_published: ScanFace,
  wearable_synced: Watch,
} as const;

type Group =
  | { kind: 'milestone'; event: HealthTimelineEvent; href: string | null }
  | { kind: 'checkins'; events: HealthTimelineEvent[] };

/** Milestone-style events (onboarding, reassessments, published reports) each get their own card; consecutive daily check-ins collapse into one compact chip so the story reads as a journey, not a log. Events arrive newest-first (see lib/timeline/data.ts's listTimelineEvents). */
function groupEvents(events: HealthTimelineEvent[]): Group[] {
  const groups: Group[] = [];
  let checkinRun: HealthTimelineEvent[] = [];

  function flushCheckinRun() {
    if (checkinRun.length > 0) {
      groups.push({ kind: 'checkins', events: checkinRun });
      checkinRun = [];
    }
  }

  for (const event of events) {
    if (event.event_type === 'checkin_submitted') {
      checkinRun.push(event);
    } else {
      flushCheckinRun();
      groups.push({ kind: 'milestone', event, href: null });
    }
  }
  flushCheckinRun();
  return groups;
}

async function resolveHrefs(supabase: ReturnType<typeof createClient>, groups: Group[]): Promise<Group[]> {
  return Promise.all(
    groups.map(async (group) => {
      if (group.kind !== 'milestone') return group;
      const { event } = group;

      if (event.event_type === 'onboarding_completed') {
        return { ...group, href: '/profile/baseline' };
      }
      if (event.event_type === 'reassessment_completed' && event.source_record_id) {
        return { ...group, href: `/profile/reassessments/${event.source_record_id}` };
      }
      if (event.event_type === 'assessment_published' && event.source_record_id) {
        // The event's own source_record_id is the analysis id (see
        // lib/health-profile/orchestration.ts) — the member-facing route is
        // keyed by the underlying assessment id, one lookup away.
        const analysis = await getAnalysisById(supabase, event.source_record_id);
        return { ...group, href: analysis ? `/assessment/${analysis.source_record_id}` : null };
      }
      return group;
    })
  );
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function MilestoneCard({ event, href }: { event: HealthTimelineEvent; href: string | null }) {
  const Icon = EVENT_ICON[event.event_type] ?? Milestone;
  const body = (
    <div className={`${CARD} mef-animate-in flex items-start gap-4 p-6 transition ${href ? 'hover:bg-[#FAFAF8]' : ''}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF6F1] text-[#1B3A2D]">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          {formatDate(event.local_date)}
        </p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-[#1B3A2D]">{event.title}</p>
        {event.detail && <p className="mt-1 text-sm text-[#6B7A72]">{event.detail}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href as never} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function CheckinGroupChip({ events }: { events: HealthTimelineEvent[] }) {
  const newest = events[0]!;
  const oldest = events[events.length - 1]!;
  const label =
    events.length === 1
      ? `Checked in on ${formatDate(newest.local_date)}`
      : `Checked in ${events.length} times, ${formatDate(oldest.local_date)} – ${formatDate(newest.local_date)}`;

  return (
    <div className="mef-animate-in flex items-center gap-3 rounded-full bg-white/60 px-5 py-2.5 text-xs text-[#6B7A72]">
      <CalendarCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </div>
  );
}

export default async function HealthTimelinePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const events = await getMyTimelineEvents(200);
  const groups = await resolveHrefs(supabase, groupEvents(events));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/progress"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Your Wellness Story
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your Health Timeline
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Every assessment, reassessment, and published report — your journey in one place.
        </p>

        <div className="mt-7 space-y-3">
          {groups.length > 0 ? (
            groups.map((group, index) =>
              group.kind === 'milestone' ? (
                <MilestoneCard key={group.event.id} event={group.event} href={group.href} />
              ) : (
                <CheckinGroupChip key={`checkins-${index}`} events={group.events} />
              )
            )
          ) : (
            <section className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                Your timeline will fill in as you complete onboarding, check in, and receive
                assessment reports.
              </p>
            </section>
          )}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
