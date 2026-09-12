/**
 * The three cards on the completion screen.
 *
 * EVERY LINE IS SOMETHING SHE ACTUALLY ANSWERED. Nothing below is a
 * template with a blank in it, nothing has a fallback sentence, and a card
 * with no real content does not print an empty state: it does not print.
 * A member who chose two concerns sees two concerns, and a member who
 * reported nothing in section eleven sees no line about section eleven.
 *
 * NO SCORE, NO BAND, NO COLOUR, NO DIAGNOSIS. This screen tells her what
 * she said, in her own answers' words, and what happens next. It never
 * ranks, interprets or explains any of it, because this instrument
 * produces no reading at all.
 *
 * IT IS BUILT FROM THE SAME PRUNED ANSWERS THE COACH READS, so a branch
 * she closed cannot show up here either.
 */

import { readEntries, readItemMap, readScale, readSelections, readText } from './branching';
import { optionLabel } from './questions';
import { HLI_COPY } from './copy';
import type { IntakeAnswers } from './types';

export type MemberSummaryCard = {
  title: string;
  lines: string[];
};

export type MemberSummaryView = {
  title: string;
  body: string;
  cards: MemberSummaryCard[];
  /** The one calm sentence, present only when a rule in ./safety.ts fired. */
  safety: { title: string; body: string } | null;
};

/** "What you want help with", from her own multi-select, in the order it was offered. */
function concernLines(answers: IntakeAnswers): string[] {
  const lines: string[] = [];
  for (const value of readSelections(answers['primary_concerns'])) {
    if (value === 'concern_other') {
      const typed = readText(answers['primary_concerns_other']).trim();
      lines.push(typed.length > 0 ? typed : (optionLabel('primary_concerns', value) ?? value));
      continue;
    }
    lines.push(optionLabel('primary_concerns', value) ?? value);
  }
  return lines;
}

/**
 * "Areas you told us about".
 *
 * Each line below is guarded by the answer it prints, so the card holds
 * exactly as many lines as she gave facts for, in a fixed order so two
 * members with the same answers read the same card.
 */
function reportedLines(answers: IntakeAnswers): string[] {
  const lines: string[] = [];

  const stress = readScale(answers['stress_level']);
  if (stress > 0) lines.push(`Stress load ${stress} out of 10`);

  const stressors = readSelections(answers['stress_sources'])
    .map((value) => optionLabel('stress_sources', value) ?? value)
    .filter((label) => label !== 'Something else');
  if (stressors.length > 0) lines.push(`Weighing on you: ${stressors.join(', ')}`);

  const events = readEntries(answers['history_events']);
  for (const event of events) {
    const parts = [event['event_year'], event['event_what']].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0
    );
    if (parts.length > 0) lines.push(parts.join(', '));
  }

  const medications = readEntries(answers['medications']).length;
  if (medications > 0) {
    lines.push(`${medications} ${medications === 1 ? 'medication' : 'medications'} you told us about`);
  }

  const conditions = readEntries(answers['conditions']).length;
  if (conditions > 0) {
    lines.push(`${conditions} ${conditions === 1 ? 'condition' : 'conditions'} being treated`);
  }

  if (readText(answers['night_waking']) === 'yes') {
    const time = readText(answers['night_waking_time']).trim();
    lines.push(time.length > 0 ? `Waking at around ${time}` : 'Waking at a similar time at night');
  }

  const worst = readText(answers['worst_period']);
  if (worst.length > 0) {
    lines.push(`Hardest part of your day: ${(optionLabel('worst_period', worst) ?? worst).toLowerCase()}`);
  }

  const impact = readItemMap(answers['movement_impact']);
  const harder = Object.entries(impact)
    .filter(([, value]) => value === 'moderately' || value === 'a_lot')
    .map(([area]) => optionLabel('movement_areas', area) ?? area);
  if (harder.length > 0) lines.push(`Harder than it was: ${harder.join(', ')}`);

  const weight = readText(answers['weight_change']);
  if (weight.length > 0 && weight !== 'none' && weight !== 'prefer_not') {
    lines.push(optionLabel('weight_change', weight) ?? weight);
  }

  const senses = readSelections(answers['senses_areas']).map(
    (value) => optionLabel('senses_areas', value) ?? value
  );
  if (senses.length > 0) lines.push(`Changes you noticed: ${senses.join(', ')}`);

  const symptoms = readSelections(answers['symptoms'])
    .map((value) => optionLabel('symptoms', value) ?? value)
    .filter((label) => label !== 'Something else');
  if (symptoms.length > 0) lines.push(`Experiencing: ${symptoms.join(', ')}`);

  return lines;
}

export function buildMemberSummary(
  answers: IntakeAnswers,
  options: { safetyTriggered: boolean }
): MemberSummaryView {
  const cards: MemberSummaryCard[] = [];

  const concerns = concernLines(answers);
  if (concerns.length > 0) {
    cards.push({ title: HLI_COPY.completionCardOneTitle, lines: concerns });
  }

  const reported = reportedLines(answers);
  if (reported.length > 0) {
    cards.push({ title: HLI_COPY.completionCardTwoTitle, lines: reported });
  }

  // The third card is the only one that is always drawn, because it says
  // what happens next rather than repeating something she answered, and
  // that is true for every member who reaches this screen.
  cards.push({
    title: HLI_COPY.completionCardThreeTitle,
    lines: [HLI_COPY.completionCardThreeBody],
  });

  return {
    title: HLI_COPY.completionTitle,
    body: HLI_COPY.completionBody,
    cards,
    safety: options.safetyTriggered
      ? { title: HLI_COPY.safetyTitle, body: HLI_COPY.safetyBody }
      : null,
  };
}
