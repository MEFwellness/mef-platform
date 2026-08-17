'use client';

/**
 * The friction question, on the Priority Card.
 *
 * AUDIT-ADAPTIVE-REVEAL.md 2.17: when a priority went uncompleted for three
 * days running, the engine silently changed how it was worded, and two
 * silent changes later handed the thread to a coach and stopped offering
 * it. The member was never asked why. This is the asking.
 *
 * It is deliberately ON the card rather than a separate interruption: it is
 * a question about this specific suggestion, and Root has already taken up
 * enough of her attention with the suggestion itself.
 *
 * It is also deliberately EASY TO IGNORE. There is no dismiss button and no
 * modal to escape, because ignoring it is a valid answer with a defined
 * meaning: the engine proceeds with the reword it would have done anyway.
 * A question a member cannot decline is not a question.
 */

import { useState, useTransition } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import type { PriorityFrictionQuestion } from '@/lib/priority/types';
import { FRICTION_ANSWER_ACKNOWLEDGEMENT } from '@/lib/coaching-direction/friction';
import { answerPriorityFrictionAction } from '@/app/actions/priorityFriction';

export function FrictionQuestion({ question }: { question: PriorityFrictionQuestion }) {
  const [answered, setAnswered] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  if (answered) {
    return (
      <p className="relative mt-4 rounded-2xl bg-[#EFF6F1] p-4 text-sm leading-relaxed text-[#1B3A2D]">
        {FRICTION_ANSWER_ACKNOWLEDGEMENT}
      </p>
    );
  }

  // Tapping an option is the whole answer. The note is optional and is
  // submitted with it: a member who wants to add words gets a second beat to
  // do so, and one who does not is finished in one tap.
  const submit = (reason: string) => {
    setSelectedReason(reason);
    startTransition(async () => {
      await answerPriorityFrictionAction(reason, note.trim() ? note.trim() : null);
      setAnswered(true);
    });
  };

  return (
    <div className="relative mt-4 rounded-2xl bg-[#1B3A2D]/[0.05] p-4">
      <div className="flex items-center gap-2 text-[#1B3A2D]/70">
        <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider">A quick question</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]/85">{question.question}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {question.options.map((option) => (
          <button
            key={option.reason}
            type="button"
            disabled={pending}
            onClick={() => submit(option.reason)}
            className={`mef-press inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] disabled:opacity-60 ${
              selectedReason === option.reason
                ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                : 'border-[#1B3A2D]/20 text-[#1B3A2D] hover:border-[#1B3A2D]/40'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">{question.notePlaceholder}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={question.notePlaceholder}
          className="w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-3.5 py-2.5 text-sm text-[#1B3A2D] placeholder:text-[#6B7A72] focus:border-[#1B3A2D]/40 focus:outline-none"
        />
      </label>
    </div>
  );
}
