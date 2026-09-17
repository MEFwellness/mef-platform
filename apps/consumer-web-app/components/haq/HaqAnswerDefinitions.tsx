'use client';

/**
 * The four answer definitions: printed in full on the intro screen, and
 * reopened from the small help control on every question screen.
 *
 * ONE LIST, TWO PLACES. The intro and the sheet render the same component
 * from the same constants (lib/haq/copy.ts), so the words she read before
 * question one are the words she reopens later.
 *
 * Drawn in ModalOverlay, the one frame every pop-up in this app uses,
 * portalled to the body so a transformed card above it cannot capture it.
 */

import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { HAQ_ANSWER_DEFINITIONS, HAQ_DEFINITIONS_HEADING } from '@/lib/haq/copy';

export function HaqAnswerDefinitionList() {
  return (
    <dl className="space-y-3" data-testid="haq-answer-definitions">
      {HAQ_ANSWER_DEFINITIONS.map((definition) => (
        <div key={definition.term} className="rounded-2xl bg-[#F1F6F2] px-4 py-3.5">
          <dt className="text-[12px] font-semibold tracking-[0.08em] text-[#1B3A2D]">{definition.term}.</dt>
          <dd className="mt-1 text-[14px] leading-relaxed text-[#4F645A]">{definition.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HaqAnswerDefinitionsSheet({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);

  return (
    <ModalOverlay testId="haq-definitions-sheet" zIndexClassName="z-[70]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="haq-definitions-title"
        className="mef-animate-in my-6 w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-[0_24px_60px_-24px_rgba(27,58,45,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="haq-definitions-title" className={`${CVS_DISPLAY_FONT} text-[24px] leading-tight text-[#1B3A2D]`}>
            {HAQ_DEFINITIONS_HEADING}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mef-focus-ring mef-press -mr-1 -mt-1 rounded-full p-2 text-[#6B7A72] hover:bg-[#F3F6F4]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">
          <HaqAnswerDefinitionList />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mef-press mef-focus-ring mt-6 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
