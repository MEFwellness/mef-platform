/**
 * What a coach reads on the Health Context section of the client detail
 * page, built once from one sitting's stored answers.
 *
 * IT SUMMARISES, IT DOES NOT REPLAY. A coach opening this is not looking
 * for the ninety answers in the order they were given; they are looking for
 * the shape of the person in about fifteen seconds. So the top of the card
 * is a dense block of labelled lines, and the detail (every medication,
 * every event, every note she wrote) sits under it in named groups that can
 * be read when they matter.
 *
 * EVERY LINE IS SOMETHING SHE REPORTED. A fact she did not give produces no
 * line at all rather than a line saying "none". The two exceptions are
 * named and deliberate: the follow-up line is always drawn, because "no
 * immediate safety flag" is itself the answer a coach came to check, and
 * the completion line is always drawn, because a summary with no date on it
 * is a summary of an unknown moment.
 *
 * WHAT THE MEMBER REPORTED AND WHAT A COACH MIGHT ASK ARE DIFFERENT
 * OBJECTS. `rows`, `groups` and `notes` are her answers. `exploring` is
 * built by ./exploring.ts and is never mixed into them, so the card can
 * draw them under two different headings and a coach reading quickly cannot
 * mistake the second for the first.
 *
 * NO DATE IS FORMATTED HERE. This module returns raw stored instants and
 * the card formats them through lib/time/displayDate.ts, which is the one
 * place in this app allowed to turn an instant into words.
 */

import { readEntries, readItemMap, readScale, readSelections, readText } from './branching';
import { optionLabel } from './questions';
import { buildExploringPrompts, type ExploringPrompt } from './exploring';
import { evaluateIntakeSafety, type IntakeSafetySignal } from './safety';
import type { IntakeAnswers, IntakeEntry } from './types';

/** One labelled line of the dense block. */
export type ContextRow = { label: string; value: string };

/** One named group of detail, drawn as a small list under the block. */
export type ContextGroup = { label: string; items: string[] };

/** Something she wrote in her own words, printed verbatim. */
export type ContextNote = { label: string; text: string };

export type HealthContextView = {
  rows: ContextRow[];
  groups: ContextGroup[];
  notes: ContextNote[];
  safetySignals: IntakeSafetySignal[];
  exploring: ExploringPrompt[];
};

/** A middot separated list, the density the coach's block is written at. */
function joinDots(parts: string[]): string {
  return parts.join(' · ');
}

function labelsOf(answers: IntakeAnswers, fieldId: string): string[] {
  return readSelections(answers[fieldId]).map((value) => optionLabel(fieldId, value) ?? value);
}

/** One entry printed as one line, from the entry fields its list nominated. */
function entryLine(entry: IntakeEntry, fieldIds: string[]): string {
  return fieldIds
    .map((id) => (entry[id] ?? '').trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

function pushGroup(
  groups: ContextGroup[],
  label: string,
  entries: IntakeEntry[],
  fieldIds: string[]
): void {
  const items = entries.map((entry) => entryLine(entry, fieldIds)).filter((line) => line.length > 0);
  if (items.length > 0) groups.push({ label, items });
}

function pushNote(notes: ContextNote[], label: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length > 0) notes.push({ label, text: trimmed });
}

export function buildHealthContextView(answers: IntakeAnswers): HealthContextView {
  const rows: ContextRow[] = [];
  const groups: ContextGroup[] = [];
  const notes: ContextNote[] = [];

  // Who she is, only where she answered.
  const about: string[] = [];
  const dob = readText(answers['date_of_birth']);
  if (dob.length > 0) about.push(`Born ${dob}`);
  const occupation = readText(answers['occupation']).trim();
  if (occupation.length > 0) about.push(occupation);
  const height = readText(answers['height']).trim();
  if (height.length > 0) about.push(height);
  const children = readText(answers['children']);
  if (children.length > 0 && children !== 'prefer_not') {
    about.push(optionLabel('children', children) ?? children);
  }
  if (about.length > 0) rows.push({ label: 'About', value: joinDots(about) });

  // What she came for.
  const concerns = readSelections(answers['primary_concerns']).map((value) => {
    if (value !== 'concern_other') return optionLabel('primary_concerns', value) ?? value;
    const typed = readText(answers['primary_concerns_other']).trim();
    return typed.length > 0 ? typed : (optionLabel('primary_concerns', value) ?? value);
  });
  if (concerns.length > 0) rows.push({ label: 'Primary concerns', value: joinDots(concerns) });

  const onset = readText(answers['concern_onset']);
  if (onset.length > 0) {
    rows.push({ label: 'Noticing it for', value: optionLabel('concern_onset', onset) ?? onset });
  }

  // The load.
  const stress = readScale(answers['stress_level']);
  if (stress > 0) {
    const sources = labelsOf(answers, 'stress_sources').filter((label) => label !== 'Something else');
    rows.push({
      label: 'Stress',
      value: sources.length > 0 ? `${stress}/10, ${joinDots(sources)}` : `${stress}/10`,
    });
  }

  // The rhythm.
  const rhythm: string[] = [];
  const waking = readText(answers['night_waking']);
  if (waking === 'yes') {
    const time = readText(answers['night_waking_time']).trim();
    rhythm.push(time.length > 0 ? `Wakes around ${time}` : 'Wakes at a similar time at night');
  } else if (waking === 'no') {
    rhythm.push('No repeated night waking');
  }
  const best = readText(answers['best_period']);
  if (best.length > 0) rhythm.push(`Best: ${(optionLabel('best_period', best) ?? best).toLowerCase()}`);
  const worst = readText(answers['worst_period']);
  if (worst.length > 0) {
    rhythm.push(`Lowest: ${(optionLabel('worst_period', worst) ?? worst).toLowerCase()}`);
  }
  if (rhythm.length > 0) rows.push({ label: 'Sleep rhythm', value: joinDots(rhythm) });

  // Moving.
  const impact = readItemMap(answers['movement_impact']);
  const movementParts = Object.entries(impact).map(([area, level]) => {
    const areaLabel = optionLabel('movement_areas', area) ?? area;
    const levelLabel = (optionLabel('movement_impact', level) ?? level).toLowerCase();
    return `${areaLabel}, ${levelLabel}`;
  });
  if (movementParts.length > 0) {
    rows.push({ label: 'Movement', value: joinDots(movementParts) });
  } else if (readSelections(answers['movement_areas']).includes('movement_none')) {
    rows.push({ label: 'Movement', value: 'No meaningful change reported' });
  }

  // The body.
  const weight = readText(answers['weight_change']);
  if (weight.length > 0 && weight !== 'prefer_not') {
    const intent = readText(answers['weight_intentional']);
    const intentLabel = intent.length > 0 ? optionLabel('weight_intentional', intent) : null;
    rows.push({
      label: 'Weight',
      value: intentLabel
        ? `${optionLabel('weight_change', weight) ?? weight}, intentional: ${intentLabel.toLowerCase()}`
        : (optionLabel('weight_change', weight) ?? weight),
    });
  }

  const senses = labelsOf(answers, 'senses_areas');
  if (senses.length > 0) {
    const durations = readItemMap(answers['senses_duration']);
    const parts = readSelections(answers['senses_areas']).map((value) => {
      const label = optionLabel('senses_areas', value) ?? value;
      const duration = durations[value];
      return duration ? `${label}, ${(optionLabel('senses_duration', duration) ?? duration).toLowerCase()}` : label;
    });
    rows.push({ label: 'Senses', value: joinDots(parts) });
  }

  // What she has been experiencing, with each answer's own follow-ups.
  const frequency = readItemMap(answers['symptom_frequency']);
  const duration = readItemMap(answers['symptom_duration']);
  const worsening = readItemMap(answers['symptom_worsening']);
  const symptomLines = readSelections(answers['symptoms']).map((value) => {
    const label = optionLabel('symptoms', value) ?? value;
    const detail = [
      frequency[value] ? optionLabel('symptom_frequency', frequency[value]!) : null,
      duration[value] ? optionLabel('symptom_duration', duration[value]!) : null,
      worsening[value] === 'yes' ? 'getting worse' : null,
    ]
      .filter((part): part is string => part !== null)
      .map((part) => part.toLowerCase());
    return detail.length > 0 ? `${label}, ${detail.join(', ')}` : label;
  });
  if (symptomLines.length > 0) groups.push({ label: 'Reported symptoms', items: symptomLines });

  // What is already being looked after.
  const physical = readText(answers['last_physical']);
  if (physical.length > 0) {
    rows.push({ label: 'Last physical', value: optionLabel('last_physical', physical) ?? physical });
  }
  const labsWhen = readText(answers['labs_when']);
  if (labsWhen.length > 0) {
    rows.push({ label: 'Recent testing', value: optionLabel('labs_when', labsWhen) ?? labsWhen });
  }
  const pregnancy = readText(answers['pregnancy_status']);
  if (pregnancy.length > 0 && pregnancy !== 'neither' && pregnancy !== 'prefer_not') {
    rows.push({ label: 'Pregnancy', value: optionLabel('pregnancy_status', pregnancy) ?? pregnancy });
  }

  const medications = readEntries(answers['medications']);
  const supplements = readEntries(answers['supplements']);
  const conditions = readEntries(answers['conditions']);
  const counts: string[] = [];
  if (conditions.length > 0) {
    counts.push(`${conditions.length} ${conditions.length === 1 ? 'condition' : 'conditions'}`);
  }
  if (medications.length > 0) {
    counts.push(`${medications.length} ${medications.length === 1 ? 'medication' : 'medications'}`);
  }
  if (supplements.length > 0) {
    counts.push(`${supplements.length} ${supplements.length === 1 ? 'supplement' : 'supplements'}`);
  }
  if (counts.length > 0) rows.push({ label: 'Reported', value: joinDots(counts) });

  const events = readEntries(answers['history_events']);
  if (events.length > 0) {
    rows.push({
      label: 'History',
      value: joinDots(events.map((event) => entryLine(event, ['event_what', 'event_year']))),
    });
  }

  // What she has already tried.
  const tried = labelsOf(answers, 'tried').filter((label) => label !== 'Something else');
  const triedOther = readText(answers['tried_other_text']).trim();
  const triedAll = triedOther.length > 0 ? [...tried, triedOther] : tried;
  if (triedAll.length > 0) rows.push({ label: 'Already tried', value: joinDots(triedAll) });

  pushGroup(groups, 'Conditions being treated', conditions, ['condition_name', 'condition_since']);
  pushGroup(groups, 'Prescription medications', medications, [
    'medication_name',
    'medication_dose',
    'medication_reason',
  ]);
  pushGroup(groups, 'Over the counter', readEntries(answers['otc']), ['otc_name', 'otc_reason']);
  pushGroup(groups, 'Supplements', supplements, ['supplement_name', 'supplement_reason']);
  pushGroup(groups, 'Allergies and sensitivities', readEntries(answers['allergies']), [
    'allergy_name',
    'allergy_reaction',
  ]);
  pushGroup(groups, 'Practitioners', readEntries(answers['practitioners']), [
    'practitioner_type',
    'practitioner_for',
  ]);
  pushGroup(groups, 'Surgeries, injuries and hospital stays', events, [
    'event_year',
    'event_what',
    'event_status',
  ]);

  pushNote(notes, 'In her own words', readText(answers['concern_context']));
  pushNote(notes, 'What seemed to help', readText(answers['tried_helped']));
  pushNote(notes, 'What did not seem to help', readText(answers['tried_not_helped']));
  pushNote(notes, 'Recent illness', readText(answers['recent_illness']));
  pushNote(notes, 'What was looked at in testing', readText(answers['labs_what']));

  return {
    rows,
    groups,
    notes,
    safetySignals: evaluateIntakeSafety(answers),
    exploring: buildExploringPrompts(answers),
  };
}

/**
 * The follow-up line, which is the one line always drawn.
 *
 * A coach opening this card is partly asking "is there anything here I
 * should not coach around", and a card that answers that question only when
 * the answer is yes makes silence ambiguous.
 */
export function followUpLine(signals: IntakeSafetySignal[]): string {
  if (signals.length === 0) return 'No immediate safety flag';
  return `${signals.length} ${signals.length === 1 ? 'answer' : 'answers'} worth following up`;
}
