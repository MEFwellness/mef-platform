/**
 * Time Awareness (coaching memory/continuity milestone, Part 1) — a single
 * reusable, pure helper that turns "now, in the member's own timezone"
 * into the facts coaching copy needs: greeting, day of week, weekend vs.
 * weekday, and a per-day "week phase" tone (Part 4's weekly coaching
 * rhythm). Nothing here is hardcoded into the UI — app/today/page.tsx and
 * lib/feed/copy.ts's buildCoachNote consume this instead of each computing
 * their own notion of "morning" or "Monday".
 */

export type DayOfWeek =
  'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export type WeekPhase = {
  /** Short label for a premium UI badge, e.g. "Monday · Planning". */
  label: string;
  /** A short clause woven into the Coach's Note greeting (Part 4). */
  tone: string;
};

export type TimeContext = {
  hour: number;
  dayOfWeek: DayOfWeek;
  isWeekend: boolean;
  greetingWord: 'Good morning' | 'Good afternoon' | 'Good evening';
  weekPhase: WeekPhase;
};

const DAY_NAMES: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const WEEKEND_DAYS = new Set<DayOfWeek>(['saturday', 'sunday']);

/** The weekly coaching rhythm (Part 4) — tone evolves across the week without ever being written directly into a component. */
const WEEK_PHASE: Record<DayOfWeek, WeekPhase> = {
  monday: { label: 'Planning', tone: "Let's start the week strong." },
  tuesday: { label: 'Momentum', tone: "Let's keep this momentum going." },
  wednesday: {
    label: 'Midweek Reflection',
    tone: "We're halfway through the week — a good moment to check in with yourself.",
  },
  thursday: { label: 'Consistency', tone: "Let's keep showing up, one more day." },
  friday: {
    label: 'Finish Strong',
    tone: "You've made it through another week. Let's finish well.",
  },
  saturday: { label: 'Recovery', tone: 'Today is a good day to rest and recover.' },
  sunday: {
    label: 'Reset',
    tone: 'Today is about preparing your body and mind for the week ahead.',
  },
};

function greetingForHour(hour: number): TimeContext['greetingWord'] {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A plain YYYY-MM-DD local_date's day of week — UTC-parsed, same "these are calendar strings, not instants" convention as lib/feed/dateMath.ts. Used by the Coaching Brain's weekly-rhythm fallback (lib/brain/priorityEngine.ts), which only has a local_date to work with, not a timezone-aware `now`. */
export function dayOfWeekFromLocalDate(localDate: string): DayOfWeek {
  const [year, month, day] = localDate.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
}

/** @param nowInTz A Date already shifted into the member's local timezone (see app/today/page.tsx's `nowInTz`). */
export function buildTimeContext(nowInTz: Date): TimeContext {
  const dayOfWeek = DAY_NAMES[nowInTz.getDay()]!;
  const hour = nowInTz.getHours();
  return {
    hour,
    dayOfWeek,
    isWeekend: WEEKEND_DAYS.has(dayOfWeek),
    greetingWord: greetingForHour(hour),
    weekPhase: WEEK_PHASE[dayOfWeek],
  };
}
