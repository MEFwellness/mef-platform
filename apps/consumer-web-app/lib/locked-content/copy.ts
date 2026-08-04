/**
 * Coach-Assign-Only Gating task (2026-08-04) — the one message shown when
 * a member taps a locked, coach-assign-only card (a registry questionnaire
 * or the Body Assessment they haven't been assigned yet). Deliberately one
 * shared constant, not per-assessment copy: the reason is always the same
 * ("this is unlocked by your coach"), so varying the wording per
 * assessment would only add inconsistency, not information. Root's own
 * first-person voice (see docs/motion-experience-bible.md §15's voice
 * audit), short, warm, no em dash, no upsell/pressure language.
 */
export const COACH_LOCK_NOTE_TITLE = 'A note from Root';

export const COACH_LOCK_NOTE_MESSAGE =
  "This one opens once your coach assigns it to you. I'll let you know the moment it's ready.";
