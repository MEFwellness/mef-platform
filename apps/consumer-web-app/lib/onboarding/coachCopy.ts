/**
 * Coach-voice copy for the live onboarding intake screen only. The DB
 * `onboarding_questions.prompt_text` stays exactly as seeded and keeps
 * being used verbatim by the retrospective/coach-facing record views
 * (BaselineAssessmentView.tsx and its callers) — this module supplies a
 * warmer, conversational phrasing for the one-time live conversation, not
 * a replacement for the permanent record's wording. Falls back to the DB
 * `prompt_text` for any question_key not listed here, so a future question
 * added to onboarding_questions before this map is updated still renders.
 */

import type { OnboardingQuestion } from '@mef/shared-types-contracts';

export const COACH_PROMPT: Record<string, string> = {
  primary_concern: "What's the main thing you'd like us to work on together?",
  baseline_sleep_quality:
    "Let's start with sleep — most nights, how well would you say you're sleeping?",
  baseline_sleep_hours: 'And roughly how many hours of sleep are you getting on a typical night?',
  baseline_stress_level: "How much stress would you say you're carrying on a normal day?",
  baseline_energy_level: "What's your energy usually like, day to day?",
  baseline_digestion: 'How has your digestion been feeling lately?',
  baseline_pain_areas: "Is there anywhere in your body that's been bothering you lately?",
  baseline_movement_frequency:
    'On a typical week, how many days do you get some intentional movement in?',
  baseline_goals: 'Looking ahead 90 days, what would you like to feel or be able to do?',
  readiness_importance: 'Right now, how important does making a change feel to you?',
  readiness_confidence: 'And how confident do you feel that you could actually make that change?',
  readiness_actively_working: 'Are you already taking steps toward this, even small ones?',
};

export const COACH_HELPER: Record<string, string> = {
  primary_concern: "Pick whatever feels closest — we'll go from there.",
  baseline_pain_areas: "Select any that apply — or none, if nothing's standing out.",
  readiness_importance: '0 = not important at all, 10 = extremely important.',
  readiness_confidence: '0 = not confident at all, 10 = extremely confident.',
};

export function coachPromptFor(question: OnboardingQuestion): string {
  return COACH_PROMPT[question.question_key] ?? question.prompt_text;
}

export function coachHelperFor(question: OnboardingQuestion): string | null {
  return COACH_HELPER[question.question_key] ?? null;
}

export const EXPECTATIONS_COPY = {
  title: "Let's get to know you",
  purpose:
    "This helps us understand how your body has been responding to daily life — there's nothing to prepare, just answer honestly.",
  questionCount: 12,
  minutes: 3,
  reassurance: 'There are no right or wrong answers here.',
  cta: 'Begin',
};

/**
 * Shown once, right after `primary_concern` is answered — a short,
 * personalized acknowledgment of what the member just told us, whether or
 * not it changes the question order (see branching.ts). Keyed by the raw
 * `primary_concern` enum value.
 */
export const TRANSITION_COPY: Record<string, string> = {
  pain: "You mentioned pain is on your mind — let's start with where you're feeling it.",
  energy:
    "Since energy is what you're after, let's talk about how you've been feeling day to day.",
  sleep: "Sleep is where you'd like to focus, so let's start right there.",
  stress:
    "Stress often shows up in the body in surprising ways — let's check in on your digestion too.",
  weight:
    "Weight goals usually connect to movement and how your body processes food — let's touch on both.",
  digestion: "Let's dig into digestion first, since that's what brought you here.",
  movement: "Let's talk about how you're moving these days.",
  performance: "Performance starts with energy and movement — let's cover those next.",
  healthy_aging: "Healthy aging touches everything, so we'll move through each area together.",
  habits:
    "Since building better habits is the goal, tell us a bit about what that looks like for you.",
  general_optimization: "You're focused on overall wellness — let's build a full picture together.",
  other: "Let's build a full picture of where you're starting from.",
};

export const DEFAULT_TRANSITION = "Let's build a full picture of where you're starting from.";
