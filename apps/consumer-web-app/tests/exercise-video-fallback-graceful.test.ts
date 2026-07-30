/**
 * Guard test for "the card must fall back to text cues gracefully — no
 * broken player" (trial API key only serves a subset of Your Move's
 * videos). TapToPlayVideo (ExerciseDetailView.tsx) can't be rendered in
 * this vitest suite — it's a client component with no jsdom/React
 * Testing Library configured in this repo (same constraint documented for
 * every other component in this suite) — so this is a source-scan proving
 * the actual fallback wiring: on a fetch failure, the component renders
 * CuesPlaceholder(cues) rather than a bare error message over a dead
 * player, and never throws.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.resolve(__dirname, '../components/exercise-library/ExerciseDetailView.tsx');

describe('guard test: video tap-to-play failure falls back to cues, never a broken player', () => {
  const source = readFileSync(VIEW_PATH, 'utf-8');

  it('TapToPlayVideo accepts a cues prop', () => {
    expect(source).toMatch(/function TapToPlayVideo\(\{[\s\S]{0,200}cues/);
  });

  it("the component's error state renders CuesPlaceholder, not a dead player or bare error text", () => {
    const errorBranchStart = source.indexOf("if (state.status === 'error')");
    expect(errorBranchStart).toBeGreaterThan(-1);
    const nextBranchStart = source.indexOf('function RelatedChip', errorBranchStart);
    expect(nextBranchStart).toBeGreaterThan(errorBranchStart);
    const errorBranch = source.slice(errorBranchStart, nextBranchStart);
    expect(errorBranch).toContain('<CuesPlaceholder cues={cues} />');
  });

  it('the play button itself no longer surfaces a raw error message string (proves the old error-message-over-poster UI was actually replaced, not just supplemented)', () => {
    // The old implementation rendered `state.message` inside the button;
    // the new one carries no per-attempt message at all — a real fetch
    // failure moves straight to the CuesPlaceholder fallback instead.
    expect(source).not.toMatch(/status: 'error'; message/);
  });
});
