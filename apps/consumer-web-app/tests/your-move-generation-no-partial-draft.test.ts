/**
 * "If the endpoint fails or is blocked... show a clear message and change
 * nothing — no partial drafts." A source-scan, for the same reason
 * your-move-generation-coach-gate.test.ts uses one: the actions
 * themselves can't be invoked directly here (cookies() outside a Next.js
 * request scope).
 *
 * What this proves: in both generateWorkoutDraftAction and
 * generateProgramDraftAction, the try block's only calls that can produce
 * a "draft" are the Your Move client call followed immediately by the
 * mapper (generatedWorkoutToDraft/generatedProgramToDraft, which is what
 * writes new exercise_catalog rows) — and the catch block does nothing
 * but log the failure and return an error, never reaching the mapper.
 * Since the mapper is the only thing in this file that touches
 * exercise_catalog, "the catch block never calls it" is equivalent to
 * "a failed generation call writes nothing."
 *
 * Proven non-vacuous by hand during this task: temporarily added a call
 * to `generatedWorkoutToDraft(...)` inside generateWorkoutDraftAction's
 * catch block, re-ran this file, watched it fail, then removed it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(path.resolve(__dirname, '../app/actions/your-move-generation.ts'), 'utf-8');

function actionBody(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('a failed generation call never produces a partial draft', () => {
  it('generateWorkoutDraftAction: the catch block only logs and returns an error, never calls the mapper', () => {
    const body = actionBody(
      'export async function generateWorkoutDraftAction',
      'export type GenerateProgramParams'
    );
    const catchBlock = body.slice(body.indexOf('} catch (err) {'));
    expect(catchBlock).toContain("logGeneration(context.supabase, context.userId, 'workout'");
    expect(catchBlock).toContain('return { error: message };');
    expect(catchBlock).not.toContain('generatedWorkoutToDraft');
    expect(catchBlock).not.toContain('exercise_catalog');
  });

  it('generateProgramDraftAction: the catch block only logs and returns an error, never calls the mapper', () => {
    const body = actionBody(
      'export async function generateProgramDraftAction',
      'export type SaveGeneratedWorkoutInput'
    );
    const catchBlock = body.slice(body.indexOf('} catch (err) {'));
    expect(catchBlock).toContain("logGeneration(context.supabase, context.userId, 'program'");
    expect(catchBlock).toContain('return { error: message };');
    expect(catchBlock).not.toContain('generatedProgramToDraft');
    expect(catchBlock).not.toContain('exercise_catalog');
  });

  it('the mapper is only ever called after a successful client.generate*() resolves, inside the try block', () => {
    const workoutBody = actionBody('export async function generateWorkoutDraftAction', 'export type GenerateProgramParams');
    const generateCallIndex = workoutBody.indexOf('await client.generateWorkout(params)');
    const mapperCallIndex = workoutBody.indexOf('generatedWorkoutToDraft(context.supabase, workout)');
    expect(generateCallIndex).toBeGreaterThan(-1);
    expect(mapperCallIndex).toBeGreaterThan(generateCallIndex);

    const programBody = actionBody('export async function generateProgramDraftAction', 'export type SaveGeneratedWorkoutInput');
    const programGenerateIndex = programBody.indexOf('await client.generateProgram(');
    const programMapperIndex = programBody.indexOf('generatedProgramToDraft(context.supabase, program, params.weeks)');
    expect(programGenerateIndex).toBeGreaterThan(-1);
    expect(programMapperIndex).toBeGreaterThan(programGenerateIndex);
  });
});

describe('a failed multi-day program save rolls back every day already created in that same attempt', () => {
  it('saveGeneratedProgramDraftAction deletes every previously-created day template before returning an error', () => {
    const body = actionBody('export async function saveGeneratedProgramDraftAction', 'export type { GeneratedDraftSection }');
    const deleteOnFailureCount = (body.match(/for \(const id of createdIds\) await deleteTemplate\(context\.supabase, id\);/g) ?? [])
      .length;
    // One rollback site for a failed template create, one for a failed
    // content save — both partial-save paths, not just one of them.
    expect(deleteOnFailureCount).toBe(2);
  });
});
