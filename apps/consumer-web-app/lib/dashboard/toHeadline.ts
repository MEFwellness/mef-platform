/**
 * Home dashboard redesign — "What Root Is Noticing" carousel headlines.
 * Each of the four cards' underlying data is a full, dynamically-composed
 * sentence (member-specific coaching copy from a real engine, not
 * static UI text). This derives a headline of at most `maxWords` words
 * from it for the card face — a literal, in-order prefix of the real
 * sentence, never new or invented wording — while the full sentence
 * stays reachable in the card's bottom sheet or destination page.
 */
export function toHeadline(sentence: string, maxWords = 6): string {
  const words = sentence
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= maxWords) {
    return words.join(' ').replace(/[.,;:]+$/, '');
  }

  return `${words.slice(0, maxWords).join(' ').replace(/[-–—.,;:]+$/, '')}…`;
}
