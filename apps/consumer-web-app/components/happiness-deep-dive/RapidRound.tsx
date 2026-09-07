'use client';

/**
 * A run of instinct pairs, one after another, at gut speed, and her own
 * count at the end.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. Your Own Company is the first template
 * to use it: five phrases under one standing question, Yes or Never. It is
 * built to be the piece any later template reaches for when it wants a
 * short burst of first instincts before it asks her to look at what the
 * burst produced.
 *
 * IT SETS UP WRITING, IT DOES NOT REPLACE IT. Standing rule, at the top of
 * lib/happiness-deep-dive/interactive.ts. The round is fast on purpose. The
 * writing the caller renders after it is where the weight lands, and the
 * tally exists to give her something specific to write about.
 *
 * NOTHING ADVANCES ON ITS OWN. There is no countdown, no auto-advance and
 * no pair that answers itself if she pauses. The only timer here is the
 * short beat between her tap and the next pair, so the card she tapped is
 * visibly lit before it is replaced. A member who takes a minute on pair
 * three takes a minute, and a member who is interrupted comes back to pair
 * three.
 *
 * IT SAVES AND RESUMES LIKE ANY OTHER ANSWER. The round is driven entirely
 * by the answers the caller holds, so a member who answered three, closed
 * the app and came back arrives at pair four with nothing re-run and no
 * beat replayed. A member who answered all five arrives at her tally,
 * already there.
 *
 * THE TALLY IS HANDED TO IT, NEVER COMPUTED HERE. The sentence is her own
 * count, written by one pure function the member's screen and her coach's
 * card both read (hddRoundTallySentence), so this component cannot become a
 * second place a number is decided.
 *
 * REDUCED MOTION REMOVES THE BEATS ENTIRELY rather than lengthening them.
 * The next pair is simply there, and the tally is simply there. Nothing
 * fades and nothing is timed.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import {
  HDD_RAPID_TALLY_MS,
  hddRapidAdvanceMs,
  type HddInstinctSide,
} from '@/lib/happiness-deep-dive/interactive';
import { InstinctPair } from './InstinctPair';

export type RapidItem = { id: string; text: string };

export function RapidRound({
  /** The one question every pair in this round answers. */
  question,
  items,
  /** The words on the two cards. The same two for every pair in the round. */
  labels,
  answers,
  onAnswer,
  /** Her own count, already in a sentence. Shown once the round is finished. */
  tallySentence,
  /** e.g. "Phrase 3 of 5". Named by the caller so this component owns no copy. */
  counterFor,
  /** Whatever the caller puts after the tally. On this family, the written question the round set up. */
  children,
}: {
  question: string;
  items: readonly RapidItem[];
  labels: { a: string; b: string };
  answers: Record<string, HddInstinctSide>;
  onAnswer: (id: string, side: HddInstinctSide) => void;
  tallySentence: string;
  counterFor: (index: number, total: number) => string;
  children?: ReactNode;
}) {
  const reducedMotion = useReducedMotion();

  // Where the round is, derived from her answers rather than kept in step
  // beside them: the first pair she has not answered, or the end.
  const firstUnanswered = items.findIndex((item) => !answers[item.id]);
  const finished = firstUnanswered === -1;

  // The pair actually on screen. It trails `firstUnanswered` by one for the
  // length of the beat after a tap, which is what lets a chosen card be
  // seen lit before it is replaced.
  const [held, setHeld] = useState<number | null>(null);
  const [tallyDue, setTallyDue] = useState(finished);

  // The beat after a tap. It moves nothing on its own: it releases the pair
  // she has already answered, and the index above is what decides which one
  // comes next.
  useEffect(() => {
    if (held === null) return undefined;
    const timer = setTimeout(() => setHeld(null), hddRapidAdvanceMs(reducedMotion));
    return () => clearTimeout(timer);
  }, [held, reducedMotion]);

  // The tally arrives a beat after the last answer rather than on top of
  // it, so the round ends on a small pause instead of a jump.
  useEffect(() => {
    if (!finished) {
      setTallyDue(false);
      return undefined;
    }
    if (reducedMotion) {
      setTallyDue(true);
      return undefined;
    }
    const timer = setTimeout(() => setTallyDue(true), HDD_RAPID_TALLY_MS);
    return () => clearTimeout(timer);
  }, [finished, reducedMotion]);

  const index = held !== null ? held : finished ? items.length - 1 : firstUnanswered;
  const current = items[index];
  // The last pair stays on screen until the tally is genuinely due, so the
  // round never leaves a gap where neither is there and the panel does not
  // jump between them.
  const showPair = !finished || !tallyDue;

  return (
    <div>
      {showPair && current && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#F5F0E4]/45">
            {counterFor(index + 1, items.length)}
          </p>

          {/*
            The phrase itself, above the two cards. It changes with every
            pair, and the key is what makes each one arrive rather than
            appearing to be the previous one edited in place.
          */}
          <p
            key={current.id}
            className={`mt-2 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-snug text-[#F5F0E4] ${
              reducedMotion ? '' : 'mef-fade-in'
            }`}
          >
            {current.text}
          </p>

          <div className="mt-5">
            <InstinctPair
              question={question}
              a={labels.a}
              b={labels.b}
              value={answers[current.id] ?? null}
              onPick={(side) => {
                onAnswer(current.id, side);
                setHeld(index);
              }}
              disabled={held !== null}
              still={reducedMotion}
            />
          </div>
        </div>
      )}

      {finished && tallyDue && (
        <div className={reducedMotion ? undefined : 'mef-fade-in'}>
          {/*
            Her own count, and the only number this family of experiences
            prints. It is announced politely rather than assertively: it
            arrives beside a question she is about to answer, not as an
            alert.
          */}
          <p
            aria-live="polite"
            data-rapid-tally="true"
            className="rounded-2xl border border-[#C4A050]/45 bg-[#C4A050]/[0.10] px-4 py-3 text-[16px] leading-relaxed text-[#F5F0E4]"
          >
            {tallySentence}
          </p>
          {/*
            Whatever the round was setting up, after the count and never
            beside it. It is the caller's, so this component never becomes a
            second place a question is authored.
          */}
          {children && <div className="mt-6">{children}</div>}
        </div>
      )}
    </div>
  );
}
