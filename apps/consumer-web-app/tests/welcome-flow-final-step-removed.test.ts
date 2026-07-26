/**
 * Daily Check-In redesign, "intro page merge" (task requirement 5) — the
 * standalone "Let's Begin With Today" closing screen of the welcome flow
 * is gone; its copy now lives as a one-time intro on the check-in's own
 * Screen 1 (isFirstCheckin in CheckinForm.tsx) instead. Static-scan guard
 * (same pattern as tests/energy-forecast-anchoring.test.ts) so a future
 * edit can't silently reintroduce the old closing screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WELCOME_FLOW_SOURCE = readFileSync(
  path.resolve(__dirname, '../app/welcome/WelcomeFlow.tsx'),
  'utf-8'
);
const CHECKIN_FORM_SOURCE = readFileSync(
  path.resolve(__dirname, '../app/checkin/CheckinForm.tsx'),
  'utf-8'
);

describe('the welcome flow no longer has its own closing screen', () => {
  it('WelcomeFlow.tsx has no PageFinal component or FINAL_STEP constant', () => {
    expect(WELCOME_FLOW_SOURCE.includes('PageFinal')).toBe(false);
    expect(WELCOME_FLOW_SOURCE.includes('FINAL_STEP')).toBe(false);
  });

  it('the "Let\'s Begin With Today" copy is gone from the welcome flow', () => {
    expect(WELCOME_FLOW_SOURCE.includes('Begin With Today')).toBe(false);
  });

  it('TOTAL_STEPS was decremented to 9 (was 10 with the closing screen)', () => {
    expect(/TOTAL_STEPS\s*=\s*9/.test(WELCOME_FLOW_SOURCE)).toBe(true);
  });

  it('selecting a primary goal (or auto-promoting a lone selection) finishes the flow directly via handleFinish', () => {
    expect(WELCOME_FLOW_SOURCE.includes('void handleFinish(')).toBe(true);
  });
});

describe('the check-in\'s own first-time intro replaces it', () => {
  it("CheckinForm.tsx shows the two intro lines only when isFirstCheckin", () => {
    expect(CHECKIN_FORM_SOURCE.includes('Your first check-in sets your starting point.')).toBe(true);
    expect(CHECKIN_FORM_SOURCE.includes('There are no perfect answers. Just answer honestly.')).toBe(true);
    expect(CHECKIN_FORM_SOURCE.includes('index === 0 && isFirstCheckin &&')).toBe(true);
  });
});
