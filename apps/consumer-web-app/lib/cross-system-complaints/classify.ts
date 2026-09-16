/**
 * AUTOMATIC COMPLAINT UNDERSTANDING. Deterministic, pure, and no model
 * anywhere near it.
 *
 * WHY DETERMINISTIC AND NOT A MODEL, written down rather than assumed.
 * Both AI provider slots in this codebase
 * (lib/body-assessment/providers/registry.ts and
 * lib/coach-intelligence/providers/registry.ts) are unconfigured stubs
 * whose every call throws, no AI SDK is a dependency of this app, and no
 * provider key exists in the deployment. Building the layer that reads a
 * member's own words on top of one of those would be building it on
 * something that cannot run. Three further reasons make this the right
 * choice rather than merely the available one:
 *
 *   1. IT RUNS INSIDE HER SUBMIT. Classification fires as a check-in
 *      completes, and this feature's standing rule is that a missing
 *      credential costs a signal and never a completed assessment. A
 *      network call with latency, a rate limit and an outage in that path
 *      is a risk to her submit for no gain.
 *   2. IT CANNOT INVENT VOCABULARY, and that is provable rather than
 *      hoped for. Every phrase this file can match is a row whose target
 *      is a foreign key onto a standardized signal name a coach already
 *      reviewed. A phrase with no row is skipped, exactly as migration
 *      241's dictionary skips a question ref it does not hold.
 *   3. THE COACH HAS TO BE ABLE TO TRACE IT. Same words, same answer,
 *      every time, and the span of her text that produced each row is
 *      carried through to the card.
 *
 * THE SEAM IS STILL THERE. A provider could later PROPOSE candidate
 * phrases, and this matcher would remain the gate that validates them into
 * canonical names. That is what `provider_validated` is reserved for in
 * migration 246. Nothing in this file would move.
 *
 * IT IDENTIFIES, IT NEVER DIAGNOSES. The return type has no field for a
 * cause and no field for a condition. The most this file can ever say is
 * which canonical signal her words named, where on her body, on which
 * side, in what context and how often.
 */

import type { SignalSide } from '@/lib/cross-system-signals/types';
import type {
  ComplaintClassificationDraft,
  ComplaintLexicon,
  ComplaintModifier,
  ComplaintPhrase,
} from './types';

/**
 * The revision stamped onto every report this matcher classifies.
 *
 * IT IS A RECEIPT, NOT A VERSION NUMBER FOR ITS OWN SAKE. A finding
 * surfaced today has to stay explainable after the lexicon grows next
 * month, so the report records which reading of which rules produced it.
 * Bump it whenever the ALGORITHM below changes. Lexicon rows are data and
 * carry their own timestamps, so adding a phrase does not bump this.
 */
export const CLASSIFIER_REVISION = 'deterministic-lexicon-1';

/** How far back from a match to look for a word that negates it. */
const NEGATION_WINDOW = 28;
/**
 * How far FORWARD to look for a word that closes it out.
 *
 * Deliberately shorter than the backward window. A closing word sits right
 * up against the thing it closes ("my headaches have stopped"), and reading
 * further would let "no bloating" two clauses later negate the headache.
 */
const TRAILING_NEGATION_WINDOW = 18;
/** How far either side of a match to look for a side or an area word. */
const MODIFIER_WINDOW = 40;

/**
 * Her text, flattened for matching, with a map back to where every
 * character came from.
 *
 * THE MAP IS THE POINT. The matcher works over a lowercased, punctuation
 * flattened string, but what a coach reads has to be HER span, with her
 * capitals and her punctuation. Keeping an index per emitted character is
 * what lets a match found at normalized position 12 be reported as the
 * original substring it really was.
 */
type Normalized = {
  /** Lowercased, apostrophes dropped, everything else not a letter or digit turned into one space. Padded with a space at each end. */
  text: string;
  /** For each character of `text`, the index it came from in the original. */
  map: number[];
  original: string;
};

const APOSTROPHES = new Set(["'", '’', 'ʼ', '`']);

export function normalizeComplaintText(input: string): Normalized {
  const chars: string[] = [' '];
  const map: number[] = [0];

  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i]!;
    // An apostrophe is DROPPED rather than turned into a space, so "can't"
    // reads as "cant" and matches a lexicon written the way a phone
    // keyboard produces it. Turning it into a space would split the word
    // into two that match nothing.
    if (APOSTROPHES.has(raw)) continue;

    const lower = raw.toLowerCase();
    if (/[a-z0-9]/.test(lower)) {
      chars.push(lower);
      map.push(i);
      continue;
    }
    // Everything else is a separator, collapsed so one comma and four
    // spaces do not make five positions a phrase could fall down.
    if (chars[chars.length - 1] !== ' ') {
      chars.push(' ');
      map.push(i);
    }
  }

  if (chars[chars.length - 1] !== ' ') {
    chars.push(' ');
    map.push(input.length);
  }

  return { text: chars.join(''), map, original: input };
}

/** Every start index at which `phrase` sits on word boundaries. */
function occurrences(haystack: string, phrase: string): number[] {
  const needle = ` ${phrase} `;
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    // +1 because the match starts after the leading space we searched for.
    found.push(at + 1);
    // Advance by one, not by the needle's length, so overlapping
    // occurrences of a repeated phrase are all seen.
    from = at + 1;
  }
  return found;
}

/**
 * Whether this match is her saying the thing is NOT happening.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. "no bloating this week" and "my
 * headaches have stopped" both contain a phrase in the lexicon, and a
 * matcher that filed a signal for each would put an alarm on her timeline
 * out of a sentence that closed one. The Signal Library is append over
 * time and the matching engine reads the LATEST row, so a false positive
 * here does not merely add noise, it outranks the truth.
 *
 * NEGATION HAS A DIRECTION, because English does. "no bloating" puts the
 * closing word in front and "my headaches have stopped" puts it behind, and
 * a matcher that read only one of those got half of them wrong. The two
 * lists are separate kinds of row rather than one list read both ways: a
 * "stopped" in front of a complaint does not negate it, and a "no" behind
 * one belongs to whatever comes next.
 *
 * Each window is short, because "no" three clauses ago is about something
 * else.
 */
function isNegated(
  norm: Normalized,
  start: number,
  end: number,
  modifiers: readonly ComplaintModifier[]
): boolean {
  const before = norm.text.slice(Math.max(0, start - NEGATION_WINDOW), start);
  const after = norm.text.slice(end, Math.min(norm.text.length, end + TRAILING_NEGATION_WINDOW));
  for (const modifier of modifiers) {
    if (modifier.kind === 'negation' && before.includes(` ${modifier.phrase} `)) return true;
    if (modifier.kind === 'negation_after' && after.includes(` ${modifier.phrase} `)) return true;
  }
  return false;
}

/** The nearest modifier of one kind within the window around a match. */
function nearestModifier(
  norm: Normalized,
  start: number,
  end: number,
  modifiers: readonly ComplaintModifier[],
  kind: ComplaintModifier['kind']
): ComplaintModifier | null {
  const from = Math.max(0, start - MODIFIER_WINDOW);
  const to = Math.min(norm.text.length, end + MODIFIER_WINDOW);
  const window = norm.text.slice(from, to);

  let best: { modifier: ComplaintModifier; distance: number } | null = null;
  for (const modifier of modifiers) {
    if (modifier.kind !== kind) continue;
    const at = window.indexOf(` ${modifier.phrase} `);
    if (at === -1) continue;
    const absolute = from + at + 1;
    // Distance from the match itself, so "my right hip" beats a "left"
    // mentioned about something else earlier in the same sentence.
    const distance = absolute < start ? start - (absolute + modifier.phrase.length) : absolute - end;
    if (!best || distance < best.distance) best = { modifier, distance };
  }
  return best ? best.modifier : null;
}

/** A frequency or context word anywhere in the sentence the match sits in. */
function sentenceModifier(
  norm: Normalized,
  start: number,
  modifiers: readonly ComplaintModifier[],
  kind: ComplaintModifier['kind']
): ComplaintModifier | null {
  // Punctuation is already flattened, so "the sentence" is the whole text.
  // A wider read is correct for these two: "after meals" and "all the
  // time" qualify a complaint from anywhere in the line she wrote.
  let best: { modifier: ComplaintModifier; distance: number } | null = null;
  for (const modifier of modifiers) {
    if (modifier.kind !== kind) continue;
    const at = norm.text.indexOf(` ${modifier.phrase} `);
    if (at === -1) continue;
    const distance = Math.abs(at - start);
    if (!best || distance < best.distance) best = { modifier, distance };
  }
  return best ? best.modifier : null;
}

/**
 * LONGER PHRASES WIN, and that is the whole of the disambiguation rule.
 *
 * "bloated after meals" has to beat "bloated", and "waking up tired" has
 * to beat "tired", because the longer phrase is the more specific reading
 * of the same words. Specificity breaks a genuine tie between two phrases
 * of the same length.
 */
export function orderPhrases(phrases: readonly ComplaintPhrase[]): ComplaintPhrase[] {
  return [...phrases].sort((a, b) => {
    if (a.phrase.length !== b.phrase.length) return b.phrase.length - a.phrase.length;
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    return a.phrase.localeCompare(b.phrase);
  });
}

/**
 * What one complaint says, in canonical vocabulary.
 *
 * ONE SENTENCE MAY PRODUCE SEVERAL ROWS. "My skin has been breaking out
 * and I have been really bloated after meals" is a skin row and a
 * digestion row, each pointing back at the one sentence and each carrying
 * the span of it that produced it.
 *
 * A SPAN IS CONSUMED ONCE. Once "bloated after meals" has claimed its
 * characters, the shorter "bloated" cannot claim them again, so one
 * complaint does not become two rows saying the same thing.
 */
export function classifyComplaint(
  rawText: string,
  lexicon: ComplaintLexicon
): ComplaintClassificationDraft[] {
  if (!rawText || rawText.trim().length === 0) return [];

  const norm = normalizeComplaintText(rawText);
  const ordered = orderPhrases(lexicon.phrases);
  const claimed: Array<{ start: number; end: number }> = [];
  const drafts: ComplaintClassificationDraft[] = [];
  // One canonical signal at one place on one side is one row, however many
  // ways she said it in the same sentence.
  const seen = new Set<string>();

  for (const entry of ordered) {
    for (const start of occurrences(norm.text, entry.phrase)) {
      const end = start + entry.phrase.length;

      if (claimed.some((span) => start < span.end && end > span.start)) continue;
      if (isNegated(norm, start, end, lexicon.modifiers)) {
        // Still consume the span. She named the thing and said it was not
        // happening, and a shorter phrase inside those same words must not
        // then file it as though she had.
        claimed.push({ start, end });
        continue;
      }

      const sideModifier = nearestModifier(norm, start, end, lexicon.modifiers, 'side');
      const side: SignalSide | null = sideModifier?.side ?? null;

      // THE PHRASE'S OWN AREA WINS. A row for "hip clicking" carries the
      // hip, and that is more reliable than a word found nearby. Only when
      // the phrase names no area does the sentence get asked.
      const areaModifier =
        entry.bodyAreaKey === null
          ? nearestModifier(norm, start, end, lexicon.modifiers, 'body_area')
          : null;
      const bodyAreaKey = entry.bodyAreaKey ?? areaModifier?.bodyAreaKey ?? null;

      const contextModifier = sentenceModifier(norm, start, lexicon.modifiers, 'context');
      const frequencyModifier = sentenceModifier(norm, start, lexicon.modifiers, 'frequency');

      const dedupeKey = `${entry.signalSlug}::${bodyAreaKey ?? ''}::${side ?? ''}`;
      claimed.push({ start, end });
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      drafts.push({
        position: drafts.length,
        signalSlug: entry.signalSlug,
        bodyAreaKey,
        side,
        // HER span, from the map, rather than the lexicon's own wording.
        matchedPhrase: originalSpan(norm, start, end),
        contextKey: contextModifier?.contextKey ?? null,
        frequencyKey: frequencyModifier?.frequencyKey ?? null,
        frequencyLabel: frequencyModifier?.frequencyLabel ?? null,
        frequencyNumeric: frequencyModifier?.frequencyNumeric ?? null,
      });
    }
  }

  // In the order they appear in her sentence, which is the order she said
  // them and the order a coach reads them back.
  const byPosition = [...drafts].sort((a, b) =>
    norm.original.indexOf(a.matchedPhrase) - norm.original.indexOf(b.matchedPhrase)
  );
  return byPosition.map((draft, index) => ({ ...draft, position: index }));
}

function originalSpan(norm: Normalized, start: number, end: number): string {
  const from = norm.map[start];
  const lastIndex = norm.map[end - 1];
  if (from === undefined || lastIndex === undefined) return '';
  return norm.original.slice(from, lastIndex + 1);
}
