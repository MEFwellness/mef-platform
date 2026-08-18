/**
 * "Why this exercise", written for the member.
 *
 * WHAT THIS REPLACED. The member's workout screen has a "Why this exercise"
 * line and it was empty after the presentation pass, because the only
 * reason stored per exercise was the corrective engine's own: "strengthening
 * this pattern's long, underactive muscles (Lower Cross)". That is a true
 * sentence written for a coach, and lib/programs/memberPresentation.ts
 * correctly refuses to put it on her phone.
 *
 * HOW THE LINE IS PRODUCED. By rule, from facts the slot already carries:
 * its block, its movement pattern, whether it is done one side at a time,
 * and how important it is inside its session. Nothing is invented and
 * nothing is generated. There is no model in this path and no free text
 * from a coach in it either, which is what makes the leak test meaningful:
 * if the vocabulary is wrong it is wrong in this file, once, and the test
 * catches it before anybody reads it.
 *
 * THE OPENERS VARY, and that is this pass's change. A 24 exercise program
 * produced 24 lines that all began "This one ...", which reads as a
 * template rather than as somebody talking to her. Each block now has
 * several natural sentence patterns, and which one an exercise gets is
 * decided by a hash of the program's own identity plus that exercise's
 * position in it. So it is DETERMINISTIC (the same program renders the same
 * words on every screen, on every reload, and in the frozen snapshot it was
 * approved into) and VARIED within one program (consecutive exercises
 * cannot land on the same pattern, because the index moves by one and the
 * patterns are chosen by index).
 *
 * WHAT IT IS ALLOWED TO SAY. What the movement does for her body, and why
 * it is in her plan. Never a pattern name, never "long", "short",
 * "underactive" or "overactive", never a severity, never a promise about
 * what the exercise will fix. Asserted against MEMBER_FORBIDDEN_PHRASES for
 * every block, every pattern AND every opener in
 * tests/member-program-explanations.test.tsx.
 *
 * COACH VOCABULARY IS UNTOUCHED. selection_reasoning still holds exactly
 * what it held, and every coach screen still renders it. This is a second
 * field for a second reader, not a rewrite of the first.
 *
 * NO EM DASHES, per the house rule.
 */
import type { BlueprintBlock } from '@mef/shared-types-contracts';

/**
 * What the movement does, as a verb phrase that can complete any of the
 * openers below. Keyed by the movement pattern the blueprint slot already
 * records.
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
  anti_lateral_flexion: 'teaches the side of your middle to hold you upright',
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

/**
 * The sentence patterns each block's opening line can take, each one
 * completed by the effect phrase above.
 *
 * Two rules they all follow. The plain "This one ..." stays FIRST in every
 * list, so an exercise with no seed and no index reads exactly as it read
 * before this existed. And every pattern has to work with every effect in
 * its block, which is why they are written as "it <verb phrase>" rather
 * than as anything that would need the effect reworded.
 */
const OPENERS_BY_BLOCK: Record<BlueprintBlock, ((effect: string) => string)[]> = {
  release: [
    (e) => `This one ${e}.`,
    (e) => `Take your time here: it ${e}.`,
    (e) => `Nothing to push against in this one. It ${e}.`,
    (e) => `What you get out of this one: it ${e}.`,
  ],
  mobility: [
    (e) => `This one ${e}.`,
    (e) => `Ease into this one. It ${e}.`,
    (e) => `Room to move is the point here: it ${e}.`,
    (e) => `What you get out of this one: it ${e}.`,
  ],
  stability: [
    (e) => `This one ${e}.`,
    (e) => `Slow and controlled here: it ${e}.`,
    (e) => `Quality over speed in this one. It ${e}.`,
    (e) => `What you are building here: it ${e}.`,
  ],
  strength: [
    (e) => `This one ${e}.`,
    (e) => `This is real work: it ${e}.`,
    (e) => `Give this one your attention. It ${e}.`,
    (e) => `What you are building here: it ${e}.`,
  ],
  core: [
    (e) => `This one ${e}.`,
    (e) => `Stay steady through this one. It ${e}.`,
    (e) => `Keep breathing here: it ${e}.`,
    (e) => `What you are building here: it ${e}.`,
  ],
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

/**
 * A small, stable, non-cryptographic string hash. Deliberately not
 * Math.random and deliberately not a date: the same program has to compose
 * the same words in a coach's preview, in the frozen snapshot, and on the
 * member's screen months later.
 */
function seedHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export interface ExerciseReasoningInput {
  block: BlueprintBlock;
  /** The blueprint slot's own movement pattern. Null on the corrective path, which works in blocks. */
  movementPattern?: string | null;
  /** True when the whole set is done on one side before the other. */
  isPerSide?: boolean;
  /** 1 = the piece the session is built around. Null when the program does not rank its exercises. */
  priorityRank?: number | null;
  /**
   * The program's own identity, so one program's lines vary the same way
   * every time it is rendered and a different program varies differently.
   * A template id, an assignment id or a blueprint version id all work.
   * Absent means "no variation", which is the plain opener.
   */
  variantSeed?: string | null;
  /** This exercise's position in the program. Absent means "no variation". */
  variantIndex?: number | null;
}

/** Which opener this exercise gets. Exported so a test can assert the spread across a real program rather than inferring it from rendered text. */
export function openerIndexFor(
  block: BlueprintBlock,
  variantSeed: string | null | undefined,
  variantIndex: number | null | undefined
): number {
  const count = OPENERS_BY_BLOCK[block].length;
  if (!variantSeed || variantIndex === null || variantIndex === undefined) return 0;
  return (seedHash(variantSeed) + Math.max(0, Math.trunc(variantIndex))) % count;
}

/**
 * The sentence, or two or three of them, a member reads under "Why this
 * exercise". Deterministic: same slot, same seed, same position, same
 * words, every time.
 */
export function memberExerciseReasoning(input: ExerciseReasoningInput): string {
  const pattern = (input.movementPattern ?? '').trim().toLowerCase();
  const effect =
    (pattern && EFFECT_BY_PATTERN[`${input.block}:${pattern}`]) ||
    (pattern && EFFECT_BY_PATTERN[pattern]) ||
    EFFECT_BY_BLOCK[input.block];

  const opener =
    OPENERS_BY_BLOCK[input.block][
      openerIndexFor(input.block, input.variantSeed, input.variantIndex)
    ]!;

  const sentences = [opener(effect), roleSentence(input.block, input.priorityRank ?? null)];
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

/**
 * The same thing for an exercise SHE chose, from the two or three the rules
 * offered her. The slot's job is unchanged, which is the whole reason the
 * swap was allowed, so the line is the slot's line plus the honest fact
 * that this one was her pick.
 */
export function memberExerciseReasoningForMemberSwap(input: ExerciseReasoningInput): string {
  return `${memberExerciseReasoning(input)} You chose this one in place of the exercise that was here.`;
}

/** Every opener this product can compose, for the leak sweep. Not used at runtime. */
export function allComposedOpeners(): string[] {
  const lines: string[] = [];
  for (const [block, openers] of Object.entries(OPENERS_BY_BLOCK)) {
    const effects = [
      EFFECT_BY_BLOCK[block as BlueprintBlock],
      ...Object.values(EFFECT_BY_PATTERN),
    ];
    for (const opener of openers) {
      for (const effect of effects) lines.push(opener(effect));
    }
  }
  return lines;
}
