/**
 * Guard test for the branded video-poster placeholder (replaces the blank
 * gray box a video-tier card showed before poster extraction has run for
 * it). VideoPosterPlaceholder.tsx and ExerciseCard.tsx/ExerciseDetailView.tsx
 * are client components with no jsdom/React Testing Library configured in
 * this repo (same constraint documented for every other component in this
 * suite — see exercise-video-fallback-graceful.test.ts) — so this is a
 * source-scan proving the actual wiring, not a render test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CARD_PATH = path.resolve(__dirname, '../components/exercise-library/ExerciseCard.tsx');
const DETAIL_PATH = path.resolve(__dirname, '../components/exercise-library/ExerciseDetailView.tsx');
const PLACEHOLDER_PATH = path.resolve(__dirname, '../components/exercise-library/VideoPosterPlaceholder.tsx');
// TapToPlayVideo was extracted out of ExerciseDetailView into its own
// file when Root Movement Level 1 needed the identical player inside a
// session. Same component, same behaviour, one file over.
const PLAYER_PATH = path.resolve(__dirname, '../components/exercise-library/TapToPlayVideo.tsx');

const cardSource = readFileSync(CARD_PATH, 'utf-8');
const detailSource = readFileSync(DETAIL_PATH, 'utf-8');
const placeholderSource = readFileSync(PLACEHOLDER_PATH, 'utf-8');
const playerSource = readFileSync(PLAYER_PATH, 'utf-8');

describe('guard test: video grid card shows the branded placeholder, not a blank box, until a real poster exists', () => {
  it('ExerciseCard imports VideoPosterPlaceholder', () => {
    expect(cardSource).toMatch(/import\s*\{\s*VideoPosterPlaceholder\s*\}\s*from\s*'\.\/VideoPosterPlaceholder'/);
  });

  it('renders the real <img> poster when posterUrl exists, and VideoPosterPlaceholder only when it does not — a proper either/or, not a stacked fallback', () => {
    const hasVideoBranchStart = cardSource.indexOf('{exercise.hasVideo ? (');
    expect(hasVideoBranchStart).toBeGreaterThan(-1);
    const cuesPlaceholderIndex = cardSource.indexOf('<CuesPlaceholder', hasVideoBranchStart);
    expect(cuesPlaceholderIndex).toBeGreaterThan(hasVideoBranchStart);
    const videoBranch = cardSource.slice(hasVideoBranchStart, cuesPlaceholderIndex);

    expect(videoBranch).toMatch(/exercise\.posterUrl\s*\?\s*\(/);
    expect(videoBranch).toContain('<img');
    expect(videoBranch).toContain('src={exercise.posterUrl}');
    expect(videoBranch).toContain('<VideoPosterPlaceholder exercise={exercise} />');
  });

  it('the old truthy-only poster render (posterUrl && <img/>, silently rendering nothing on a miss) is gone from the card', () => {
    expect(cardSource).not.toMatch(/\{exercise\.posterUrl\s*&&\s*\(/);
  });

  it("the cues-only branch (no video at all) is untouched — this change is video cards only", () => {
    expect(cardSource).toContain('<CuesPlaceholder cues={exercise.cues} />');
  });
});

describe('guard test: exercise detail tap-to-play surface shows the branded placeholder, not a blank #EFF6F1 box', () => {
  it('the detail view still reaches VideoPosterPlaceholder through the player it renders', () => {
    expect(detailSource).toMatch(/import\s*\{\s*TapToPlayVideo\s*\}\s*from\s*'\.\/TapToPlayVideo'/);
    expect(playerSource).toMatch(/import\s*\{\s*VideoPosterPlaceholder\s*\}\s*from\s*'\.\/VideoPosterPlaceholder'/);
  });

  it('TapToPlayVideo renders VideoPosterPlaceholder in its no-poster branch', () => {
    const fnStart = playerSource.indexOf('export function TapToPlayVideo(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = playerSource.slice(fnStart);

    expect(fnBody).toContain('<VideoPosterPlaceholder exercise={{ name, primaryMuscle, category }} />');
  });

  it('the old blank gray placeholder div is gone from the detail view', () => {
    expect(detailSource).not.toContain('<div className="h-full w-full bg-[#EFF6F1]" />');
  });

  it('TapToPlayVideo is called with the fields VideoPosterPlaceholder needs (name/primaryMuscle/category), not just externalId/posterUrl/cues', () => {
    const callSite = detailSource.slice(detailSource.indexOf('<TapToPlayVideo'), detailSource.indexOf('<TapToPlayVideo') + 400);
    expect(callSite).toContain('name={exercise.name}');
    expect(callSite).toContain('primaryMuscle={exercise.primaryMuscle}');
    expect(callSite).toContain('category={exercise.category}');
  });
});

describe('guard test: placeholder design stays inside the brand palette and does not draw a second play button', () => {
  it('uses only the three approved brand hex colors (forest green #1B3A2D, warm gold #C4A050, cream #F5F0E4) — no other literal colors', () => {
    const hexMatches = placeholderSource.match(/#[0-9A-Fa-f]{6}/g) ?? [];
    expect(hexMatches.length).toBeGreaterThan(0); // non-vacuous: the file does use literal hex colors
    const allowed = new Set(['1b3a2d', 'c4a050', 'f5f0e4']);
    for (const hex of hexMatches) {
      expect(allowed.has(hex.slice(1).toLowerCase())).toBe(true);
    }
  });

  it('renders the exercise name in Cormorant Garamond', () => {
    expect(placeholderSource).toContain('font-[family-name:var(--font-cormorant-garamond)]');
    expect(placeholderSource).toMatch(/\{exercise\.name\}/);
  });

  it('does not render its own play button — both call sites already layer one on top, a second would be a duplicate', () => {
    expect(placeholderSource).not.toMatch(/PlayCircle/);
  });

  it('has a distinct visual mark for every body region bodyRegions.ts can resolve, plus a default for everything else (non-vacuous: exactly 5 case branches)', () => {
    const caseMatches = placeholderSource.match(/case\s+'(upper_body|lower_body|core|full_body)':/g) ?? [];
    expect(new Set(caseMatches).size).toBe(4);
    expect(placeholderSource).toContain('default:');
  });
});
