import Link from 'next/link';
import type { Route } from 'next';
import { Dumbbell, Calendar, ChevronRight, Sparkles } from 'lucide-react';
import type { CoachAssignedWorkout, ProgramAssignmentStatus } from '@mef/shared-types-contracts';
import type { MemberProgramView } from '@/lib/program-lifecycle/memberView';
import { memberSessionLabel } from '@/lib/programs/memberPresentation';

/**
 * The way into a member's assigned program, from Home and from Movement.
 *
 * It used to be a divider row quoting the program's stored internal title
 * above `22 workouts waiting for you`. Both halves were wrong. The first
 * put clinical vocabulary on her home screen. The second framed her
 * program as a backlog, and nobody thinks about their training as a pile
 * of twenty-two things owed. She thinks about the next one.
 *
 * THE POLISH PASS (2026-08-18). It then spent a while as a correct but
 * flat white card: small label, two lines of grey text, a button. It is
 * the single most personal thing in this product, a prescription a coach
 * wrote for one member, and it read like a row in a list.
 *
 * It is now the screen's hero, in the app's existing premium language
 * rather than a new one: the same deep-green gradient the Movement
 * Assessment panel uses on Home (components/MovementAssessmentCard.tsx's
 * `imageBacked` variant), the same Cormorant display serif, the same gold
 * call to action. Nothing about what it reads, where it links, or what it
 * fetches changed; the whole of this pass is presentation.
 *
 * Still conditional, same "only shown when there is something to act on"
 * posture as ConnectWearableCard and the coach dashboard's Safety Review
 * Queue: a member with no live program never sees an empty card.
 */

const HERO =
  'relative isolate overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0F241C] via-[#1B3A2D] to-[#2A4A3A] text-[#FAFAF8] ' +
  'shadow-[0_20px_44px_-20px_rgba(15,36,28,0.7)] transition hover:shadow-[0_26px_54px_-20px_rgba(15,36,28,0.8)]';

/** The four states a program can be in on a screen that is about now. `replaced` and `cancelled` are history and never render here. */
type HeroState = 'upcoming' | 'active' | 'paused' | 'completed';

const HERO_STATES: Record<ProgramAssignmentStatus, HeroState | null> = {
  upcoming: 'upcoming',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  replaced: null,
  cancelled: null,
};

export function AssignedProgramsCard({
  program,
  nextWorkout,
  isNew = false,
}: {
  /** The program she is on, or null. Never a replaced or cancelled one: this card is about now. */
  program: MemberProgramView | null;
  /** Her next session in that program, or null when there is nothing ahead of her. */
  nextWorkout: CoachAssignedWorkout | null;
  /**
   * True while her coach has handed her this program and she has never
   * opened it. Decided from the event stream by
   * getMyCurrentProgramEntryAction (migration 185), and it clears
   * permanently the first time she opens the program, not per session.
   */
  isNew?: boolean;
}) {
  if (!program) return null;
  const state = HERO_STATES[program.status];
  if (!state) return null;

  const session = nextWorkout ? memberSessionLabel(nextWorkout.template_name) : null;
  const nextLine = nextWorkout
    ? `${session ? `${session}, ` : ''}${formatDate(nextWorkout.scheduled_date)}`
    : null;
  const href = (nextWorkout ? `/programs/${nextWorkout.id}` : '/programs') as Route;

  // The one warm line under the name. programHeadline already speaks in
  // her language for every state ("Starts Wednesday, August 26", "Week 2
  // of 4"), so this reuses it rather than writing a second vocabulary that
  // could drift from the one My Programs uses.
  const statusLine = program.headline;

  // The supporting line. A running or upcoming program says what it is;
  // a paused or finished one says what is happening to it, which is the
  // only thing worth reading at that point.
  //
  // C10 (2026-08-27). `program.blurb` is the explanation her coach wrote
  // for her, and a coach writing an explanation writes paragraphs: on
  // Home it rendered as a fifteen line wall inside a card built around
  // "Week 2 of 4" and "Next up", and pushed the button that opens the
  // program off the bottom of the screen. Nothing is cut and nothing is
  // truncated with a marker, because the whole of it is on /programs,
  // which is one tap away and is the screen for reading it. This card is
  // the way in, so it shows the opening of the explanation and stops.
  const supportLine =
    state === 'paused' || state === 'completed' ? program.detail : program.blurb;

  const nextLabel = state === 'upcoming' ? 'First session' : 'Next up';
  const showNext = nextLine !== null && (state === 'upcoming' || state === 'active');

  const cta = CTA_LABEL[state](nextWorkout !== null);

  // A quiet week track, shown only when the program actually knows its own
  // shape. It repeats nothing: the words above already say "Week 2 of 4",
  // and this is the same fact for the eye, so it is hidden from a screen
  // reader rather than read out twice.
  //
  // An upcoming program fills none of it. The row carries current_week = 1
  // from the day it is assigned, because that is the week it will open on,
  // but drawing a week she has not lived yet would be the card claiming
  // progress that has not happened.
  const weeks = program.durationWeeks;
  const filled =
    state === 'upcoming'
      ? 0
      : state === 'completed'
        ? (weeks ?? 0)
        : Math.max(0, Math.min(program.currentWeek ?? 0, weeks ?? 0));
  const showTrack = weeks !== null && weeks >= 2 && weeks <= 16;

  return (
    <Link
      href={href}
      className={`mef-press mef-card-lift block ${HERO} p-7 sm:p-9 ${
        isNew ? 'ring-1 ring-[#F5B700]/45' : ''
      }`}
    >
      {/* The texture, and nothing busier than this: one warm glow behind
          the top corner and one oversized, almost invisible mark of the
          section it belongs to. Same two-shape vocabulary the Movement
          Assessment panel and the Movement suggestion card already use. */}
      <div
        className={`pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full blur-3xl ${
          isNew ? 'bg-[#F5B700]/18' : 'bg-[#F5B700]/10'
        }`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#FAFAF8]/[0.05] blur-3xl"
        aria-hidden="true"
      />
      <Dumbbell
        className="pointer-events-none absolute -bottom-8 -right-6 h-40 w-40 text-white/[0.05]"
        strokeWidth={1}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 text-[#FAFAF8]/60">
            <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Your program</p>
          </div>
          {isNew && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5B700] px-3 py-1 text-[11px] font-semibold tracking-wide text-[#1B3A2D]">
              <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
              New from your coach
            </span>
          )}
        </div>

        <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-[2rem] leading-[1.08] text-[#FAFAF8] sm:text-[2.4rem]">
          {program.name}
        </h2>

        <p className="mt-2.5 text-[15px] font-semibold text-[#F5B700]">{statusLine}</p>

        {supportLine && (
          <p className="mt-2 line-clamp-3 max-w-md text-sm leading-relaxed text-[#FAFAF8]/70">
            {supportLine}
          </p>
        )}

        {showTrack && (
          <div className="mt-5 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: weeks! }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${
                  index < filled
                    ? state === 'paused'
                      ? 'bg-[#FAFAF8]/40'
                      : 'bg-[#F5B700]'
                    : 'bg-[#FAFAF8]/15'
                }`}
              />
            ))}
          </div>
        )}

        {showNext && (
          <p className="mt-5 flex items-center gap-2 text-sm text-[#FAFAF8]/85">
            <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {nextLabel}: {nextLine}
          </p>
        )}

        <span className="mef-press mt-6 inline-flex items-center gap-2 rounded-full bg-[#F5B700] px-7 py-3.5 text-sm font-semibold text-[#1B3A2D] shadow-[0_12px_26px_-10px_rgba(0,0,0,0.6)] transition hover:brightness-105">
          {cta}
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

/**
 * What the button says, per state. Warm, plain, and honest about what is
 * on the other side of the tap: where it GOES is unchanged (her next
 * session when she has one, her programs when she does not).
 */
const CTA_LABEL: Record<HeroState, (hasNext: boolean) => string> = {
  upcoming: (hasNext) => (hasNext ? 'See your first session' : 'Open your program'),
  active: (hasNext) => (hasNext ? 'Open your next session' : 'Open your program'),
  paused: () => 'Open your program',
  completed: () => 'See what you finished',
};

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
