/**
 * Adaptive Difficulty (Part 8) — gradually nudges today's suggested
 * challenge easier when recent adherence has been poor, or offers an
 * optional stretch when it's been strong. Deterministic, rule-based text
 * scaling over the content library's own authored suggested_action text —
 * never a rewrite of that text (it stays exactly as written and
 * clinically reviewed; see supabase/seed/06_mef_content_library.sql), and
 * never an LLM. This only ever adds a short, clearly-optional coaching
 * note alongside it.
 *
 * Requires a minimum sample of real recent feed history before adjusting
 * anything at all — same "don't guess from too little data" discipline as
 * lib/wellness/insights.ts's MIN_CHECKINS_FOR_TREND and
 * lib/narrative/generator.ts's MIN_SAMPLE_PER_BUCKET.
 */

import type { DailyFeedItem } from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from './dateMath';

export type AdherenceLevel = 'low' | 'high' | 'typical';

export type AdherenceInfo = {
  level: AdherenceLevel;
  rate: number | null;
  sampleSize: number;
};

const MIN_SAMPLE = 5;
const LOW_THRESHOLD = 0.4;
const HIGH_THRESHOLD = 0.8;
const WINDOW_DAYS = 7;

/** Completion rate over the last WINDOW_DAYS days (excluding today, which isn't decided yet). */
export function computeAdherence(
  historyPairs: { feedItem: Pick<DailyFeedItem, 'local_date' | 'completed_at'> }[],
  todayLocalDate: string
): AdherenceInfo {
  const cutoff = addDaysToLocalDate(todayLocalDate, -WINDOW_DAYS);
  const windowItems = historyPairs.filter(
    ({ feedItem }) => feedItem.local_date >= cutoff && feedItem.local_date < todayLocalDate
  );
  const sampleSize = windowItems.length;
  if (sampleSize < MIN_SAMPLE) return { level: 'typical', rate: null, sampleSize };

  const completed = windowItems.filter(({ feedItem }) => feedItem.completed_at).length;
  const rate = completed / sampleSize;
  if (rate < LOW_THRESHOLD) return { level: 'low', rate, sampleSize };
  if (rate >= HIGH_THRESHOLD) return { level: 'high', rate, sampleSize };
  return { level: 'typical', rate, sampleSize };
}

/**
 * Matches the content library's real duration phrasing: a plain "5
 * minutes", a range "3-5 minutes"/"5-10 minute" (first/lower number used),
 * or a hyphenated compound "10-minute" (no space before the word) — see
 * supabase/seed/06_mef_content_library.sql's suggested_action text for all
 * three forms in the wild.
 */
const DURATION_PATTERN = /(\d+)(?:-\d+)?[\s-]*(?:minutes?|mins?)/i;

/**
 * An optional, clearly-labeled adjustment note for today's challenge —
 * null when adherence is 'typical' or there isn't enough history to judge
 * (computeAdherence already encodes both as 'typical'). Parses a real
 * duration out of the content's own suggested_action text when present
 * rather than inventing one; falls back to a duration-agnostic framing
 * when the text has no parseable number.
 */
export function buildAdaptiveNote(suggestedAction: string, level: AdherenceLevel): string | null {
  if (level === 'typical') return null;

  const match = suggestedAction.match(DURATION_PATTERN);
  const original = match ? parseInt(match[1]!, 10) : null;

  if (level === 'low') {
    if (original !== null && original > 2) {
      const easier = Math.max(2, Math.min(original - 1, Math.round(original / 2)));
      return `Consistency has been tough lately — a smaller version is enough today: try about ${easier} minute${easier === 1 ? '' : 's'} instead.`;
    }
    return 'Consistency has been tough lately — an easier version is enough today. Just starting counts.';
  }

  // level === 'high'
  if (original !== null) {
    const stretch = original + Math.max(2, Math.round(original * 0.3));
    return `You've been consistent lately — if it feels right today, try stretching it to about ${stretch} minutes.`;
  }
  return "You've been consistent lately — if today feels good, feel free to push a little further than usual.";
}
