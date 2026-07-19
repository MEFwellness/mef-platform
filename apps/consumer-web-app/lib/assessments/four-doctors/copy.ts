/**
 * Four Doctors Assessment — results/presentation copy. Deliberately
 * separate from questionnaire.json: SPEC.md's "do not change wording"
 * rule protects the extracted instrument itself (the questions and answer
 * options a member actually answers), not the results-page copy this
 * product adds on top of a completed score. This is the one file a
 * content/coaching team would edit to change what a member reads on the
 * welcome screen or a category card, no application logic lives here.
 *
 * Every description stays in wellness-education language: it describes
 * what the category measures and what tends to move it, never a
 * diagnosis, a disease claim, or medical advice. See lib/assessments/
 * insights.ts's ASSESSMENT_SAFETY_STATEMENT for the same discipline
 * applied to the generated summary.
 */

import type { AssessmentCopy } from '../engine/types';

export const FOUR_DOCTORS_COPY: AssessmentCopy = {
  displayTitle: 'Four Doctors Assessment',
  listDescription:
    'A whole-life check-in across purpose, rest, nutrition, and movement, the four foundations that shape how you feel every day.',
  welcomeSubtitle:
    'Four simple check-ins on the foundations that shape how you feel every day: purpose and joy, rest and recovery, nutrition, and movement. Answer honestly, not how you think you should. Your answers are private and are used only to help your MEF Wellness coach see where to focus next, so the truth here is what makes your coaching better.',
  estimatedMinutes: 10,
  attribution: 'Based on a CHEK Practitioner questionnaire.',
  categoryCopy: {
    dr_happiness: {
      shortLabel: 'purpose and joy',
      shortDescription:
        'How clearly your life reflects your own sense of purpose, self-regard, and joy, from having a defined dream to doing work you love.',
      coachingFocus:
        'Naming one honest answer to "what does happiness mean to me" and building a few minutes of unstructured play into most days tends to move this score fastest.',
    },
    dr_quiet: {
      shortLabel: 'rest and recovery',
      shortDescription:
        'How well you sleep, wake, and recover, and how much daily space you make for stillness and introspection.',
      coachingFocus:
        'A consistent lights-out time and a short wind-down routine before bed is usually the highest-leverage place to start.',
    },
    dr_diet: {
      shortLabel: 'nutrition',
      shortDescription:
        'How closely your everyday eating (food quality, variety, timing, and how your body responds to it) supports how you feel.',
      coachingFocus:
        'Shifting even a few of your highest-scoring habits toward whole, unprocessed foods eaten at a calm, regular pace tends to move this score fastest.',
    },
    dr_movement: {
      shortLabel: 'movement and vitality',
      shortDescription:
        'How much your body moves, recovers, and feels capable, from daily exercise to breathing mechanics to how you feel warming up.',
      coachingFocus:
        'Starting with a short daily movement habit you can do regardless of today’s energy or ability tends to build momentum fastest.',
    },
  },
};
