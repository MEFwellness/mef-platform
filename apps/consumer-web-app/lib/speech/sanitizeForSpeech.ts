/**
 * Strips markdown/technical formatting from a coach reply before it's
 * spoken aloud — part 2's "remove markup or technical formatting before
 * speech" / "do not read internal safety codes, citations metadata, or
 * hidden system content." Pure function, no browser APIs, so it's testable
 * without a DOM.
 *
 * Only ever called on `ConversationMessage.content` — the exact text
 * already rendered in the chat bubble. Safety classification ids,
 * reasoning codes, and evidence references live in separate database
 * columns that are never interpolated into `content` in the first place
 * (see lib/conversation-coach/service.ts), so this function's job is
 * narrower than it sounds: strip formatting syntax, not redact hidden
 * data that was never here to begin with.
 */

export function sanitizeForSpeech(rawText: string): string {
  let text = rawText;

  // Fenced and inline code — read as plain text, not literal backticks.
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Markdown emphasis/headings/links — keep the human-readable text, drop the syntax.
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  // Bare URLs — not useful spoken aloud.
  text = text.replace(/https?:\/\/\S+/g, '');

  // List markers at the start of a line become a natural pause instead of a read-aloud dash/number.
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Collapse whitespace/newlines into calm sentence-level pauses.
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n/g, ' ');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\s+([.,!?])/g, '$1');

  return text.trim();
}
