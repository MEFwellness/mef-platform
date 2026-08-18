/**
 * "Why this exercise", written for the member.
 *
 * WHAT THIS REPLACED. The member's workout screen has a "Why this exercise"
 * line and it has been empty since the presentation pass, because the only
 * reason stored per exercise was the corrective engine's own: "strengthening
 * this pattern's long, underactive muscles (Lower Cross)". That is a true
 * sentence written for a coach, and lib/programs/memberPresentation.ts
 * correctly refuses to put it on her phone. Suppressing it was right;
 * leaving her with nothing was temporary.
 *
 * HOW THE LINE IS PRODUCED. By rule, from facts the slot already carries:
 * its block, its movement pattern, whether it is done one side at a time,
 * and how important it is inside its session. Nothing is invented, nothing
 * is generated, and the same slot produces the same sentence every time.
 * There is no model in this path and no free text from a coach in it
 * either, which is what makes the leak test below meaningful: if the
 * vocabulary is wrong it is wrong in this file, once, and the test catches
 * it before anybody reads it.
 *
 * WHAT IT IS ALLOWED TO SAY. What the movement does for her body, and why
 * it is in her plan. Never a pattern name, never "long", "short",
 * "underactive" or "overactive", never a severity, never a promise about
 * what the exercise will fix. Asserted against
 * MEMBER_FORBIDDEN_PHRASES for every block and every pattern in
 * tests/member-program-explanations.test.ts.
 *
 * COACH VOCABULARY IS UNTOUCHED. selection_reasoning still holds exactly
 * what it held, and every coach screen still renders it. This is a second
 * field for a second reader, not a rewrite of the first.
 */
import type { BlueprintBlock } from '@mef/shared-types-contracts';

/**
 * What the movement does, completing "This one ...". Keyed by the movement
 * pattern the blueprint slot already records.
 *
 * A few patterns mean different things in different blocks: a hip hinge in
 * the mobility block is a hamstring stretch and in the strength block it is
 * a deadlift. Those are keyed as `block:pattern` and win over the bare
 * pattern.
 */
const EFFECT_BY_PATTERN: Record<string, string> = {
  // Openers.
  spinal: 'loosens your back with slow, easy movement',
  shoulder: 'gets your shoulders moving before they have to work',
  thoracic: 'opens up your upper back so reaching overhead feels easier',
  hip_flexion: 'opens up the front of your hips, which is where sitting tightens you up',
  scapular: 'switches on the muscles between your shoulder blades',
  hip_rotation: 'builds control at the side of your hip, which is what keeps your knee tracking well',
  'mobility:hip_hinge': 'lengthens the back of your legs so you can bend from the hips instead of the waist',
  'stability:hip_hinge': 'switches your glutes on so they lead the lifts that follow',

  // Strength.
  squat: 'builds strength through your legs and hips',
  lunge: 'builds strength one leg at a time, so your stronger side cannot carry the other',
  'strength:hip_hinge': 'builds strength through your hips, glutes and the back of your legs',
  hip_hinge: 'builds strength through your hips and the back of your legs',
  vertical_push: 'builds strength overhead, through your shoulders and arms',
  horizontal_push: 'builds pressing strength through your chest, shoulders and arms',
  vertical_pull: 'builds pulling strength through your back and arms',
  horizontal_pull: 'builds pulling strength through your back and the back of your shoulders',
  carry: 'builds your grip and keeps you tall through the middle while you walk with weight',

  // Core.
  anti_extension: 'teaches your middle to hold steady instead of letting your back sag',
  anti_rotation: 'teaches your middle to stay still while your arms and legs move',
  anti_flexion: 'builds strength down the back of your body',
  rotation: 'builds control as your trunk turns',
};

/** The fallback, when a slot records no movement pattern. Every corrective-born exercise lands here, because that engine works in blocks rather than patterns. */
const EFFECT_BY_BLOCK: Record<BlueprintBlock, string> = {
  release: 'loosens things up before you start working',
  mobility: 'opens up range so the movements after it feel easier',
  stability: 'switches on the muscles you need for the work that comes next',
  strength: 'builds strength you can use in everyday life',
  core: 'builds control through your middle',
};

/** Why it is in her plan. From the block, and from whether it is the piece the session is built around. */
function roleSentence(block: BlueprintBlock, priorityRank: number | null): string {
  switch (block) {
    case 'release':
    case 'mobility':
      return 'It is here to get you ready, not to tire you out.';
    case 'stability':
      return 'It is here so the harder work that follows comes from the right places.';
    case 'strength':
      return priorityRank === 1
        ? 'It is the main lift of this session, so this is the one to give your best effort to.'
        : 'It is in your plan to build strength you can use outside of your sessions.';
    case 'core':
      return 'It is in your plan because a steady middle makes everything else feel easier.';
  }
}

export interface ExerciseReasoningInput {
  block: BlueprintBlock;
  /** The blueprint slot's own movement pattern. Null on the corrective path, which works in blocks. */
  movementPattern?: string | null;
  /** True when the whole set is done on one side before the other. */
  isPerSide?: boolean;
  /** 1 = the piece the session is built around. Null when the program does not rank its exercises. */
  priorityRank?: number | null;
}

/**
 * The sentence, or two or three of them, a member reads under "Why this
 * exercise". Deterministic: same slot, same words, every time.
 */
export function memberExerciseReasoning(input: ExerciseReasoningInput): string {
  const pattern = (input.movementPattern ?? '').trim().toLowerCase();
  const effect =
    (pattern && EFFECT_BY_PATTERN[`${input.block}:${pattern}`]) ||
    (pattern && EFFECT_BY_PATTERN[pattern]) ||
    EFFECT_BY_BLOCK[input.block];

  const sentences = [`This one ${effect}.`, roleSentence(input.block, input.priorityRank ?? null)];
  if (input.isPerSide === true) {
    sentences.push('You finish the whole set on one side before you swap over.');
  }
  return sentences.join(' ');
}

/**
 * The same thing for an exercise a coach swapped in from the full library.
 * The slot's job has not changed, so the slot's own reasoning still
 * describes what the exercise is there to do, and the only thing added is
 * the honest fact that her coach chose this one specifically.
 */
export function memberExerciseReasoningForOverride(input: ExerciseReasoningInput): string {
  return `${memberExerciseReasoning(input)} Your coach picked this one for you specifically.`;
}
