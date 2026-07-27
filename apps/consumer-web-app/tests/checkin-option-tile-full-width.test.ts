/**
 * UX fix batch 3, item 1: "Predict tomorrow" (the evening energy-forecast
 * question, app/checkin/evening/EveningReflectionForm.tsx) showed visibly
 * overlapping label text — "Exhauste[d]"/"Low" and "Moderat[e]"/"Good"
 * overlapping in a 5-option row. Root cause, confirmed live via
 * Playwright (real bounding-box measurements at 375px width, not just a
 * screenshot): `TapBleedTile`'s non-fullWidth variant never had `w-full`,
 * so the `<button>` sized itself to its own text content instead of
 * filling the `min-w-0 flex-1` column `ShortOptionRow` always wraps it
 * in — a 9-character word ("Exhausted") rendered at its full natural
 * width (~99px) inside a much narrower column (~61px) and visually
 * spilled into the next tile. Not a truncation bug (MAX_INLINE_LABEL_LENGTH
 * correctly let it stay inline at 9 chars, under the 10-char threshold);
 * an unconstrained-width one specific to 5-way rows.
 *
 * Fixed by adding `w-full` unconditionally to `TapBleedTile` — confirmed
 * safe for its only other caller (`StackedOptionRows`) since that one
 * already passes `fullWidth` (and therefore already got `w-full`) on
 * every tile. Verified live after the fix: real bounding boxes show a
 * consistent 8px gap (the row's own `gap-2`) between every pair of
 * adjacent tiles, not overlap — "Exhausted" and "Moderate" now wrap onto
 * multiple lines within their own column instead of spilling into the
 * next one.
 *
 * Audit (item 1's own "check elsewhere in the evening flow" ask), done
 * via a direct query against driver_probe_questions (not guesswork): the
 * only evening-screen (`screen = 'evening'`) single_select driver-probe
 * question is `checkin_probe.movement_today` (`none/light/moderate/
 * full_session`) — its longest label ("Full Session", 12 chars) already
 * exceeds MAX_INLINE_LABEL_LENGTH, so it renders via StackedOptionRows,
 * never ShortOptionRow, and was never at risk. Three morning-screen
 * questions (`room_temperature_comfort`, `session_intensity`,
 * `emotional_load_today`) do render via the row layout with 3-4 options
 * up to 10 chars — out of this item's "evening flow" scope to audit
 * further, but now covered by the same fix regardless, since it lives in
 * the one shared `TapBleedTile` component both paths render through.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment), so this is a static scan of the fixed source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const SHARED = source('components/checkin/scales/shared.tsx');
const STACKED = source('components/checkin/scales/StackedOptionRows.tsx');
const SHORT_ROW = source('components/checkin/scales/ShortOptionRow.tsx');

describe('TapBleedTile: always fills its column width, regardless of fullWidth', () => {
  it('w-full is unconditional — not inside the fullWidth ternary branch', () => {
    expect(SHARED).toMatch(/className=\{`mef-press relative isolate w-full overflow-hidden/);
  });

  it('the fullWidth ternary now only controls padding/text-align, not width', () => {
    expect(SHARED).toMatch(/fullWidth \? 'px-4 py-3\.5 text-left' : 'px-3\.5 py-2\.5 text-center'/);
    expect(SHARED).not.toMatch(/fullWidth \? 'w-full/);
  });

  it('the label span still wraps rather than truncating — the actual fix that lets long words fit inside the now-constrained width', () => {
    expect(SHARED).toContain('whitespace-normal break-words');
  });
});

describe('StackedOptionRows: unaffected — already passed fullWidth on every tile', () => {
  it('every TapBleedTile call still passes fullWidth', () => {
    expect(STACKED).toContain('fullWidth');
  });
});

describe('ShortOptionRow: unaffected structurally — still wraps every tile in a min-w-0 flex-1 column', () => {
  it('the flex column wrapper is unchanged', () => {
    expect(SHORT_ROW).toContain('min-w-0 flex-1');
  });
});
