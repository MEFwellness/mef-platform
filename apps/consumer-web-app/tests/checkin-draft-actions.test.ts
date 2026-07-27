/**
 * A draft (exit-triggered) save must persist real data but never claim
 * "this check-in genuinely happened" to the rest of the app — no
 * morning_readiness_recorded/evening_reflection_recorded event, no AI
 * dispatch, no timeline entry, no Root Score recalculation, no forecast
 * commit. app/actions/checkin.ts and app/actions/eveningReflection.ts
 * both require Next's request scope (cookies() via next/headers) to run,
 * which this vitest environment doesn't provide (same constraint every
 * other action-layer test in this repo works around — see
 * dashboard-data.test.ts's own comment on why it only calls the one pure
 * export), so this is a static scan of the action source itself,
 * confirming the draft path's function body omits exactly the calls the
 * real submit path makes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, `"${signature}" not found`).toBeGreaterThan(-1);
  // Up to the next top-level export, or end of file.
  const nextExport = src.indexOf('\nexport ', start + signature.length);
  return src.slice(start, nextExport === -1 ? undefined : nextExport);
}

const CHECKIN_ACTIONS = source('app/actions/checkin.ts');
const EVENING_ACTIONS = source('app/actions/eveningReflection.ts');

describe('saveDailyCheckinDraft omits the "this genuinely happened" side effects submitDailyCheckin fires', () => {
  const realSubmit = functionBody(CHECKIN_ACTIONS, 'export async function submitDailyCheckin(');
  const draft = functionBody(CHECKIN_ACTIONS, 'export async function saveDailyCheckinDraft(');

  it('the real submit path fires the completion event, AI dispatch, and Root Score recalculation', () => {
    expect(realSubmit).toContain("eventType: 'morning_readiness_recorded'");
    expect(realSubmit).toContain('emitAndDispatch(');
    expect(realSubmit).toContain('getOrCalculateRootScore(');
  });

  it('the draft path fires none of those three', () => {
    expect(draft).not.toContain('morning_readiness_recorded');
    expect(draft).not.toContain('emitAndDispatch(');
    expect(draft).not.toContain('getOrCalculateRootScore(');
  });

  it('both paths still insert the same versioned row via insertCheckinRow (a draft is a real, if partial, write)', () => {
    expect(realSubmit).toContain('insertCheckinRow(');
    expect(draft).toContain('insertCheckinRow(');
  });

  it('the draft path still runs safety screening — never skipped, same discipline as everywhere else', () => {
    expect(draft).toContain('evaluateConcern(');
  });

  it('the draft path always writes completion_seconds: null — a draft is never a timed completion', () => {
    expect(draft).toMatch(/completion_seconds:\s*null/);
  });
});

describe('saveEveningReflectionDraft omits the completion event, timeline entry, and forecast commit submitEveningReflection fires', () => {
  const realSubmit = functionBody(EVENING_ACTIONS, 'export async function submitEveningReflection(');
  const draft = functionBody(EVENING_ACTIONS, 'export async function saveEveningReflectionDraft(');

  it('the real submit path fires the completion event, the timeline entry, and forecast recording', () => {
    expect(realSubmit).toContain("eventType: 'evening_reflection_recorded'");
    expect(realSubmit).toContain('recordTimelineEvent(');
    expect(realSubmit).toContain('recordForecastsFromEveningReflection(');
  });

  it('the draft path fires none of those three — a half-made forecast guess must never be permanently locked in by an exit', () => {
    expect(draft).not.toContain('evening_reflection_recorded');
    expect(draft).not.toContain('recordTimelineEvent(');
    expect(draft).not.toContain('recordForecastsFromEveningReflection(');
  });

  it('both paths share the same upsert helper (a draft is a real, if partial, write)', () => {
    expect(realSubmit).toContain('upsertEveningReflectionRow(');
    expect(draft).toContain('upsertEveningReflectionRow(');
  });

  it('the draft path still runs safety screening on symptoms_or_changes — never skipped', () => {
    expect(draft).toContain('evaluateConcern(');
  });
});

describe('water and movement leave the check-in, reusing existing systems (task requirement 4)', () => {
  const EVENTS_ACTIONS = source('app/actions/events.ts');

  it('logMovementLevel writes through the existing submitEveningBodyCheckin resubmission path, not a new/parallel write', () => {
    const fn = functionBody(EVENTS_ACTIONS, 'export async function logMovementLevel(');
    expect(fn).toContain('submitEveningBodyCheckin(');
  });

  it('logMovementLevel preserves the existing digestion_rating rather than clobbering it', () => {
    const fn = functionBody(EVENTS_ACTIONS, 'export async function logMovementLevel(');
    expect(fn).toContain('existing?.digestion_rating ?? null');
  });

  it('water_cups is re-read live on every submission (submitEveningBodyCheckin), so a Today water tap survives a later check-in submit unclobbered', () => {
    expect(CHECKIN_ACTIONS).toContain('water_cups: await getTodaysHydrationTotal()');
  });

  it('neither check-in form asks about water or movement anymore (water_cups is still submitted — read live, never asked as a question)', () => {
    const morningForm = source('app/checkin/CheckinForm.tsx');
    const eveningForm = source('app/checkin/evening/EveningReflectionForm.tsx');
    expect(morningForm).toContain('water_cups: await getTodaysHydrationTotal()');
    expect(morningForm.toLowerCase()).not.toContain('how much did you move');
    expect(eveningForm.toLowerCase()).not.toContain('how much did you move');
    expect(eveningForm.toLowerCase()).not.toContain('how was your digestion');
  });
});
