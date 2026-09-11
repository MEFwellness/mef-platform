'use client';

/**
 * One question on a screen that holds two or three of them.
 *
 * WHY THIS IS ITS OWN COMPONENT. Two takers ask questions in the Rooted
 * Reset way (the generic points scored questionnaire and the Body Systems
 * Survey), and before this they each drew their own prompt and their own
 * spacing by hand, so "make the question feel more important" was a change
 * that had to be made twice and stay made twice. The prompt, the muted
 * gold ordinal beside it and the room around it are one definition here.
 *
 * TWO TONES, ONE LAYOUT. The questionnaire sits on a cream page in a white
 * card, and the Body Systems Survey sits inside a deep forest panel. The
 * type scale, the ordinal, the rhythm and the divider are identical; only
 * the colours differ, and they differ in one table at the top of this file
 * rather than at every call site.
 *
 * THE ORDINAL IS A POSITION, NOT A SCORE. "03" is which question she is
 * on, printed small and muted so it orients her without competing with the
 * question. Nothing here knows what a question is worth, and nothing here
 * is ever handed a category name, a section name or an interpretation.
 */

import type { ReactNode } from 'react';

export type QuestionTone = 'light' | 'forest';

const TONE = {
  light: {
    ordinal: 'text-[#B89340]',
    prompt: 'text-[#1B3A2D]',
    divider: 'bg-[#1B3A2D]/8',
  },
  forest: {
    ordinal: 'text-[#C4A050]',
    prompt: 'text-[#F5F0E4]',
    divider: 'bg-[#F5F0E4]/10',
  },
} as const;

/** "03" up to ninety nine, then the plain number, because "103" reads fine. */
export function ordinalLabel(position: number): string {
  return position < 10 ? `0${position}` : String(position);
}

export function QuestionBlock({
  tone,
  position,
  prompt,
  promptId,
  /** A hairline above this question. Off for the first question on a screen. */
  withDivider = false,
  children,
}: {
  tone: QuestionTone;
  /** Left off for a prompt that is not one of the numbered questions. */
  position?: number | undefined;
  prompt: string;
  promptId: string;
  withDivider?: boolean | undefined;
  children: ReactNode;
}) {
  const colors = TONE[tone];

  return (
    <li className="list-none">
      {/*
        THE SEPARATION IS THE DIVIDER'S MARGIN, NOT A GAP ON THE LIST.
        32px above the rule and 32px below it, so two questions on one
        screen read as two things rather than as one block of text.
      */}
      {withDivider && <div className={`mt-8 h-px w-full ${colors.divider}`} aria-hidden="true" />}
      <div className={withDivider ? 'pt-8' : ''}>
        {position != null && (
          <p
            /*
              TRACKING STAYS TIGHT ENOUGH THAT TWO DIGITS READ AS ONE NUMBER.
              At 0.22em "33" rendered as "3 3", which looks like two things.
            */
            className={`text-[11px] font-semibold tracking-[0.08em] ${colors.ordinal}`}
            aria-hidden="true"
          >
            {ordinalLabel(position)}
          </p>
        )}
        <h2
          id={promptId}
          className={`${position != null ? 'mt-2.5' : ''} text-[19px] font-medium leading-[1.45] ${colors.prompt}`}
        >
          {prompt}
        </h2>
        {/*
          THE OPTIONS ARE A RADIO GROUP LABELLED BY THE PROMPT ITSELF.
          Three questions on one screen means three groups on one screen,
          so each one has to say which question it belongs to or a screen
          reader hears nine unattached options.
        */}
        <div
          role="radiogroup"
          aria-labelledby={promptId}
          className="mt-5 space-y-2.5"
        >
          {children}
        </div>
      </div>
    </li>
  );
}
