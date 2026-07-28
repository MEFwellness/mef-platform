/**
 * Craving multi-select (2026-07-28, item 2): checkin_probe.cravings_today
 * ("Any strong cravings today?") moves from single_select to a real
 * multi_select response type — added to the schema, DriverProbeField, and
 * the coach Question Bank editor rather than special-cased. Pure-function
 * tests for the "None" exclusivity rule (generic — any multi_select
 * question with a 'none' option gets this for free), a real-DB check that
 * migration 115 actually landed (response_type + options), plus static
 * source checks confirming every touched surface really wires the new
 * type through. No component-rendering harness exists in this repo
 * (plain 'node' vitest environment), same standing limitation every other
 * chart/UI test file in this suite states.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toggleMultiSelectValue } from '../components/checkin/scales/MultiOptionRows';
import { resolveDisplayStyle } from '../lib/daily-checkin-adaptive/displayStyle';
import { serviceRoleClient } from './setup/test-clients';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

describe('toggleMultiSelectValue', () => {
  it('adds an unselected option to the current selection', () => {
    expect(toggleMultiSelectValue(['sugar_or_carbs'], 'salty')).toEqual(['sugar_or_carbs', 'salty']);
  });

  it('removes an already-selected option (toggle off)', () => {
    expect(toggleMultiSelectValue(['sugar_or_carbs', 'salty'], 'salty')).toEqual(['sugar_or_carbs']);
  });

  it('selecting "none" clears every other selection', () => {
    expect(toggleMultiSelectValue(['sugar_or_carbs', 'salty'], 'none')).toEqual(['none']);
  });

  it('selecting any other option clears "none"', () => {
    expect(toggleMultiSelectValue(['none'], 'caffeine')).toEqual(['caffeine']);
  });

  it('"none" exclusivity is case-insensitive on the option value', () => {
    expect(toggleMultiSelectValue(['None'], 'caffeine')).toEqual(['caffeine']);
  });

  it('deselecting "none" itself just empties the selection', () => {
    expect(toggleMultiSelectValue(['none'], 'none')).toEqual([]);
  });

  it('an empty starting selection can pick multiple non-none options in sequence', () => {
    let selected: string[] = [];
    selected = toggleMultiSelectValue(selected, 'sugar_or_carbs');
    selected = toggleMultiSelectValue(selected, 'caffeine');
    expect(selected.sort()).toEqual(['caffeine', 'sugar_or_carbs']);
  });
});

describe('resolveDisplayStyle — multi_select has a real default', () => {
  it('falls back to pill_row (same as single_select) when displayStyle is unset', () => {
    expect(resolveDisplayStyle({ responseType: 'multi_select', displayStyle: null })).toBe('pill_row');
  });
});

describe('migration 115 — checkin_probe.cravings_today is really multi_select in the DB', () => {
  it('response_type is multi_select and all 5 original options survive unchanged', async () => {
    const service = serviceRoleClient();
    const { data, error } = await service
      .from('driver_probe_questions')
      .select('response_type, options')
      .eq('question_key', 'checkin_probe.cravings_today')
      .single();

    expect(error).toBeNull();
    expect(data!.response_type).toBe('multi_select');
    const values = (data!.options as { value: string }[]).map((o) => o.value).sort();
    expect(values).toEqual(['caffeine', 'just_hungry_in_general', 'none', 'salty', 'sugar_or_carbs']);
  });

  it('the response_type CHECK constraint accepts multi_select for a fresh row (constraint really widened, not just this one row hand-patched)', async () => {
    const service = serviceRoleClient();
    const key = `checkin_probe.test_multi_select_${Date.now()}`;
    const { error } = await service.from('driver_probe_questions').insert({
      question_key: key,
      driver_id: null,
      prompt: 'Test multi_select constraint',
      response_type: 'multi_select',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      storage: 'probe_answer',
      screen: 'morning',
    });
    expect(error).toBeNull();
    await service.from('driver_probe_questions').delete().eq('question_key', key);
  });
});

describe('scope — every surface that needed to learn about multi_select actually did', () => {
  it('DriverProbeField.tsx renders a multi_select branch and widens ProbeAnswerValue to include string[]', () => {
    const src = source('components/checkin/DriverProbeField.tsx');
    expect(src).toContain("question.responseType === 'multi_select'");
    expect(src).toContain('ProbeAnswerValue = string | number | boolean | string[]');
  });

  it('CheckinForm.tsx and EveningReflectionForm.tsx hydrate array-valued answers instead of dropping them', () => {
    for (const file of ['app/checkin/CheckinForm.tsx', 'app/checkin/evening/EveningReflectionForm.tsx']) {
      const src = source(file);
      expect(src).toContain('Array.isArray(value)');
    }
  });

  it('the coach Question Bank editor offers multi_select and reuses the same choices textarea as single_select', () => {
    const src = source('components/coach-questions/QuestionEditorForm.tsx');
    expect(src).toContain("value: 'multi_select'");
    expect(src).toContain("responseType === 'single_select' || responseType === 'multi_select'");
  });

  it('the response-type lock (already-answered questions can\'t change shape) is untouched — cravings_today itself was migrated via a reviewed migration, not the coach UI', () => {
    const src = source('lib/driver-probe-admin/data.ts');
    expect(src).toContain('response_type/options are locked once a question has at least one recorded answer');
  });
});
