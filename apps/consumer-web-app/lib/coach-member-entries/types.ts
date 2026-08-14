/**
 * Coach Member Detail: the shapes for "what this member actually entered".
 *
 * THE ONE RULE THIS FEATURE EXISTS TO KEEP. Everything here is something a
 * member typed, tapped or chose. Nothing on this screen is computed,
 * inferred, scored, correlated or generated. Where the product already
 * derives something from these answers (a Root Score, a driver state, a
 * correlation, a pattern) that lives in Case View and the intelligence
 * panels, and this screen links to those rather than restating them.
 *
 * THE OTHER RULE. An answer that was never given is never rendered as a
 * blank, a dash, or a zero. Every value that can be absent is modelled as
 * explicitly absent, so the screen can say "Not answered" and mean it. A
 * member who skipped the stress question and a member who rated her stress
 * lowest must never look the same to a coach.
 */

/** A single question and what she answered, ready to render. */
export type EnteredAnswer = {
  key: string;
  /** The question as she was asked it, not a shortened column name. */
  question: string;
  /** Her answer in words, or null when she did not answer it. */
  answer: string | null;
  /** Set when the answer is free text she wrote herself, so it can be rendered as a quote. */
  freeText?: boolean;
};

/** One day's check-in, with every question that was part of it. */
export type CheckinEntry = {
  localDate: string;
  recordedAt: string;
  /** Set when she went back and changed the day's answers. */
  editedAt: string | null;
  /** The fixed check-in questions. Always the same list, so a skipped one is visible as skipped. */
  answers: EnteredAnswer[];
  /** The morning readiness questions, only put to her on a morning check-in. Empty when she answered none of them, so a day is not shown as six skips it was never asked. */
  readiness: EnteredAnswer[];
  /** The adaptive driver questions she was actually shown that day. Varies by day, by design. */
  probeAnswers: EnteredAnswer[];
  /** Her own free-text note for the day, verbatim, or null. */
  note: string | null;
  /** She told the check-in something was new or getting worse. Her own flag, not a derived one. */
  flaggedNewOrWorseningConcern: boolean;
};

/** A completed questionnaire or experience, listed rather than re-rendered. */
export type CompletedSubmission = {
  id: string;
  title: string;
  /** What kind of thing it was, in words a coach uses. */
  kind: string;
  completedAt: string;
  /** Where her actual answers already render in full. Null when there is no reader for this kind. */
  href: string | null;
  /** Said on the row when there is no href, so a missing link is explained rather than just absent. */
  noReaderReason?: string;
};

/** One goal selection, as she made it. Insert-only, so a change is a new row and both stay visible. */
export type GoalEntry = {
  id: string;
  createdAt: string;
  /** Her full selected set, in her own labels. */
  goals: string[];
  /** The one she said mattered most, or null when that was never asked. */
  primaryGoal: string | null;
  /** Her verbatim "something else" text, or null. */
  goalsOther: string | null;
  /** Which screen she entered it on, in plain language. */
  source: string;
};

/** One thing she said to Root, or Root said back. */
export type ConversationEntry = {
  id: string;
  sessionId: string;
  role: 'member' | 'root';
  content: string;
  createdAt: string;
};

export type ConversationSessionEntry = {
  id: string;
  startedAt: string;
  messages: ConversationEntry[];
};

/**
 * Every section can fail or be empty independently. `available: false` means
 * the read did not run, which is a different fact from an empty section and
 * is rendered differently.
 */
export type SectionResult<T> =
  | { available: true; items: T[] }
  | { available: false; reason: string };

export type MemberEntries = {
  memberId: string;
  displayName: string | null;
  checkins: SectionResult<CheckinEntry>;
  submissions: SectionResult<CompletedSubmission>;
  goals: SectionResult<GoalEntry>;
  conversations: SectionResult<ConversationSessionEntry>;
  /** How far back the check-in and conversation reads went. */
  range: { start: string; end: string; days: number };
};
