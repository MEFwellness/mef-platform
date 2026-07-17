/**
 * Canned starter prompts per entry point — shared between the full
 * Conversation Coach page (app/conversation/page.tsx) and the floating
 * "Ask Root" launcher's compact panel
 * (components/FloatingCoachPanel.tsx), so both surfaces show the exact
 * same suggestion text for the same entry point rather than authoring it
 * twice.
 */

import type { ConversationEntryPoint } from '@mef/shared-types-contracts';

export const SUGGESTED_PROMPTS: Record<ConversationEntryPoint, string[]> = {
  nav: [
    "Talk through today's focus",
    'Help me understand my progress',
    "I want to reflect on how I'm doing",
  ],
  today_focus: ["Talk through today's challenge", 'Why is this my focus?'],
  today_easier_option: ['I need an easier option today'],
  today_why: ['Why is this my focus?'],
  today_completed: ["I completed this — what's next?"],
  progress_pattern: ['Help me understand this pattern'],
  progress_improved: ['What has improved?'],
  progress_focus: ['What should I focus on next?'],
  checkin_explain: ['Something affected my answers today'],
  checkin_feeling: ["I want to explain how I'm feeling"],
  dashboard: ['Help me understand my Wellness Index.', 'What should I focus on today?'],
  profile: ['Talk through my coaching journey so far', 'Help me understand my progress'],
  assessment: ['Explain what this result means.', 'What should I work on first?'],
  body_assessment: [
    'Explain what my body assessment found.',
    'What should I focus on before my next assessment?',
  ],
  food_lens: ['Why did this meal read that way?', 'What should I eat differently next time?'],
};
