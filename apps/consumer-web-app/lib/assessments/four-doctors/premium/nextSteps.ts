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
    /*
      The Rooted Reset Fuel Pattern Assessment replaced Primal Pattern
      Diet Type here on 2026-09-13. Same card, same slot, the new
      instrument's own name and route, and a description written in the
      house voice: it describes a starting pattern rather than claiming
      anything about how a body responds.
    */
    id: 'fuel-pattern',
    title: 'Rooted Reset Fuel Pattern Assessment',
    description: 'Twenty four questions about how meals actually land for you, and the fuel pattern they suggest.',
    status: 'available',
    href: '/assessments/fuel-pattern',
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
