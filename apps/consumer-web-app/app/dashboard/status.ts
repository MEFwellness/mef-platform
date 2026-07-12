/**
 * Status-color classification for dashboard metrics. Every function here
 * takes the same raw value already fetched via getTodaysCheckin/
 * getRecentCheckins (no new data source) and returns one of four bands:
 * good / attention / poor / no-data. Thresholds encode the direction each
 * metric actually runs in — stress and pain are inverse (low is good),
 * everything else here is direct (high is good).
 */

export type MetricStatus = 'good' | 'attention' | 'poor' | 'no-data';

export const STATUS_STYLES: Record<
  MetricStatus,
  { text: string; bg: string; dot: string; bar: string }
> = {
  good: { text: 'text-[#1B3A2D]', bg: 'bg-[#EFF6F1]', dot: 'bg-[#1B3A2D]', bar: 'bg-[#1B3A2D]' },
  attention: {
    text: 'text-[#854D0E]',
    bg: 'bg-[#FDF0D2]',
    dot: 'bg-[#F5B700]',
    bar: 'bg-[#F5B700]',
  },
  poor: { text: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', bar: 'bg-red-500' },
  'no-data': {
    text: 'text-[#6B7A72]',
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
