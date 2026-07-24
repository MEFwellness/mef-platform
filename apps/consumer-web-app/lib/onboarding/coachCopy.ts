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

/** New (post-legacy-12) questions author their helper copy directly on the row (question.helper_text) rather than through this map — COACH_HELPER stays reserved for the original 12. */
export function coachHelperFor(question: OnboardingQuestion): string | null {
  return COACH_HELPER[question.question_key] ?? question.helper_text ?? null;
}

/**
 * The premium welcome screen shown once, before the member's first
 * question (OnboardingIntro.tsx) — the first five seconds of Rooted Reset.
 * Deliberately outcome-first, not task-first: nothing here talks about
 * "collecting information" or counts questions as the headline promise
 * (the adaptive engine — lib/onboarding/adaptivePlan.ts — now varies the
 * real count by concern anyway, 13-14, so leading with an exact number
 * would either be wrong or require hedging). ONBOARDING_JOURNEY_STEPS
 * below carries the "why keep going" narrative instead of a bare
 * question/time checklist.
 */
export const EXPECTATIONS_COPY = {
  eyebrow: 'Step 1 of 3',
  title: 'Welcome to the beginning of your wellness story.',
  purpose:
    'A great coach starts by listening. This is a short, guided conversation about the patterns behind how you feel, move, and recover — so everything that follows is built around you.',
  timeCaption: 'Takes about 4 minutes.',
  cta: "Let's begin",
};

/**
 * The journey-psychology stepper inside the welcome card — reframes "12
 * questions" as three chapters the member is beginning, not completing.
 * Step 1 is this assessment; steps 2-3 preview what it leads to (the
 * guest observation screen and, past signup, the ongoing check-in/
 * reassessment loop) so the page reads as the start of a relationship,
 * not a form. Names deliberately echo vocabulary already used downstream
 * (lib/onboarding/journeyPreview.ts's "Wellness Timeline", signup's "the
 * beginning of your story") so the language stays consistent across the
 * whole first-five-minutes experience, not just this one screen.
 */
export const ONBOARDING_JOURNEY_STEPS = [
  {
    title: 'Understand You',
    body: "A short, guided conversation about what's really going on — no right or wrong answers, just what's true for you.",
  },
  {
    title: 'Your First Observation',
    body: 'A personalized reflection on the patterns we notice together — honest, non-diagnostic, and just for you.',
  },
  {
    title: 'Your Wellness Story Begins',
    body: 'Every check-in and reassessment from here builds on what we learn today — your picture gets clearer over time.',
  },
] as const;

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

/**
 * Shown once, right after the concern deep-dive (Phase 2 of
 * lib/onboarding/adaptivePlan.ts) finishes and the assessment moves into
 * the shared wellness pass (Phase 3) — the "coach zooming out" beat the
 * product brief asks for. Deliberately one generic line rather than a
 * per-concern map: the deep dive itself was already personalized, so this
 * beat's job is just to make the transition feel smooth, not to add more
 * content to author/maintain.
 */
export const ZOOM_OUT_TRANSITION =
  "Thanks for walking me through that — it's helping me understand you better. Now let's zoom out for a moment and look at the fuller picture.";

/**
 * Shown inline, directly above the one question each concern pulls forward
 * (lib/onboarding/branching.ts's contextNoteFor) — explains *why* this
 * particular question is coming up next, so the reorder itself reads as
 * adaptive rather than a silent shuffle. No entry for `sleep`, which never
 * forwards a question (see the comment on PRIMARY_CONCERN_PRIORITY).
 */
export const FORWARDED_CONTEXT_NOTE: Record<string, string> = {
  pain: "Because pain is on your mind, let's pinpoint where you're feeling it.",
  energy: "Because energy is what you're after, let's dig into how it's really been.",
  stress: 'Stress often shows up in the body in surprising ways — like digestion.',
  weight: 'Weight goals usually connect to movement first — worth touching on now.',
  digestion: "Since digestion is what's on your mind, let's start right there.",
  movement: "Let's talk about how you're moving these days, since that's the focus.",
  performance: 'Performance starts with energy — worth checking in on that first.',
  healthy_aging: "Movement plays a big role in aging well, so let's cover that next.",
  habits: 'Since building better habits is the goal, this one gets at what that looks like.',
  general_optimization: "You're after overall wellness — let's hear what that looks like for you.",
  other: "Let's hear a bit more, in your own words, about what's going on.",
};
