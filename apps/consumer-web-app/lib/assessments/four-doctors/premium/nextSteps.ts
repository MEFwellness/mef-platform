/**
 * Four Doctors premium results — "Continue Your Journey" card config.
 * Navigation only, no recommendation logic: every card is either
 * `available` (a real, already-registered assessment, gets a real href)
 * or `coming_soon` (no route exists yet, renders as a quiet preview, no
 * link). Adding a future assessment once it ships is one entry here plus
 * an icon mapping in NextStepsCards.tsx, never a redesign of the card
 * itself, same pattern already proven in
 * lib/primal-pattern/premium/content.ts's NEXT_STEP_CARDS.
 */

export type NextStepCard = {
  id: string;
  title: string;
  description: string;
  status: 'available' | 'coming_soon';
  href?: string;
};

export const NEXT_STEP_CARDS: NextStepCard[] = [
  {
    id: 'primal-pattern',
    title: 'Primal Pattern Diet Type',
    description: 'A short quiz on how your body tends to respond to different fuel sources.',
    status: 'available',
    href: '/assessments/primal-pattern-diet-type',
  },
  {
    id: 'stress',
    title: 'Stress',
    description: 'A closer look at your everyday stress load and how you recover from it.',
    status: 'coming_soon',
  },
  {
    id: 'sleep',
    title: 'Sleep',
    description: 'A deeper check-in on sleep quality, timing, and how rested you actually feel.',
    status: 'coming_soon',
  },
  {
    id: 'digestion',
    title: 'Digestion',
    description: 'How well your digestion, assimilation, and elimination are actually working.',
    status: 'coming_soon',
  },
  {
    id: 'movement',
    title: 'Movement',
    description: 'A closer look at mobility, strength, and how your body moves day to day.',
    status: 'coming_soon',
  },
];
