/**
 * Discomfort gate + multi-select location redesign (2026-07-29).
 *
 * Two real UX bugs, both about a conditional question rendering without
 * its parent visibly answered:
 *   1. "Where is it, mainly?" (now "Where is the discomfort, mainly?")
 *      had NO parent at all — it opened the "Your body" screen
 *      unconditionally, so whatever rotating body-domain probe happened
 *      to land above it that day read as its (unrelated) parent.
 *   2. checkin_probe.digestive_symptom_type (requires digestion_rating
 *      <= 2) was pushed into CheckinForm's unit list via
 *      interleaveFollowUps *before* its own parent question
 *      (checkin_probe.digestion_rating, pushed later in source order),
 *      so on the "body" screen it could render above the very question
 *      that triggers it.
 *
 * Fix: a real "Any discomfort today?" gate (a required unit, its own
 * small heading) now owns the whole location/severity/aggravating-
 * factor block — nothing from it renders until the gate is answered
 * yes. digestionQuestion now pushes before the interleave loop so its
 * follow-up can never precede it. Location becomes a real multi-select
 * (a real day can hurt in more than one place), reusing
 * MultiOptionRows' own toggleMultiSelectValue exclusivity rule
 * (generalized to an overridable exclusive value) rather than
 * duplicating it.
 *
 * No component-rendering harness exists in this repo (plain 'node'
 * vitest environment, confirmed by every other check-in test file in
 * this suite) — behavioral claims about what actually renders are
 * static source-scans here, the same standing convention, verified
 * live via Playwright separately (reported alongside this task).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toggleMultiSelectValue } from '../components/checkin/scales/MultiOptionRows';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MORNING_FORM = source('app/checkin/CheckinForm.tsx');
const PAIN_SCREEN = source('components/checkin/BodySeverityOutline.tsx');

describe('toggleMultiSelectValue — generalized exclusiveValue (real pure-function behavior, not a string scan)', () => {
  it('default exclusiveValue ("none") is unchanged for every existing caller', () => {
    expect(toggleMultiSelectValue(['sugar_or_carbs'], 'salty')).toEqual(['sugar_or_carbs', 'salty']);
    expect(toggleMultiSelectValue(['sugar_or_carbs', 'salty'], 'none')).toEqual(['none']);
    expect(toggleMultiSelectValue(['none'], 'caffeine')).toEqual(['caffeine']);
  });

  it('(d) selecting "widespread" clears every individually-selected location', () => {
    expect(toggleMultiSelectValue(['neck', 'lower_back'], 'widespread', 'widespread')).toEqual(['widespread']);
  });

  it('(d) selecting an individual location clears a prior "widespread" selection', () => {
    expect(toggleMultiSelectValue(['widespread'], 'neck', 'widespread')).toEqual(['neck']);
  });

  it('(d) multiple individual locations accumulate together (neck AND lower back)', () => {
    let selected: string[] = [];
    selected = toggleMultiSelectValue(selected, 'neck', 'widespread');
    selected = toggleMultiSelectValue(selected, 'lower_back', 'widespread');
    expect(selected.sort()).toEqual(['lower_back', 'neck']);
  });

  it('deselecting one of several selected locations leaves the others intact', () => {
    let selected = ['neck', 'lower_back', 'hips'];
    selected = toggleMultiSelectValue(selected, 'lower_back', 'widespread');
    expect(selected.sort()).toEqual(['hips', 'neck']);
  });

  it('exclusiveValue matching is case-insensitive, same as the existing "none" rule', () => {
    expect(toggleMultiSelectValue(['Widespread'], 'neck', 'widespread')).toEqual(['neck']);
  });
});

describe('(a)/(b) the discomfort gate owns the whole section — nothing renders without it', () => {
  it('a required "discomfort-gate" unit exists, asking the platform-voice yes/no question', () => {
    const start = MORNING_FORM.indexOf("key: 'discomfort-gate',");
    expect(start).toBeGreaterThan(-1);
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf("key: '", start + 1));
    expect(block).toContain("section: 'body'");
    expect(block).toContain('required: true');
    expect(block).toContain("question=\"Any discomfort today?\"");
    expect(block).toContain('hasDiscomfort !== null');
  });

  it('the gate carries its own separating heading, so it never reads as a follow-up to whatever rotating question lands above it', () => {
    const start = MORNING_FORM.indexOf("key: 'discomfort-gate',");
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf("key: '", start + 1));
    expect(block).toMatch(/>Discomfort</);
  });

  it('(a) answering "no" writes the same values picking "None" under the old flow wrote (severity 0, empty location) — no downstream shape change', () => {
    const start = MORNING_FORM.indexOf("key: 'discomfort-gate',");
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf("key: '", start + 1));
    expect(block).toContain('setSeverity(0);');
    expect(block).toContain('setPainLocation([]);');
  });

  it('(a)/(b) body-severity and pain-aggravating-factor are only pushed inside `if (hasDiscomfort)` — answering "no" renders zero of them', () => {
    const gateIndex = MORNING_FORM.indexOf("key: 'discomfort-gate',");
    const ifIndex = MORNING_FORM.indexOf('if (hasDiscomfort) {', gateIndex);
    const bodySeverityIndex = MORNING_FORM.indexOf("key: 'body-severity',", gateIndex);
    const aggravatingIndex = MORNING_FORM.indexOf("key: 'pain-aggravating-factor',", gateIndex);
    expect(ifIndex).toBeGreaterThan(gateIndex);
    expect(bodySeverityIndex).toBeGreaterThan(ifIndex);
    expect(aggravatingIndex).toBeGreaterThan(ifIndex);
    // Both pushes must close before the next top-level `if (bowelMovementQuestion)` block —
    // i.e. genuinely nested inside the gate's `if`, not just textually after it.
    const bowelIndex = MORNING_FORM.indexOf('if (bowelMovementQuestion) {', ifIndex);
    expect(bodySeverityIndex).toBeLessThan(bowelIndex);
    expect(aggravatingIndex).toBeLessThan(bowelIndex);
  });

  it('flipping the gate from yes to no actually overwrites a previously-stored location instead of leaving it stale — found live against a real production account (yes+Neck, then no, then resumed still showed Neck) before this guard existed', () => {
    const start = MORNING_FORM.indexOf('async function submitProbeAndFollowUpAnswers() {');
    const end = MORNING_FORM.indexOf('\n  }', start);
    const block = MORNING_FORM.slice(start, end);
    // Must gate on whether the section was answered at all this
    // session (hasDiscomfort !== null), not on whether the array is
    // non-empty -- the latter would skip writing "no locations" and
    // leave a stale prior answer in daily_checkin_probe_answers.
    expect(block).toContain('if (hasDiscomfort !== null) {');
    expect(block).not.toContain('if (painLocation.length > 0) {');
  });
});

describe('(c) no conditional follow-up renders without its parent — the digestion ordering fix', () => {
  it('digestionQuestion is now pushed before interleaveFollowUps runs, so its own local follow-up (digestive_symptom_type) can never precede it', () => {
    const digestionPushIndex = MORNING_FORM.indexOf('if (digestionQuestion) {');
    const interleaveLoopIndex = MORNING_FORM.indexOf('for (const question of interleaveFollowUps(');
    expect(digestionPushIndex).toBeGreaterThan(-1);
    expect(interleaveLoopIndex).toBeGreaterThan(-1);
    expect(digestionPushIndex).toBeLessThan(interleaveLoopIndex);
  });

  it('exactly one digestionQuestion push exists (moved, not duplicated)', () => {
    const matches = MORNING_FORM.match(/if \(digestionQuestion\) \{/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('(d) location is a real multi-select chip grid, not the old single-select stacked list', () => {
  it('BodySeverityOutline renders MultiSelectChipGrid, not StackedOptionRows, for location', () => {
    expect(PAIN_SCREEN).toContain("import { MultiSelectChipGrid } from './scales/MultiSelectChipGrid'");
    expect(PAIN_SCREEN).toContain('<MultiSelectChipGrid');
    // Scoped to imports/JSX, not the doc comment (which legitimately
    // names the superseded component as history).
    const renderedBody = PAIN_SCREEN.slice(PAIN_SCREEN.indexOf('return ('));
    expect(renderedBody).not.toContain('StackedOptionRows');
    expect(PAIN_SCREEN).not.toContain("from './scales/StackedOptionRows'");
  });

  it('locationValue/onLocationChange are array-shaped in BodySeverityOutline\'s own prop contract', () => {
    expect(PAIN_SCREEN).toContain('locationValue: readonly string[]');
    expect(PAIN_SCREEN).toContain('onLocationChange: (value: string[]) => void');
  });

  it('"Widespread" is wired as the chip grid\'s exclusiveValue', () => {
    expect(PAIN_SCREEN).toContain('exclusiveValue="widespread"');
  });

  it('the wording reads naturally on its own: "Where is the discomfort, mainly?"', () => {
    expect(PAIN_SCREEN).toContain('Where is the discomfort, mainly?');
  });

  it('CheckinForm seeds painLocation as a set-of-one from any pre-redesign stored single string, never discarding it', () => {
    expect(MORNING_FORM).toContain("useState<string[]>(() => {");
    expect(MORNING_FORM).toContain("if (typeof stored === 'string') return [stored];");
  });

  it('CheckinForm still submits pain_location through the existing probe-answer path, unchanged call shape', () => {
    expect(MORNING_FORM).toContain("submitProbeAnswerAction(localDate, 'checkin_probe.pain_location', painLocation)");
  });

  it('severity still feeds the exact same existing fields — no schema change to pain_discomfort_level/morning_soreness', () => {
    expect(MORNING_FORM).toContain('pain_discomfort_level: painLevel');
    expect(MORNING_FORM).toContain('morning_soreness: morningSoreness');
    expect(MORNING_FORM).toContain('const morningSoreness = severity === null ? null : Math.max(severity, 1);');
  });
});

describe('migration 117 — checkin_probe.pain_location is really multi_select in the DB', () => {
  it('response_type is multi_select and all 10 original options survive unchanged', async () => {
    const service = serviceRoleClient();
    const { data, error } = await service
      .from('driver_probe_questions')
      .select('response_type, options')
      .eq('question_key', 'checkin_probe.pain_location')
      .single();

    expect(error).toBeNull();
    expect(data!.response_type).toBe('multi_select');
    const values = (data!.options as string[]).slice().sort();
    expect(values).toEqual(
      [
        'feet_or_ankles',
        'hands_or_wrists',
        'hips',
        'knees',
        'lower_back',
        'neck',
        'other',
        'shoulders',
        'upper_back',
        'widespread',
      ].sort()
    );
  });

  it('an array-shaped answer (what the redesigned form now writes) round-trips through the generic jsonb column intact', async () => {
    const service = serviceRoleClient();
    const memberId = TEST_USERS.memberOne.id;
    const localDate = '2015-03-03'; // disjoint fixture date, unused elsewhere in this suite

    await service.from('daily_checkin_probe_answers').delete().eq('member_id', memberId).eq('local_date', localDate);
    await service.from('daily_checkin_probe_answers').insert({
      member_id: memberId,
      local_date: localDate,
      question_key: 'checkin_probe.pain_location',
      value: ['neck', 'lower_back'],
    });

    const { data: row } = await service
      .from('daily_checkin_probe_answers')
      .select('value')
      .eq('member_id', memberId)
      .eq('local_date', localDate)
      .eq('question_key', 'checkin_probe.pain_location')
      .single();
    expect(row!.value).toEqual(['neck', 'lower_back']);

    await service.from('daily_checkin_probe_answers').delete().eq('member_id', memberId).eq('local_date', localDate);
  });
});
