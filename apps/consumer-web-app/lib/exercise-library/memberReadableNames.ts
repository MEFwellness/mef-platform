/**
 * The vendor plumbing that must never reach a name a member reads.
 *
 * CLAUDE.md's naming rule: "An exercise name a member can read describes the
 * MOVEMENT... it never carries vendor plumbing: no (L) / (R) side suffixes,
 * no provider ids, no internal variant codes." Migration 176 fixed the first
 * of these by hand; migration 182 swept the remaining 119.
 *
 * This is the list that says what "plumbing" means, held in one place so the
 * migration's assertion and the guard test cannot drift into describing two
 * different rules. Each entry names the artefact and carries a real catalog
 * name that matched it before migration 182 ran, which the guard test uses
 * to prove the pattern is not dead.
 */

export type PlumbingPattern = {
  /** Short label used in failure output. */
  readonly label: string;
  readonly test: (name: string) => boolean;
  /** A real pre-182 catalog name that matched. */
  readonly example: string;
};

export const VENDOR_PLUMBING_PATTERNS: readonly PlumbingPattern[] = [
  {
    label: 'side marker',
    // The closing bracket is optional on purpose: the vendor shipped three
    // rows with it missing, e.g. "Standing Palm-In One-Arm Dumbbell Press (L".
    test: (n) => /\((?:L|R|l|r|left|right|Left|Right)\)?\s*$/.test(n),
    example: 'Calf stretch (left)',
  },
  {
    label: 'side marker mid-name',
    test: (n) => /\((?:L|R|left|right|Left|Right)\)/.test(n),
    example: 'Split squat (R) hold',
  },
  {
    label: 'trailing export code',
    test: (n) => /\s-\s*\d+\s*$/.test(n),
    example: 'Bent Over Two-Arm Long Bar Row - 105',
  },
  { label: 'double space', test: (n) => /\s{2}/.test(n), example: 'Jumping Ropes  skips' },
  { label: 'padded', test: (n) => n !== n.trim(), example: ' Squat ' },
  { label: 'underscore', test: (n) => n.includes('_'), example: 'Child_s pose -Lower back' },
  {
    label: 'note left to the vendor',
    test: (n) => /issue/i.test(n),
    example: 'Power Snatch (ISSUE_ back on pick up a bit bend)',
  },
  {
    label: 'export collision marker',
    test: (n) => /\(\s*\d+\s*\)\s*$/.test(n),
    example: 'Squats to knee(1)',
  },
  { label: 'lowercase start', test: (n) => /^[a-z]/.test(n), example: 'narrow squats chair' },
  {
    label: 'stray closing bracket',
    // Ends with ")" but nothing opened it: "Half squat get up )". A real
    // trailing parenthetical like "Bodyweight Squat (air squat)" is fine.
    test: (n) => /\)\s*$/.test(n) && !/\([^()]*\)\s*$/.test(n),
    example: 'Half squat get up )',
  },
  {
    label: 'unclosed bracket',
    test: (n) => /\((?![^(]*\))/.test(n),
    example: 'Normal grip pull ups (Full range of motion',
  },
  {
    label: 'DB / DBl abbreviation',
    test: (n) => /\bDBl?\b/.test(n),
    example: 'Standing One-Arm DBl Triceps Extension (R)',
  },
] as const;

/**
 * Rows that still match a pattern on purpose, each with the reason. Keyed by
 * external_id so a later rename cannot silently move an exemption onto a
 * different exercise.
 *
 * Cleaning "Bear plank shoulder taps - 30" means calling it either "Bear
 * Plank Shoulder Taps" (already a row) or "Plank Shoulder Taps" (also
 * already a row, and what its own description actually describes: feet
 * hip-width, a straight line from head to heels, which is not a bear plank).
 * Either way it needs a dedupe decision rather than a rename, so it keeps
 * its vendor suffix until it gets one.
 */
export const DEFERRED_PLUMBING_EXTERNAL_IDS: Readonly<Record<string, string>> = {
  'f2fef2bc-353c-4f3b-b7c3-ee5d63e2a87b':
    'Bear plank shoulder taps - 30: every clean name for it collides with an existing row, so this is a dedupe decision, not a rename.',
};

/** Every plumbing pattern a name matches. Empty means the name is clean. */
export function findVendorPlumbing(name: string): PlumbingPattern[] {
  return VENDOR_PLUMBING_PATTERNS.filter((p) => p.test(name));
}
