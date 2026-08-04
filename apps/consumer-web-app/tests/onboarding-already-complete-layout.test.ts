/**
 * FIX 3 guard (2026-08-03): the "Onboarding already complete" state used
 * to be a heading and one paragraph pinned to the top of a blank screen,
 * with two easy-to-miss underlined text links. This is a source-scan test
 * (same convention as tests/checkin-chrome-screen-one-only.test.ts) rather
 * than a render test, since SSR component tests don't work in this repo.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const pageSrc = fs.readFileSync(
  path.resolve(__dirname, '../app/onboarding/page.tsx'),
  'utf8'
);

function alreadyCompleteBlock(): string {
  const start = pageSrc.indexOf('Onboarding already complete');
  const end = pageSrc.indexOf('const questions = await getOnboardingAssessmentBank();');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return pageSrc.slice(start, end);
}

describe('onboarding "already complete" state layout', () => {
  it('is wrapped in CenterStage, not left hugging the top of the screen', () => {
    // The nearest CenterStage open tag before the heading must not have
    // any other component's closing tag between them.
    const headingIndex = pageSrc.indexOf('Onboarding already complete');
    const centerStageIndex = pageSrc.lastIndexOf('<CenterStage', headingIndex);
    expect(centerStageIndex).toBeGreaterThan(-1);
  });

  it('uses two real buttons (primary + secondary), not underlined text links', () => {
    const block = alreadyCompleteBlock();
    expect(block).toContain('PRIMARY_BUTTON');
    expect(block).toContain('SECONDARY_BUTTON');
    expect(block).not.toContain('underline underline-offset-2');
  });

  it('primary button goes to today’s check-in, secondary reviews the Baseline Assessment', () => {
    const block = alreadyCompleteBlock();
    expect(block).toContain('href="/checkin"');
    expect(block).toContain("Go to today");
    expect(block).toContain('href="/profile/baseline"');
    expect(block).toContain('Review your Baseline Assessment');
  });

  it('the primary button is a solid dark green pill and the secondary is outlined', () => {
    expect(pageSrc).toContain("const PRIMARY_BUTTON =\n  'flex w-full items-center justify-center rounded-full bg-[#1B3A2D]");
    expect(pageSrc).toContain(
      "const SECONDARY_BUTTON =\n  'flex w-full items-center justify-center rounded-full border-2 border-[#1B3A2D]"
    );
  });
});
