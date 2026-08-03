/**
 * Root Presence System (Prompt 4), requirement 4: Memory Callbacks.
 * Every context type here is built entirely from real, already-persisted
 * rows (see data.ts) — a null field means the data genuinely doesn't
 * exist for this member, never a placeholder. copy.ts's builders return
 * `null` whenever the context they're given can't honestly support a
 * sentence, per the Honest Discovery Rule (Bible §7/§12).
 */

export type GoalCallbackContext = {
  /** A WELCOME_GOALS key (lib/welcome/goals.ts), or null if never chosen. */
  primaryGoal: string | null;
  /** Free text, only ever set when 'something_else' was among the selected goals. */
  goalsOther: string | null;
  createdAt: string;
};

export type TenureCallbackContext = {
  totalCheckins: number;
  /** Null only when totalCheckins is 0. */
  firstCheckinLocalDate: string | null;
  todayLocalDate: string;
};

export type Day3ContrastCallbackContext = {
  day3Response: 'going_well' | 'mixed' | 'not_started';
  /** e.g. "Core Values Snapshot experiment" — the real experience the day-3 answer came from. */
  experienceLabel: string;
};

export type FindingCallbackContext = {
  /** A real, already earned finding's member-facing sentence (lib/case-view/findings.ts's describeSignalForMember output) — never written here. */
  memberSentence: string;
  /** ISO timestamp of when the correlation engine last (re)computed this finding. */
  computedAt: string;
  todayLocalDate: string;
};
