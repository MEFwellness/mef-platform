/**
 * "Why this program", written for the member, composed from what is
 * truthfully known about her.
 *
 * COMPOSED BY RULE, NOT GENERATED. Every sentence below is gated on a fact
 * that is already stored: the program's own shape, the description its
 * author wrote for members, the goal SHE picked, the body areas her last
 * posture check pointed at AND that this program actually works, the
 * equipment her program actually needs. A fact that is missing produces no
 * sentence at all rather than a hedged one, which is why a member with no
 * goals and no assessment still gets a short, true paragraph instead of a
 * paragraph with holes in it. There is no model in this path.
 *
 * IT NEVER DIAGNOSES AND NEVER PROMISES. It says what the program is, what
 * she said she wanted, where the work goes and what she needs to do it. It
 * does not say a finding is a problem, does not name one, does not grade
 * one, and does not claim any exercise will fix anything.
 *
 * THREE CORRECTIONS A COACH ASKED FOR, after reading the first draft, are
 * what this file's current shape is about:
 *
 *   1. Her goal is said the way a person says it. The stored value is a
 *      list option written to be scanned ("Lose weight or improve body
 *      composition"), and dropping one into the middle of a sentence read
 *      like a form being played back at her. ./goalPhrases.ts maps every
 *      option the goals screen offers, and a value with no phrase produces
 *      no sentence: raw option text never reaches the paragraph.
 *
 *   2. The program SUPPORTS her goal. It said "this plan is built around
 *      that", and nothing in this product selects a program from a goal:
 *      a corrective program is selected from posture findings and a named
 *      program is chosen by her coach. "Built around" is available, behind
 *      `goalDroveSelection`, for the day something really does select on
 *      it, and it is false everywhere today.
 *
 *   3. A posture area is named only when the program WORKS it. See
 *      ./programAreas.ts. Her check finding something and her program
 *      going there are two different facts, and only the second one earns
 *      the sentence.
 *
 * IT IS A DRAFT. The coach reads it before she presses Approve and can
 * rewrite any of it. Whatever she ends up with is what gets stored, and the
 * member reads the stored text, not this function.
 *
 * NO EM DASHES, anywhere, per the house rule. Commas, colons and periods.
 */
import { containsClinicalLanguage } from '../memberPresentation';
import { bodyAreaPhrases, equipmentPhrases, joinPhrases, type BodyAreaKey } from './bodyAreas';
import { goalPhrase, goalPhrases } from './goalPhrases';
import { sayableAreas } from './programAreas';

export interface ProgramExplanationInput {
  /** How she is addressed. First name only; null keeps the sentence impersonal rather than guessing. */
  memberFirstName?: string | null;
  /** The program's member-facing name, already mapped. Never a clinical one. */
  programName: string;
  /**
   * The member-facing description its author wrote. Used verbatim when it
   * is safe, dropped when it is not, never rewritten: an author's own
   * sentence about her own program is better than anything composed here.
   */
  memberDescription?: string | null;
  /** What the work is on, in plain words, when the program is named after a body area rather than authored. */
  focus?: string | null;

  /** The goal option she picked as most important. Translated by ./goalPhrases.ts; never printed raw. */
  primaryGoal?: string | null;
  /** Her other stated goals, same treatment. */
  goals?: readonly string[] | null;
  /**
   * True only when the selection logic genuinely used her goal to choose
   * this program. Nothing in this product does that today, so the sentence
   * says the program supports her goal, which is what is true.
   */
  goalDroveSelection?: boolean;

  /** Areas her last posture check pointed at. See ./bodyAreas.ts. */
  bodyAreas?: readonly BodyAreaKey[] | null;
  /** Areas this program actually works. See ./programAreas.ts. The posture sentence is the intersection of the two, and is dropped when it is empty. */
  programAreas?: readonly BodyAreaKey[] | null;

  /** What the program's own exercises need. */
  equipment?: readonly string[] | null;

  durationWeeks?: number | null;
  sessionsPerWeek?: number | null;

  /** True when at least one week of the program prescribes more than week 1. */
  buildsOverTime?: boolean;
}

function shapePhrase(input: ProgramExplanationInput): string | null {
  const weeks = input.durationWeeks && input.durationWeeks > 0 ? input.durationWeeks : null;
  const perWeek = input.sessionsPerWeek && input.sessionsPerWeek > 0 ? input.sessionsPerWeek : null;
  const parts: string[] = [];
  if (weeks) parts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  if (perWeek) parts.push(`${perWeek} session${perWeek === 1 ? '' : 's'} a week`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Every sentence, in order, each one earned by a fact. Exported separately
 * from the joined text so a test can assert which rule produced which
 * sentence rather than pattern matching a paragraph.
 */
export function programExplanationSentences(input: ProgramExplanationInput): string[] {
  const sentences: string[] = [];

  // 1 and 2. What it is, and what it is for.
  //
  // The author's own member-facing description wins where there is one and
  // it is safe to show her, and the opening then drops the shape, because
  // an authored description already says how long the program runs and how
  // often. Repeating it back at her in the sentence above would read like
  // a form letter. Where there is no description, the shape IS the second
  // fact and the opening carries it.
  const name = (input.memberFirstName ?? '').trim();
  const authored = (input.memberDescription ?? '').trim();
  const useAuthored = authored !== '' && !containsClinicalLanguage(authored);
  const shape = useAuthored ? null : shapePhrase(input);
  const opening = shape ? `${input.programName}: ${shape}.` : `${input.programName}.`;
  sentences.push(name ? `${name}, this is your ${opening}` : `This is your ${opening}`);

  if (useAuthored) {
    sentences.push(authored.endsWith('.') ? authored : `${authored}.`);
  } else if (input.focus) {
    sentences.push(`It works on ${input.focus}.`);
  }

  // 3. Her goal, in words a person would use rather than in the words of
  //    the option she tapped.
  //
  //    The verb is the coach's correction. Nothing in this product picks a
  //    program from a goal, so the honest claim is that the program
  //    supports what she is after, not that it was built around it.
  const primary = goalPhrase(input.primaryGoal);
  const others = goalPhrases(input.goals).filter((phrase) => phrase !== primary);
  const closing = input.goalDroveSelection === true
    ? 'and this plan is built around that'
    : 'and this plan supports that';
  if (primary) {
    sentences.push(`You told us what matters most to you right now is ${primary}, ${closing}.`);
  } else if (others.length > 0) {
    sentences.push(`You told us you want to work on ${joinPhrases(others)}, ${closing}.`);
  }

  // 4. Where the work goes. Only the areas her check pointed at that this
  //    program genuinely works, never a finding and never how bad it was
  //    judged to be. An empty intersection drops the sentence, which is
  //    the correct answer to "her check found something and this program
  //    does not go there".
  const areas = sayableAreas(input.bodyAreas ?? [], input.programAreas ?? []);
  if (areas.length > 0) {
    sentences.push(
      `Your last posture check pointed at ${joinPhrases(bodyAreaPhrases(areas))}, so ${
        areas.length === 1 ? 'that gets' : 'those get'
      } attention in every session.`
    );
  }

  // 5. What she needs to have ready. Phrased as the thing to go and do
  //    rather than as a description of the program, so it still earns its
  //    place next to an authored description that already mentions kit.
  const kit = equipmentPhrases(input.equipment);
  sentences.push(
    kit.length > 0
      ? `Have ${joinPhrases(kit)} and enough floor to lie down on ready before you start.`
      : 'All you need is enough floor to lie down on.'
  );

  // 6. Where it starts, and how it moves.
  sentences.push(
    'It starts where you are now. Your coach sets the weights with you at your first session, so nothing here asks you to guess.'
  );
  if (input.buildsOverTime === true) {
    sentences.push('It asks for a little more as the weeks go on, and never more than you have already done.');
  }

  // 7. The door stays open.
  sentences.push('If something does not feel right, tell your coach and it gets changed.');

  return sentences;
}

/** The draft explanation as one paragraph, which is how it is stored and how she reads it. */
export function composeProgramExplanation(input: ProgramExplanationInput): string {
  return programExplanationSentences(input).join(' ');
}
