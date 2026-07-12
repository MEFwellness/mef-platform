/**
 * Status-color classification for dashboard metrics. Every function here
 * takes the same raw value already fetched via getTodaysCheckin/
 * getRecentCheckins (no new data source) and returns one of four bands:
 * good / attention / poor / no-data. Thresholds encode the direction each
 * metric actually runs in — stress and pain are inverse (low is good),
 * everything else here is direct (high is good).
 *
 * Color choice is deliberate, not arbitrary: "good" and "attention" used
 * to reuse #1B3A2D and #854D0E — the same colors already used everywhere
 * on the dashboard for ordinary heading text and section-label accents
 * (WATER, SLEEP, DAILY WELLNESS INDEX, etc.), unrelated to status. A
 * status color that's visually identical to the surrounding chrome isn't
 * a status color — it reads as plain text. green-700/amber-700/red-700
 * (a matched Tailwind trio, same -700-on-50 pattern already proven
 * accessible for "poor") don't collide with anything else already on the
 * page, so each status is actually recognizable on sight.
 */

export type MetricStatus = 'good' | 'attention' | 'poor' | 'no-data';

export const STATUS_STYLES: Record<
  MetricStatus,
  { text: string; bg: string; dot: string; bar: string }
> = {
  good: { text: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-600', bar: 'bg-green-600' },
  attention: {
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  poor: { text: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', bar: 'bg-red-500' },
  // Not a 4th status color — absence, not a judgment. text-[#6B7A72] (the
  // app's usual muted-caption gray) fails WCAG AA (4.14:1) specifically
  // against bg-[#F3F6F4] wherever both are used together (e.g. a no-data
  // badge, or the chart's empty state) — found by actually auditing a
  // zero-checkin account, not assumed. text-[#1B3A2D]/70 passes on both
  // this background and white, and doesn't collide with "good" — that's
  // green-700 now, not #1B3A2D.
  'no-data': {
    text: 'text-[#1B3A2D]/70',
    bg: 'bg-[#F3F6F4]',
    dot: 'bg-[#EFE9DB]',
    bar: 'bg-[#EFE9DB]',
  },
};

export const STATUS_LABEL: Record<MetricStatus, string> = {
  good: 'Good',
  attention: 'Needs attention',
  poor: 'Poor',
  'no-data': 'No data',
};

/** Shared shape for a direct 1-5 scale (higher = better): mood, energy, sleep quality, digestion. */
function directFivePointStatus(level: number | null): MetricStatus {
  if (level === null) return 'no-data';
  if (level >= 4) return 'good';
  if (level === 3) return 'attention';
  return 'poor';
}

export const moodStatus = directFivePointStatus;
export const energyStatus = directFivePointStatus;
export const sleepQualityStatus = directFivePointStatus;
export const digestionStatus = directFivePointStatus;

/** Inverse 1-5 scale (lower = better): stress. */
export function stressStatus(level: number | null): MetricStatus {
  if (level === null) return 'no-data';
  if (level <= 2) return 'good';
  if (level === 3) return 'attention';
  return 'poor';
}

/** Inverse 0-5 scale (lower = better): pain/discomfort. */
export function painStatus(level: number | null): MetricStatus {
  if (level === null) return 'no-data';
  if (level === 0) return 'good';
  if (level <= 2) return 'attention';
  return 'poor';
}

export function sleepDurationStatus(
  duration: '<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+' | null
): MetricStatus {
  if (duration === null) return 'no-data';
  if (duration === '7-8h' || duration === '8h+') return 'good';
  if (duration === '5-6h' || duration === '6-7h') return 'attention';
  return 'poor'; // <5h
}

/** Cups logged today against the 8-cup goal shown on the tracker. */
export function waterStatus(cups: number | null): MetricStatus {
  if (cups === null) return 'no-data';
  if (cups >= 6) return 'good';
  if (cups >= 3) return 'attention';
  return 'poor';
}

export function movementStatus(
  level: 'none' | 'light' | 'moderate' | 'full_session' | null
): MetricStatus {
  if (level === null) return 'no-data';
  if (level === 'moderate' || level === 'full_session') return 'good';
  if (level === 'light') return 'attention';
  return 'poor'; // none
}
