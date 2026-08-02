/**
 * Progressive Reveal Engine (Prompt 3) — splits an existing paragraph of
 * copy into its own real sentences, for feeding into
 * components/reveal/ConversationFlow.tsx. Same regex idiom already used
 * by lib/onboarding/coachCopy.ts's `EXPECTATIONS_COPY.purpose` split
 * (`.split(/(?<=[.!?])\s+/)`) — reused here rather than reinvented.
 *
 * Deliberately a pure text transform, not a copy rewrite: every call site
 * that uses this is converting an existing wall-of-text paragraph into a
 * paced sequence (Bible §6's "Conversational sequence" pattern) without
 * changing a single word.
 */

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
