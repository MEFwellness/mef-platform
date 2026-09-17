'use client';

/**
 * ROOT NOTICED. What the coach reads when a client has reported something.
 *
 * TWO LAYERS. On top, the coach briefing (./RootBriefing.tsx): at most three
 * cards saying what matters, what supports it and what to explore next,
 * with the safety block above them. Below it, one tap away, the full
 * evidence exactly as it was: one finding per map entry a complaint or her
 * newest survey triggered, what she said, what Root read it as, which areas
 * the map sent Root to check and what was in each one, and how Root read
 * each survey answer. The finding card itself is drawn by
 * ./RootNoticedEvidence.tsx, which both layers share.
 *
 * NOTHING ON IT WAS COMPOSED BY THIS COMPONENT. The association text, the
 * basis line and every coaching consideration are carried through character
 * for character from the version of the map entry the lookup read.
 *
 * IT IS NOT A DIAGNOSIS AND IT CANNOT BECOME ONE. It never says an area is
 * the reason for what she reported, and says so once for the briefing and
 * once under the evidence, rather than once per card.
 * tests/cross-system-root-copy.test.ts holds every string to the
 * Relationship Library's own banned list.
 *
 * THE SAFETY OVERRIDE ALWAYS WINS, and it has already happened by the time
 * this renders. A withheld finding arrives with no areas, no association
 * and no considerations at all (see lib/cross-system-root/view.ts), and a
 * withheld briefing card is never built: its signals are named in the
 * safety block instead.
 *
 * NOTHING IS SCORED AND NOTHING IS COMBINED. No total, no index and no
 * percentage. The questionnaire scores stay on their own cards.
 *
 * COACH ONLY. Nothing in this feature renders on a member screen or reaches
 * a member API payload.
 */

import { useState } from 'react';
import { ChevronDown, Search, Sparkles } from 'lucide-react';
import {
  EMPTY_BODY,
  EMPTY_HEADING,
  EVIDENCE_HEADINGS,
  NOT_A_DIAGNOSIS,
} from '@/lib/cross-system-root/copy';
import type { RootNoticedPanelState } from '@/app/actions/crossSystemRootFindings';
import { BLOCK_TITLE, Finding, QuestionnaireBlock } from './RootNoticedEvidence';
import { RootBriefing } from './RootBriefing';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function RootNoticedPanel({ state }: { state: RootNoticedPanelState }) {
  const briefing = state.view.briefing ?? null;
  // WITH A BRIEFING, THE EVIDENCE IS ONE TAP AWAY rather than the first
  // thing on the page. Without one (a render that built none), the evidence
  // is the whole section, exactly as it was.
  const [evidenceOpen, setEvidenceOpen] = useState(briefing === null);

  if (!state.allowed) return null;
  const { view } = state;
  const questionnaire = view.questionnaire ?? null;

  if (view.findings.length === 0 && !questionnaire) {
    return (
      <div className={`${CARD} p-5`}>
        <p className="text-[14px] font-semibold text-[#1B3A2D]">{EMPTY_HEADING}</p>
        <p className="mt-1 text-[13px] text-[#1B3A2D]/70">{EMPTY_BODY}</p>
        <p className="mt-2 text-[11px] text-[#1B3A2D]/50">
          Your Whole-Body Association Map holds {view.mapEntryCount}{' '}
          {view.mapEntryCount === 1 ? 'active entry' : 'active entries'}.
        </p>
      </div>
    );
  }

  const evidence = (
    <>
      {view.complaintCount > 0 ? (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#1B3A2D]">
          <Sparkles className="h-4 w-4 text-[#854D0E]" aria-hidden />
          Root read {view.complaintCount}{' '}
          {view.complaintCount === 1 ? 'report' : 'reports'} from this client and checked her
          whole-body data against your Association Map.
        </p>
      ) : null}

      {view.convergences.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-[#854D0E]/20 bg-[#FEF9F0] p-4">
          <p className={BLOCK_TITLE}>Overlapping areas</p>
          <ul className="mt-1 space-y-1">
            {view.convergences.map((entry) => (
              <li key={entry.label} className="text-[13px] text-[#1B3A2D]/80">
                {entry.line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {view.findings.map((finding) => (
          <Finding
            key={`${finding.relationshipId}:${finding.complaintOn}:${finding.complaintText.slice(0, 24)}`}
            finding={finding}
          />
        ))}
      </div>

      {questionnaire ? <QuestionnaireBlock block={questionnaire} /> : null}

      {view.unclassifiedCount > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#1B3A2D]/50">
          <Search className="h-3 w-3" aria-hidden />
          {view.unclassifiedCount}{' '}
          {view.unclassifiedCount === 1 ? 'report had' : 'reports had'} no phrase Root recognizes
          yet. They are recorded in full and can be read in her check-ins.
        </p>
      ) : null}

      {/* SAID ONCE for every finding above, rather than once per card. */}
      <p className="mt-4 text-[11px] text-[#1B3A2D]/55">{NOT_A_DIAGNOSIS}</p>
    </>
  );

  if (!briefing) {
    return <div className={`${CARD} p-5`}>{evidence}</div>;
  }

  return (
    <div className={`${CARD} p-5`}>
      <RootBriefing briefing={briefing} view={view} clientId={state.clientId} />

      <div className="mt-5 border-t border-[#1B3A2D]/10 pt-4">
        <button
          type="button"
          onClick={() => setEvidenceOpen((value) => !value)}
          aria-expanded={evidenceOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
          data-root-full-evidence-toggle
        >
          <span className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.fullEvidence}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#854D0E] transition-transform ${evidenceOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {evidenceOpen ? <div className="mt-3">{evidence}</div> : null}
      </div>
    </div>
  );
}
