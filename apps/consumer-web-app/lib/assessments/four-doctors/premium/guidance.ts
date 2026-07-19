/**
 * Four Doctors premium results — the single centralized source of
 * per-category, per-zone guidance shown on a Doctor Summary Card's
 * expanded state. Nothing in components/assessments/four-doctors-results/
 * generates, infers, or composes guidance text of its own; every card
 * reads its one entry from here, keyed by `${categoryId}:${zoneId}`, and
 * renders exactly what's here. `getGuidance()` is the only way this file
 * is read, so updating what a member sees for a given category and zone
 * is the entire change, no component edits needed.
 *
 * Every entry stays in wellness-education language: current strengths,
 * the single biggest opportunity, and a small set of practical next
 * steps, never a diagnosis, a disease claim, or fear-based language. See
 * lib/assessments/insights.ts's ASSESSMENT_SAFETY_STATEMENT for the same
 * discipline applied to the generated summary elsewhere in this feature.
 */

import type { ZoneId } from './zones';

export type GuidanceEntry = {
  /** What's already working, specific enough to feel earned, not generic praise. */
  strengths: string;
  /** The single highest-leverage thing to focus on next, framed as opportunity, not deficiency. */
  opportunity: string;
  /** Exactly three small, practical, doable-this-week actions. */
  recommendations: readonly [string, string, string];
  /** One habit to focus on this week, small enough to actually keep. */
  weeklyHabit: string;
};

type GuidanceKey = `${string}:${ZoneId}`;

const GUIDANCE: Record<GuidanceKey, GuidanceEntry> = {
  'dr_happiness:work_in': {
    strengths:
      'Taking an honest look at your sense of purpose and joy is itself a real step, most people never get this far.',
    opportunity:
      'The biggest opportunity right now is simply getting clearer on what a good day actually looks like for you, that clarity tends to move this score fastest.',
    recommendations: [
      'Write down one honest answer to "what does happiness mean to me right now" without editing it.',
      'Block ten unstructured minutes most days for something you actually enjoy, no agenda attached.',
      'Notice one moment each day that felt genuinely good, and jot it down before bed.',
    ],
    weeklyHabit:
      'Pick one small thing you enjoy and do it on purpose at least three times this week.',
  },
  'dr_happiness:caution': {
    strengths:
      'You already have some real clarity on what matters to you, a foundation worth building on rather than starting over.',
    opportunity:
      'The biggest opportunity is consistency, turning the moments of purpose and joy you already have into a more regular part of most days.',
    recommendations: [
      'Revisit your answer to "what does happiness mean to me" and check it still feels true.',
      'Protect a standing block of unstructured time each week rather than leaving it to chance.',
      'Say yes to one thing that sounds genuinely enjoyable, even if it feels unproductive.',
    ],
    weeklyHabit:
      'Put one recurring block of unstructured, enjoyable time on your calendar this week.',
  },
  'dr_happiness:workout_to_ability': {
    strengths:
      'You have a strong, working sense of purpose and regularly make room for joy, one of your steadiest foundations.',
    opportunity:
      'The biggest opportunity now is protecting what already works as life gets busier, rather than adding anything new.',
    recommendations: [
      'Keep the routines that already give you a sense of purpose visible on your calendar.',
      "Share what's working for you with someone else, teaching it tends to deepen it.",
      "Revisit your definition of happiness every few months, it's allowed to change.",
    ],
    weeklyHabit:
      'Protect your existing unstructured, enjoyable time from getting crowded out this week.',
  },

  'dr_quiet:work_in': {
    strengths: 'Recognizing that rest and recovery need attention is a meaningful first step.',
    opportunity:
      'The biggest opportunity is a consistent lights-out time and a short wind-down routine, small and steady changes here tend to move this score fastest.',
    recommendations: [
      'Pick one consistent lights-out time and hold it most nights this week.',
      'Build a short, simple wind-down routine for the 20 minutes before bed.',
      'Add five quiet, screen-free minutes somewhere in your day.',
    ],
    weeklyHabit: 'Go to bed at the same time at least five nights this week.',
  },
  'dr_quiet:caution': {
    strengths:
      'You already have some rhythm to your rest, and that consistency is doing real work for you.',
    opportunity:
      "The biggest opportunity is smoothing out the nights that don't go as planned, rather than overhauling what's already working.",
    recommendations: [
      "Notice what's different on the nights your sleep feels worse, and adjust one thing.",
      'Extend your wind-down routine by five or ten minutes.',
      'Build in a short stretch of stillness or quiet reflection most days.',
    ],
    weeklyHabit: 'Keep the same wake time every day this week, even on days off.',
  },
  'dr_quiet:workout_to_ability': {
    strengths:
      'Your rest and recovery foundation is strong, sleep, stillness, and introspection all seem to be working for you.',
    opportunity:
      'The biggest opportunity now is protecting this foundation when travel, stress, or a busy stretch threatens to disrupt it.',
    recommendations: [
      'Keep your wind-down routine intact even when your schedule gets busy.',
      'Notice early signs of disrupted sleep and address them quickly rather than letting them build.',
      'Keep making room for stillness and introspection, not just sleep.',
    ],
    weeklyHabit: 'Protect your consistent bedtime through at least one busier day this week.',
  },

  'dr_diet:work_in': {
    strengths:
      "Taking an honest look at your everyday eating is the real starting point, and you've just done that.",
    opportunity:
      'The biggest opportunity is your highest-scoring habits right now, shifting even a few of them toward whole, unprocessed foods tends to move this score fastest.',
    recommendations: [
      'Pick one meal a day to eat at a calm, regular pace without distraction.',
      'Swap one processed staple this week for a whole-food alternative you actually enjoy.',
      'Notice how your body responds after meals, energy, digestion, mood, without judgment.',
    ],
    weeklyHabit: 'Eat one meal a day sitting down, unhurried, at least five times this week.',
  },
  'dr_diet:caution': {
    strengths:
      'You already have some solid nutrition habits in place, real progress to build from.',
    opportunity:
      "The biggest opportunity is variety and timing, rounding out what's already working rather than starting over.",
    recommendations: [
      "Add one more whole-food option into your week that you don't already eat regularly.",
      'Notice if timing, skipped meals, eating late, is affecting how you feel.',
      'Keep the calm, regular pace you already have at some meals and extend it to one more.',
    ],
    weeklyHabit: 'Add one new whole, unprocessed food into your rotation this week.',
  },
  'dr_diet:workout_to_ability': {
    strengths:
      'Your everyday eating is a strong foundation, food quality, variety, and timing all seem to be supporting how you feel.',
    opportunity:
      "The biggest opportunity now is maintaining this through the weeks that get hectic, rather than changing what's working.",
    recommendations: [
      'Keep the habits that are already working visible and easy, prep ahead when you can.',
      'Stay curious about how specific foods affect your energy, small tweaks still add value here.',
      "Share what's working with your coach so it can inform the rest of your plan.",
    ],
    weeklyHabit:
      "Plan your meals for one busier day this week ahead of time, so a good routine doesn't slip.",
  },

  'dr_movement:work_in': {
    strengths:
      "You've taken an honest look at how your body moves and feels, that clarity is the real starting point.",
    opportunity:
      'The biggest opportunity is a movement habit you can do regardless of how much energy or ability you have on a given day, momentum matters more than intensity right now.',
    recommendations: [
      'Pick one short movement habit, even five minutes, you can do on your lowest-energy days.',
      'Add a few minutes of easy mobility or stretching to your morning or evening.',
      'Notice how you feel warming up, and give yourself permission to start slow.',
    ],
    weeklyHabit:
      'Do your short daily movement habit at least four days this week, regardless of intensity.',
  },
  'dr_movement:caution': {
    strengths:
      'You already have some regular movement in your life, and that consistency is doing real work.',
    opportunity:
      'The biggest opportunity is building capacity a little at a time, rather than pushing intensity before your foundation is ready.',
    recommendations: [
      'Add one more day of easy movement to your current routine.',
      'Pay attention to recovery, sleep, soreness, energy, between sessions.',
      'Mix in some breathing or mobility work alongside whatever you already do.',
    ],
    weeklyHabit: 'Add one extra day of easy, low-intensity movement this week.',
  },
  'dr_movement:workout_to_ability': {
    strengths:
      "Your movement foundation is strong, you're moving, recovering, and feeling capable, and it supports training at your full capacity.",
    opportunity:
      'The biggest opportunity now is progressing thoughtfully, adding challenge without outrunning your recovery.',
    recommendations: [
      'Keep tracking how you recover between sessions, not just how hard you trained.',
      'Introduce new challenge gradually, one variable at a time.',
      'Keep breathing mechanics and warmup quality part of your routine, not just the workout itself.',
    ],
    weeklyHabit:
      'Add one small progression, more load, more time, or a new movement, to your routine this week.',
  },
};

const FALLBACK_GUIDANCE: GuidanceEntry = {
  strengths:
    "You've completed this section, and that honest self-check is real progress on its own.",
  opportunity: 'Your coach can help identify the highest-leverage next step for this area.',
  recommendations: [
    'Talk through this result with your coach at your next check-in.',
    'Revisit this area again after your next assessment to see how it moves.',
    'Focus on consistency in the habits you already have before adding new ones.',
  ],
  weeklyHabit: 'Choose one small, doable habit in this area to focus on this week.',
};

export function getGuidance(categoryId: string, zoneId: ZoneId): GuidanceEntry {
  return GUIDANCE[`${categoryId}:${zoneId}`] ?? FALLBACK_GUIDANCE;
}
