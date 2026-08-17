/**
 * CHEK HLC1 Nutrition & Lifestyle questionnaire — results/presentation
 * copy. Deliberately separate from questionnaire.json: SPEC.md's "do not
 * change wording" rule protects the extracted instrument itself (the
 * questions and answer options a member actually answers), not the
 * results-page copy this product adds on top of a completed score. This
 * is the one file a content/coaching team would edit to change what a
 * member reads on the welcome screen or a category card — no application
 * logic lives here.
 *
 * Every description stays in wellness-education language: it describes
 * what the category measures and what tends to move it, never a
 * diagnosis, a disease claim, or medical advice. See lib/assessments/
 * insights.ts's SAFETY_STATEMENT for the same discipline applied to the
 * generated summary.
 */

import type { AssessmentCopy } from '../engine/types';

export const CHEK_HLC1_COPY: AssessmentCopy = {
  displayTitle: 'Nutrition & Lifestyle Questionnaire',
  listDescription:
    'A MEF Wellness check-in across food, stress, your daily rhythm, meal timing, and digestion.',
  welcomeSubtitle:
    'A whole-lifestyle wellness check-in across food, stress, your daily rhythm, meal timing, digestion, and more. The same framework MEF Wellness coaches use to find where your next win is hiding.',
  estimatedMinutes: 15,
  attribution: 'Based on a CHEK Practitioner questionnaire.',
  categoryCopy: {
    you_are_what_you_eat: {
      shortLabel: 'food choices',
      shortDescription:
        'How closely your everyday food choices (freshness, quality, and how processed they are) align with a whole-foods way of eating.',
      coachingFocus:
        'Shifting even a few of your highest-scoring habits toward whole, fresh, minimally processed foods tends to move this score the fastest.',
    },
    stress: {
      shortLabel: 'stress',
      shortDescription:
        'How much everyday stress (work, relationships, and emotional load) is showing up in your life right now.',
      coachingFocus:
        'Naming your biggest stress source and building one small recovery habit around it (breath work, a walk, an honest conversation) is usually the highest-leverage place to start.',
    },
    circadian_health: {
      shortLabel: 'your daily rhythm',
      shortDescription:
        "How well your sleep and wake timing, meal timing, and daily rhythm line up with each other.",
      coachingFocus:
        'Anchoring a consistent wake time and getting morning light tends to realign this rhythm faster than any single evening change.',
    },
    you_are_when_you_eat: {
      shortLabel: 'meal timing',
      shortDescription:
        'The timing and structure of your meals: how consistently and mindfully you eat, not just what you eat.',
      coachingFocus:
        'Eating on a more regular rhythm, and giving meals your full attention, is usually more impactful here than any specific food swap.',
    },
    digestive_system_health: {
      shortLabel: 'how digestion feels',
      shortDescription:
        'How your digestion is going day to day: bloating, regularity, and comfort after meals.',
      coachingFocus:
        'Slowing down at meals and noticing which foods reliably trigger discomfort is often the fastest way to bring this down.',
    },
    fungus_and_parasites: {
      shortLabel: 'bloating and cravings',
      shortDescription:
        'Things from your history (past medications, dental work) and everyday habits that can leave your gut less settled over time.',
      coachingFocus:
        'This one reflects your history more than your daily choices. The habits worth focusing on now are the sugar and processed-food patterns that keep it going.',
    },
    detoxification_system_health: {
      shortLabel: 'skin, headaches and strong smells',
      shortDescription:
        "What you notice around energy, skin, headaches, and how you react to strong chemical or fragrance smells.",
      coachingFocus:
        'Cutting back on the strongest chemical and fragrance exposures around you, and covering the basics of water, movement and sleep, is the most direct thing to try here.',
    },
  },
};
