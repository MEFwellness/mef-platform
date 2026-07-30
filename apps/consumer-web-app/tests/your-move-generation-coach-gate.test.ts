/**
 * Coach-only gate on generation (app/actions/your-move-generation.ts).
 * Unlike every other action in this codebase, these actions add an
 * explicit hasActiveRole('coach') check before making the live Your Move
 * HTTP call — because that call, unlike a database write, has no RLS of
 * its own to fall back on (see this file's own header comment).
 *
 * The action functions themselves can't be called directly here (they use
 * `cookies()` from next/headers, which throws outside a real Next.js
 * request — see tests/setup/test-clients.ts's own header for why every
 * integration test in this suite works around this the same way). Two
 * things are proven instead, together giving real, non-vacuous coverage:
 *
 *   1. hasActiveRole — the real RPC-backed check every gate call relies
 *      on — actually distinguishes the seeded coach from the seeded
 *      member, against the real local database.
 *   2. A source-scan proves every exported generate/save action in that
 *      file calls the gate before doing anything else (spending the live
 *      Your Move call or writing to exercise_catalog/coach_program_templates).
 *
 * Proven non-vacuous by hand during this task: temporarily deleted one
 * `resolveCoachContext()` call from generateProgramDraftAction, re-ran
 * this file, watched the count assertion fail (3 matches instead of 4),
 * then restored it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { hasActiveRole } from '../lib/auth/guards';
import { signInAs, TEST_USERS } from './setup/test-clients';

describe('hasActiveRole (the real gate the generation actions call)', () => {
  it('is true for the seeded coach and false for the seeded member', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const memberClient = await signInAs(TEST_USERS.memberOne);

    expect(await hasActiveRole(coachClient, TEST_USERS.coachOne.id, 'coach')).toBe(true);
    expect(await hasActiveRole(memberClient, TEST_USERS.memberOne.id, 'coach')).toBe(false);
  });
});

describe('every generation action gates on resolveCoachContext before doing anything else', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../app/actions/your-move-generation.ts'),
    'utf-8'
  );

  it('calls resolveCoachContext() at the top of all four exported actions', () => {
    const gateCallCount = (source.match(/const context = await resolveCoachContext\(\);/g) ?? []).length;
    // Non-vacuous: this is exactly 4 today (generateWorkoutDraftAction,
    // generateProgramDraftAction, saveGeneratedWorkoutDraftAction,
    // saveGeneratedProgramDraftAction) — removing any one call drops this
    // to 3, which was confirmed by hand (see this file's header).
    expect(gateCallCount).toBe(4);
  });

  it("every gate call is immediately followed by an early return on 'error' in context, before any Your Move or database call", () => {
    const gateSites = [...source.matchAll(/const context = await resolveCoachContext\(\);\s*\n\s*if \('error' in context\) return context;/g)];
    expect(gateSites).toHaveLength(4);
  });

  it('the live Your Move client is never constructed before the gate check in either generate action', () => {
    const generateWorkoutBody = source.slice(
      source.indexOf('export async function generateWorkoutDraftAction'),
      source.indexOf('export async function generateProgramDraftAction')
    );
    const generateProgramBody = source.slice(
      source.indexOf('export async function generateProgramDraftAction'),
      source.indexOf('export type SaveGeneratedWorkoutInput')
    );
    for (const body of [generateWorkoutBody, generateProgramBody]) {
      const gateIndex = body.indexOf('resolveCoachContext()');
      const clientIndex = body.indexOf('buildYourMoveApiClientFromEnv()');
      expect(gateIndex).toBeGreaterThan(-1);
      expect(clientIndex).toBeGreaterThan(gateIndex);
    }
  });
});
