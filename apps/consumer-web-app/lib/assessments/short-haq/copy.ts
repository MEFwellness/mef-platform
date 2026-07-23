/**
 * Short Health Assessment Questionnaire — results/presentation copy.
 * Deliberately separate from questionnaire.json, same discipline as every
 * other questionnaire in lib/assessments/*: this is the file a
 * content/coaching team would edit to change what a member reads, no
 * application logic lives here.
 *
 * Every description stays in wellness-education language: it describes
 * what the category measures and what tends to move it, never a
 * diagnosis, a disease claim, or medical advice. See lib/assessments/
 * insights.ts's ASSESSMENT_SAFETY_STATEMENT for the same discipline
 * applied to the generated summary.
 *
 * No `attribution` field is set — unlike CHEK HLC1, this questionnaire is
 * original MEF Wellness content, not adapted from an external instrument.
 */

import type { AssessmentCopy } from '../engine/types';

export const SHORT_HAQ_COPY: AssessmentCopy = {
  displayTitle: 'Health Check-In Questionnaire',
  listDescription:
    'A brief MEF Wellness check-in across digestion, energy, sleep, stress, immunity, movement, circulation, focus, and hormonal balance.',
  welcomeSubtitle:
    'A short, whole-body check-in across nine everyday wellness areas. Answer honestly about how often each pattern shows up for you — there are no right answers, just a clearer picture of where to focus next.',
  estimatedMinutes: 12,
  categoryCopy: {
    digestive_wellness: {
      shortLabel: 'digestive wellness',
      shortDescription:
        'How your digestive system is responding day to day: bloating, regularity, and comfort after meals.',
      coachingFocus:
        'Slowing down at meals and noticing which foods reliably trigger discomfort is often the fastest way to bring this down.',
    },
    energy_and_fatigue: {
      shortLabel: 'energy',
      shortDescription:
        'Your everyday energy levels — whether they hold steady through the day or dip and crash.',
      coachingFocus:
        'A consistent sleep and meal rhythm tends to smooth out energy dips faster than any single supplement or stimulant.',
    },
    sleep_quality: {
      shortLabel: 'sleep quality',
      shortDescription:
        'How easily you fall asleep, stay asleep, and wake up feeling rested, not just how many hours you get.',
      coachingFocus:
        'A consistent wind-down routine and a fixed wake time are usually the highest-leverage places to start improving sleep quality.',
    },
    stress_and_mood: {
      shortLabel: 'stress and mood',
      shortDescription:
        'How much everyday stress, tension, and mood swings are showing up in your life right now.',
      coachingFocus:
        'Naming your biggest stress source and building one small recovery habit around it (breath work, a walk, an honest conversation) is usually the highest-leverage place to start.',
    },
    immune_and_respiratory: {
      shortLabel: 'immune resilience',
      shortDescription:
        'How your immune system and airways are handling everyday exposures: colds, congestion, and recovery time.',
      coachingFocus:
        'Prioritizing sleep and stress recovery is usually the most direct lever on immune resilience.',
    },
    musculoskeletal_comfort: {
      shortLabel: 'movement comfort',
      shortDescription:
        'Everyday aches, stiffness, and how comfortably your body moves through a normal day.',
      coachingFocus:
        'Short movement breaks throughout the day and attention to posture tend to ease this faster than occasional intense exercise alone.',
    },
    cardiovascular_and_circulation: {
      shortLabel: 'circulation',
      shortDescription:
        'Signs related to your heart and circulation: resting heart rhythm, temperature regulation, and everyday breathlessness.',
      coachingFocus:
        'Regular movement and hydration are the most direct everyday levers here — flag anything that feels sudden or severe to a healthcare provider right away.',
    },
    cognitive_clarity: {
      shortLabel: 'cognitive clarity',
      shortDescription:
        'How sharp and focused your thinking feels day to day: concentration, word recall, and mental fatigue.',
      coachingFocus:
        'Protecting sleep and reducing multitasking are usually the fastest ways to bring mental clarity back.',
    },
    hormonal_balance: {
      shortLabel: 'hormonal balance',
      shortDescription:
        'Everyday signs your hormonal patterns may be shifting: temperature regulation, libido, and cycle- or life-stage-related changes.',
      coachingFocus:
        'This category reflects patterns that are worth tracking over time — consistent sleep and stress recovery support hormonal balance broadly, and a healthcare provider is the right resource for anything that feels significant.',
    },
  },
};
