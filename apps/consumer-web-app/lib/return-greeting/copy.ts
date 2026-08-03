/**
 * Root Presence System (Prompt 4), requirement 5: the No-Guilt Return.
 * Two days off is normal check-in cadence (lib/feed/streakIntelligence.ts's
 * own `buildStreakMessage` already treats a 2-day gap as "no worries,
 * today's a great day to start again," rendered on the Today Tool page) —
 * three or more days is what this Bible calls a genuine "multi-day gap,"
 * worth a real one-time greeting rather than routine informational copy.
 * Zero mention of the gap length, a missed-day count, or a streak, per
 * the Bible's explicit "no guilt, ever" rule (§7).
 */

export const RETURN_GREETING_MIN_GAP_DAYS = 3;

export const RETURN_GREETING_TEXT = "I'm glad you're back.";
