/**
 * Extracts structured coaching-continuity memory from a member's own
 * message — deliberately deterministic keyword matching, not a second LLM
 * call asked to "summarize what to remember." Section 11 of the milestone
 * is explicit that memory must never be fabricated and that "not every
 * casual sentence" should become permanent memory; a second generative
 * pass over free text is exactly the kind of thing that could invent a
 * barrier or preference that was never really said. This mirrors
 * lib/safety/categories.ts's own choice of plain substring matching over
 * an NLP model for the same auditability reason.
 *
 * At most ONE candidate per message is returned — a single sentence rarely
 * reports more than one genuinely new fact, and capping this keeps casual
 * chatter from flooding conversation_memory.
 */

import type { ConversationMemoryType } from '@mef/shared-types-contracts';

export type MemoryCandidate = {
  memoryType: ConversationMemoryType;
  content: string;
};

type Rule = {
  memoryType: ConversationMemoryType;
  keywords: string[];
};

// Ordered most-specific-intent-first: a coach follow-up request should win
// over a generic barrier mention in the same sentence.
const RULES: Rule[] = [
  {
    memoryType: 'coach_follow_up_request',
    keywords: [
      'want my coach',
      'talk to my coach',
      'someone follow up',
      'coach follow up',
      'coach to review',
      'coach reach out',
      "don't feel comfortable continuing",
      'do not feel comfortable continuing',
    ],
  },
  {
    memoryType: 'successful_strategy',
    keywords: [
      'that worked',
      'that helped',
      'helped me',
      'easier for me',
      'easier to maintain',
      'worked well for me',
      'made a difference',
    ],
  },
  {
    memoryType: 'action_chosen',
    keywords: [
      'i completed',
      'i did my',
      'i finished',
      "i've done",
      'i have done',
      'i went with',
      'i decided to',
    ],
  },
  {
    memoryType: 'life_event',
    keywords: [
      'traveling',
      'went on a trip',
      'new job',
      'started a new job',
      'moved to',
      'surgery',
      'got sick',
      'had a baby',
      'lost my',
      'passed away',
      'family emergency',
    ],
  },
  {
    memoryType: 'preference',
    keywords: [
      'i prefer',
      'i would rather',
      'shorter version',
      'shorter practices',
      'works better for me',
      'i like it when',
      "i don't like",
      'i do not like',
    ],
  },
  {
    memoryType: 'unresolved_concern',
    keywords: [
      'still worried',
      'still concerned',
      "hasn't gotten better",
      'has not gotten better',
      'keeps happening',
      'still struggling',
    ],
  },
  {
    memoryType: 'barrier',
    keywords: [
      "didn't have time",
      'did not have time',
      'too busy',
      'ran out of time',
      'forgot to',
      'too tired',
      'in pain',
      'too stressed',
      'couldn’t make it work',
      'could not make it work',
    ],
  },
];

const MAX_CONTENT_LENGTH = 240;

function trimToSentence(text: string, matchIndex: number): string {
  const before = text.slice(0, matchIndex);
  const sentenceStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n')) + 1;
  const after = text.slice(sentenceStart).trim();
  return after.length > MAX_CONTENT_LENGTH ? `${after.slice(0, MAX_CONTENT_LENGTH)}…` : after;
}

/** Returns at most one real, traceable memory candidate — or none, which is the common and expected case for casual conversation. */
export function extractMemoryCandidates(text: string | null | undefined): MemoryCandidate[] {
  if (!text) return [];
  const normalized = text.toLowerCase();

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      const index = normalized.indexOf(keyword);
      if (index !== -1) {
        const content = trimToSentence(text, index);
        if (!content) continue;
        return [{ memoryType: rule.memoryType, content }];
      }
    }
  }

  return [];
}
