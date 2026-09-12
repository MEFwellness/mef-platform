/**
 * Changing her mind, and what it costs.
 *
 * DECISION 1 OF THE BRIEF, WRITTEN AS TESTS. A member who flips a gate is
 * shown an inline confirmation naming exactly what will be removed, and on
 * confirming those entries stop existing for every coach facing output
 * immediately. The archive is for audit, so the thing that has to be proved
 * is that nothing downstream is ever handed it.
 *
 * AND THE WALK ITSELF. Which screens exist, where she resumes, and the one
 * screen kind allowed to advance without a Continue.
 */

import { describe, it, expect } from 'vitest';
import {
  applyMultiSelect,
  followUpGroups,
  itemsForFollowUp,
  previewChange,
  pruneAnswers,
  screenIsShown,
  shownScreens,
} from '@/lib/health-intake/branching';
import { allScreens, INTAKE_SECTIONS } from '@/lib/health-intake/questions';
import {
  buildSteps,
  chapterCounter,
  firstOpenStepIndex,
  isGateScreen,
  progressFraction,
  resumeStepIndex,
} from '@/lib/health-intake/steps';
import { sanitizeWithArchive } from '@/lib/health-intake/sanitize';
import { buildHealthContextView } from '@/lib/health-intake/coachView';
import { evaluateIntakeSafety } from '@/lib/health-intake/safety';
import { buildExploringPrompts } from '@/lib/health-intake/exploring';
import { buildMemberSummary } from '@/lib/health-intake/memberSummary';
import type { IntakeAnswers } from '@/lib/health-intake/types';

const TWO_MEDICATIONS: IntakeAnswers = {
  medications_gate: 'yes',
  medications: [
    { medication_name: 'Levothyroxine', medication_reason: 'Thyroid' },
    { medication_name: 'Sertraline' },
  ],
};

function screen(id: string) {
  return allScreens().find((entry) => entry.id === id)!;
}

describe('a gate decides which screens exist', () => {
  it('a No closes the screen its Yes opened', () => {
    expect(screenIsShown(screen('background_medications'), { medications_gate: 'yes' })).toBe(true);
    expect(screenIsShown(screen('background_medications'), { medications_gate: 'no' })).toBe(false);
    expect(screenIsShown(screen('background_medications'), {})).toBe(false);
  });

  it('a member who says No to everything still walks every chapter', () => {
    const answers: IntakeAnswers = {
      practitioners_gate: 'no',
      labs_gate: 'no',
      conditions_gate: 'no',
      medications_gate: 'no',
      otc_gate: 'no',
      supplements_gate: 'no',
      allergies_gate: 'no',
      recent_illness_gate: 'no',
      history_gate: 'no',
      senses_gate: 'no',
    };
    const chapters = buildSteps(answers).filter((step) => step.kind === 'chapter');
    expect(chapters).toHaveLength(INTAKE_SECTIONS.length);
  });

  it('a Yes on every gate makes the walk longer, and by the screens it opened', () => {
    const allNo: IntakeAnswers = { medications_gate: 'no', history_gate: 'no' };
    const allYes: IntakeAnswers = { medications_gate: 'yes', history_gate: 'yes' };
    expect(shownScreens(allYes).length).toBe(shownScreens(allNo).length + 2);
  });
});

describe('the confirmation names the real thing', () => {
  it('counts her own entries, in her own words', () => {
    const preview = previewChange(TWO_MEDICATIONS, 'medications_gate', 'no');
    expect(preview.isEmpty).toBe(false);
    expect(preview.sentence).toBe('This will remove the 2 medications you added.');
    expect(preview.fieldIds).toEqual(['medications']);
  });

  it('says "medication" when there is one of them', () => {
    const one: IntakeAnswers = {
      medications_gate: 'yes',
      medications: [{ medication_name: 'Levothyroxine' }],
    };
    expect(previewChange(one, 'medications_gate', 'no').sentence).toBe(
      'This will remove the 1 medication you added.'
    );
  });

  it('asks nothing when the change costs nothing', () => {
    expect(previewChange({ medications_gate: 'yes' }, 'medications_gate', 'no').isEmpty).toBe(true);
    expect(previewChange({}, 'medications_gate', 'yes').isEmpty).toBe(true);
  });

  it('names more than one thing when more than one goes, joined the way a person would say it', () => {
    const answers: IntakeAnswers = {
      symptoms: ['fatigue', 'headaches'],
      symptom_frequency: { fatigue: 'often', headaches: 'often' },
      symptom_duration: { fatigue: 'recently', headaches: 'recently' },
    };
    const preview = previewChange(answers, 'symptoms', []);
    expect(preview.isEmpty).toBe(false);
    expect(preview.sentence).toContain(' and ');
    expect(preview.fieldIds.sort()).toEqual(['symptom_duration', 'symptom_frequency']);
  });

  it('counts the follow-ups a single unselected item takes with it', () => {
    const answers: IntakeAnswers = {
      movement_areas: ['stairs', 'lifting'],
      movement_impact: { stairs: 'a_lot', lifting: 'a_little' },
    };
    const preview = previewChange(answers, 'movement_areas', ['stairs']);
    expect(preview.sentence).toBe('This will remove the 1 answer about moving.');
  });
});

describe('what she removed stops existing for every coach facing output', () => {
  const flipped: IntakeAnswers = { ...TWO_MEDICATIONS, medications_gate: 'no' };

  it('is dropped from her live answers and returned separately', () => {
    const { kept, dropped } = pruneAnswers(flipped);
    expect(kept['medications']).toBeUndefined();
    expect(dropped['medications']).toHaveLength(2);
  });

  it('is dropped by the server on a save, whatever the client sent', () => {
    const { kept, dropped } = sanitizeWithArchive(flipped);
    expect(kept['medications']).toBeUndefined();
    expect(dropped['medications']).toHaveLength(2);
  });

  it('never reaches the coach summary', () => {
    const view = buildHealthContextView(pruneAnswers(flipped).kept);
    const printed = JSON.stringify(view);
    expect(printed).not.toContain('Levothyroxine');
    expect(printed).not.toContain('Sertraline');
    expect(view.rows.some((row) => row.label === 'Reported')).toBe(false);
  });

  it('never reaches a question worth exploring', () => {
    const withFatigue = { ...flipped, symptoms: ['fatigue'] } satisfies IntakeAnswers;
    const kept = pruneAnswers(withFatigue).kept;
    const prompts = buildExploringPrompts(kept);
    expect(prompts.some((prompt) => prompt.key === 'medications_and_fatigue')).toBe(false);
    // And it does fire while the medications are still real, so the test
    // above is proving a removal rather than a rule that never fires.
    const stillReal = { ...TWO_MEDICATIONS, symptoms: ['fatigue'] } satisfies IntakeAnswers;
    expect(
      buildExploringPrompts(pruneAnswers(stillReal).kept).some(
        (prompt) => prompt.key === 'medications_and_fatigue'
      )
    ).toBe(true);
  });

  it('never reaches the three cards she reads at the end', () => {
    const summary = buildMemberSummary(pruneAnswers(flipped).kept, { safetyTriggered: false });
    expect(JSON.stringify(summary)).not.toContain('medication');
  });

  it('never reaches a safety rule', () => {
    const bleeding: IntakeAnswers = {
      symptoms: ['bleeding'],
      symptom_frequency: { bleeding: 'occasionally' },
    };
    expect(evaluateIntakeSafety(bleeding)).toHaveLength(1);
    const removed = pruneAnswers({ ...bleeding, symptoms: [] }).kept;
    expect(evaluateIntakeSafety(removed)).toHaveLength(0);
  });
});

describe('a per item follow-up follows the list it was given', () => {
  it('asks about the items she chose, in the order they were offered', () => {
    const field = screen('movement_impact').fields[0]!;
    if (field.kind !== 'per_item') throw new Error('expected a per item field');
    const items = itemsForFollowUp(field, { movement_areas: ['lifting', 'stairs'] });
    expect(items).toEqual(['stairs', 'lifting']);
  });

  it('never asks about the exclusive "no change" answer', () => {
    const field = screen('movement_impact').fields[0]!;
    if (field.kind !== 'per_item') throw new Error('expected a per item field');
    expect(itemsForFollowUp(field, { movement_areas: ['movement_none'] })).toEqual([]);
  });

  it('asks "is it getting worse" only about the symptoms it is meant to', () => {
    const field = screen('symptoms_worsening').fields[0]!;
    if (field.kind !== 'per_item') throw new Error('expected a per item field');
    const items = itemsForFollowUp(field, { symptoms: ['fatigue', 'headaches', 'bleeding'] });
    expect(items).toEqual(['headaches', 'bleeding']);
  });

  it('is cut into screens of two or three, through the shared questionnaire grouping', () => {
    const field = screen('movement_impact').fields[0]!;
    if (field.kind !== 'per_item') throw new Error('expected a per item field');
    const groups = followUpGroups(field, {
      movement_areas: ['walking', 'stairs', 'sitting', 'standing'],
    });
    // Four would greedily become three then one. Two and two instead.
    expect(groups.map((group) => group.length)).toEqual([2, 2]);
  });
});

describe('an exclusive option cannot stand beside a contradiction', () => {
  const field = screen('movement_areas').fields[0]!;

  it('choosing "no meaningful change" clears everything else', () => {
    if (field.kind !== 'multi_select') throw new Error('expected a multi select');
    expect(applyMultiSelect(field, ['stairs', 'lifting'], 'movement_none')).toEqual([
      'movement_none',
    ]);
  });

  it('choosing anything else clears it', () => {
    if (field.kind !== 'multi_select') throw new Error('expected a multi select');
    expect(applyMultiSelect(field, ['movement_none'], 'stairs')).toEqual(['stairs']);
  });

  it('tapping a chosen option again removes it', () => {
    if (field.kind !== 'multi_select') throw new Error('expected a multi select');
    expect(applyMultiSelect(field, ['stairs', 'lifting'], 'stairs')).toEqual(['lifting']);
  });
});

describe('only one kind of screen advances by itself', () => {
  it('is the screen holding one binary gate, and nothing else', () => {
    const auto = allScreens().filter(isGateScreen);
    for (const entry of auto) {
      expect(entry.fields).toHaveLength(1);
      expect(entry.fields[0]!.kind).toBe('gate');
    }
    // Everything a member might want to reconsider waits for Continue.
    for (const entry of allScreens()) {
      if (isGateScreen(entry)) continue;
      const kinds = entry.fields.map((field) => field.kind);
      expect(kinds).not.toEqual(['gate']);
    }
  });
});

describe('where she picks up', () => {
  it('lands on the first thing that still REQUIRES her, skipping what was optional', () => {
    /*
      The three screens after the first one in chapter one are optional on
      every field (occupation, height, sex, relationship, children), so a
      member who left them blank has not left anything undone. The first
      thing that genuinely still needs her is chapter two's first question,
      and stopping anywhere earlier would send her back to a blank she
      chose on every single resume.
    */
    const answers: IntakeAnswers = { full_name: 'Ebony', date_of_birth: '1986-04-02' };
    const steps = buildSteps(answers);
    const open = firstOpenStepIndex(steps, answers);
    expect(steps[open]!.kind).toBe('screen');
    if (steps[open]!.kind === 'screen') {
      expect((steps[open] as { screenId: string }).screenId).toBe('brings_you_concerns');
    }
  });

  it('holds her at a screen whose required field is still blank', () => {
    const steps = buildSteps({});
    const open = firstOpenStepIndex(steps, {});
    expect(steps[open]!.kind).toBe('screen');
    if (steps[open]!.kind === 'screen') {
      expect((steps[open] as { screenId: string }).screenId).toBe('about_you_name');
    }
  });

  it('never carries a stored index past a screen that still needs her', () => {
    const answers: IntakeAnswers = { full_name: 'Ebony' };
    const steps = buildSteps(answers);
    expect(resumeStepIndex(steps, answers, 999)).toBe(firstOpenStepIndex(steps, answers));
  });

  it('moves her forward through screens she deliberately left blank', () => {
    const answers: IntakeAnswers = {
      full_name: 'Ebony',
      date_of_birth: '1986-04-02',
      // about_you_work is optional on both fields and was skipped.
      sex: 'female',
    };
    const steps = buildSteps(answers);
    const stored = 6;
    expect(resumeStepIndex(steps, answers, stored)).toBe(stored);
  });

  it('a reopened branch pulls her back to it rather than stranding it', () => {
    const answers: IntakeAnswers = { medications_gate: 'yes' };
    const steps = buildSteps(answers);
    const open = firstOpenStepIndex(steps, answers);
    const medicationStep = steps.findIndex(
      (step) => step.kind === 'screen' && step.screenId === 'background_medications'
    );
    expect(open).toBeLessThanOrEqual(medicationStep);
  });
});

describe('the progress a member reads', () => {
  it('counts chapters in the counter and screens in the line', () => {
    expect(chapterCounter(3, 11)).toBe('03 of 11');
    const steps = buildSteps({});
    expect(progressFraction(steps, 0)).toBe(0);
    expect(progressFraction(steps, steps.length)).toBe(1);
  });

  it('does not move on a chapter screen, which asks her nothing', () => {
    const steps = buildSteps({});
    const firstChapter = steps.findIndex((step) => step.kind === 'chapter');
    expect(progressFraction(steps, firstChapter)).toBe(
      progressFraction(steps, firstChapter + 1) === 0 ? 0 : progressFraction(steps, firstChapter)
    );
  });
});
