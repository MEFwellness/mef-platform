/**
 * Coaching copy for the Daily Wellness Index's priority/strongest-area
 * sections. Pure content, no calculation — WellnessIndexCard picks which
 * entry to show using result.priority.key / result.strongest.key, which
 * wellness-index.ts already derives from real check-in data (the lowest-
 * and highest-scoring metric that was actually logged today). Nothing
 * here decides WHICH category is the priority; it only supplies what to
 * say once that's already been determined from real data.
 *
 * Coaching language only — no diagnostic or medical claims. Pain's
 * copy explicitly defers to a healthcare provider rather than suggesting
 * anything clinical, per "do not provide medical advice."
 */

import type { WellnessMetricKey } from './wellness-index';

export type CoachingCopy = {
  /** Heading shown in Today's Priority, e.g. "Increase Your Daily Movement" */
  priorityTitle: string;
  /** "Why this matters" paragraph, references the category by name. */
  priorityWhy: string;
  /** One concrete, doable action for today. */
  priorityAction: string;
  /** One sentence explaining why this being strong is helping today. */
  strongestNote: string;
};

export const WELLNESS_COACHING: Record<WellnessMetricKey, CoachingCopy> = {
  sleep: {
    priorityTitle: 'Improve Your Sleep Recovery',
    priorityWhy:
      'Your check-in suggests sleep is currently the area with the greatest opportunity for improvement. Sleep is when your body repairs itself and regulates the hormones behind energy, mood, and stress resilience — a short or restless night tends to ripple into how the rest of the day feels.',
    priorityAction:
      'Wind down 30 minutes earlier tonight and keep screens out of the last 30 minutes before bed.',
    strongestNote:
      'Solid sleep is giving your body real recovery time — that foundation is doing a lot of the work behind your other wellness areas today.',
  },
  stress: {
    priorityTitle: 'Reduce Your Stress Load',
    priorityWhy:
      'Your check-in suggests stress is currently the area with the greatest opportunity for improvement. Sustained stress keeps your nervous system in a heightened state, which can affect sleep, digestion, and how recovered you feel.',
    priorityAction:
      'Take 5 minutes for slow, deliberate breathing or step outside for a short walk today.',
    strongestNote:
      'Your stress is well managed today — that calmer nervous system state supports better sleep, digestion, and steadier energy across the board.',
  },
  energy: {
    priorityTitle: 'Rebuild Your Energy',
    priorityWhy:
      'Your check-in suggests energy is currently the area with the greatest opportunity for improvement. Low energy is often a downstream signal from sleep, hydration, or stress rather than a standalone issue, so small changes elsewhere often help here too.',
    priorityAction: 'Get some daylight and a glass of water before you reach for caffeine today.',
    strongestNote:
      'Strong energy today is a good sign the basics — sleep, hydration, and stress — are working together well.',
  },
  mood: {
    priorityTitle: 'Support Your Mood',
    priorityWhy:
      'Your check-in suggests mood is currently the area with the greatest opportunity for improvement. Mood is closely tied to sleep, movement, and connection with others — small, consistent actions tend to help more than any single big change.',
    priorityAction:
      'Reach out to someone you enjoy talking to, get some sunlight, or take a short walk today.',
    strongestNote:
      'A good mood today is a real asset — it tends to make everything else, from movement to your check-ins, easier to follow through on.',
  },
  hydration: {
    priorityTitle: 'Increase Your Hydration',
    priorityWhy:
      'Your check-in suggests hydration is currently the area with the greatest opportunity for improvement. Even mild dehydration can affect energy, focus, and how well your body recovers.',
    priorityAction: 'Keep water within reach and aim for a glass with each meal today.',
    strongestNote:
      'Staying well hydrated today is supporting your energy and recovery more than it might seem.',
  },
  digestion: {
    priorityTitle: 'Support Your Digestion',
    priorityWhy:
      'Your check-in suggests digestion is currently the area with the greatest opportunity for improvement. Digestion has a direct effect on energy and overall comfort — how and when you eat matters as much as what you eat.',
    priorityAction:
      'Slow down at your next meal — chew thoroughly and avoid eating while rushed or distracted.',
    strongestNote:
      'Digestion running smoothly today is a quiet but real contributor to your energy and comfort.',
  },
  movement: {
    priorityTitle: 'Increase Your Daily Movement',
    priorityWhy:
      'Your check-in suggests movement is currently the area with the greatest opportunity for improvement. Even a short walk or mobility session can improve circulation, reduce stiffness, boost energy, and positively influence your Daily Wellness Index.',
    priorityAction: 'Take a 15–20 minute walk or complete one guided mobility session.',
    strongestNote:
      "Staying active today is paying off — movement tends to lift energy and mood while it's happening and afterward.",
  },
  pain: {
    priorityTitle: 'Ease Physical Strain',
    priorityWhy:
      'Your check-in suggests pain or discomfort is currently the area with the greatest opportunity for improvement. Pushing through discomfort can compound over time, while gentle movement and rest often help the body settle.',
    priorityAction:
      'Reduce strain where you can today and try some gentle stretching. Check with a healthcare provider if discomfort persists or worsens.',
    strongestNote:
      'Being pain-free today gives your body more room to focus on recovery and staying active.',
  },
};
