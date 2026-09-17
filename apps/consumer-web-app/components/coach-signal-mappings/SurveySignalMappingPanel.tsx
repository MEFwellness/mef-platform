'use client';

/**
 * The coach's view of the Body Systems Survey question to signal mapping.
 *
 * FOLDED BY SECTION, because 111 questions in one list is a scroll. Each
 * question shows what it currently files under, its version, and opens
 * onto an edit form and its version history.
 *
 * THE FORM POSTS KEYS. The signal is picked from the Signal Library's own
 * names and nothing can be typed that does not already exist there; the
 * server resolves and checks every key again (resolveMappingEdit), and the
 * database refuses a revision the coach did not sign.
 *
 * COACH ONLY. Nothing here renders on a member screen.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { saveSurveySignalMappingAction } from '@/app/actions/crossSystemSignalMappings';
import type {
  SurveyMappingRowView,
  SurveyMappingSectionView,
  SurveyMappingView,
} from '@/lib/cross-system-signals/surveyMapping';
import { MAPPING_NOTE_MAX_LENGTH } from '@/lib/cross-system-signals/surveyMapping';
import type { SignalBodyArea, StandardizedSignalName } from '@/lib/cross-system-signals/types';
import {
  BLURB,
  CARD,
  FIELD,
  LABEL,
  OUTLINE_BUTTON,
  PANEL,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
  SECTION_TITLE,
} from '@/components/coach-relationships/styles';

type Props = {
  view: SurveyMappingView;
  signalNames: StandardizedSignalName[];
  bodyAreas: SignalBodyArea[];
};

function EditForm({
  row,
  signalNames,
  bodyAreas,
  onDone,
}: {
  row: SurveyMappingRowView;
  signalNames: StandardizedSignalName[];
  bodyAreas: SignalBodyArea[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [signalSlug, setSignalSlug] = useState(row.signalSlug);
  const [bodyAreaKey, setBodyAreaKey] = useState(row.bodyAreaKey ?? '');
  const [isActive, setIsActive] = useState(row.isActive);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chosen = signalNames.find((name) => name.signalSlug === signalSlug) ?? null;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    return signalNames
      .filter(
        (name) =>
          name.displayName.toLowerCase().includes(needle) ||
          name.searchTerms.toLowerCase().includes(needle)
      )
      .slice(0, 10);
  }, [query, signalNames]);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveSurveySignalMappingAction({
        questionRef: row.questionRef,
        signalSlug,
        bodyAreaKey: bodyAreaKey.length > 0 ? bodyAreaKey : null,
        isActive,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className={`mt-3 ${PANEL}`}>
      <label className={LABEL} htmlFor={`mapping-search-${row.questionRef}`}>
        Signal
      </label>
      <p className="mt-1 text-sm font-semibold text-[#1B3A2D]">
        {chosen?.displayName ?? row.signalName}
      </p>
      <input
        id={`mapping-search-${row.questionRef}`}
        className={`mt-2 ${FIELD}`}
        placeholder="Search the Signal Library"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {matches.map((name) => (
            <li key={name.signalSlug}>
              <button
                type="button"
                className={`${OUTLINE_BUTTON} w-full justify-start`}
                onClick={() => {
                  setSignalSlug(name.signalSlug);
                  setQuery('');
                }}
              >
                {name.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className={`mt-3 ${LABEL}`} htmlFor={`mapping-area-${row.questionRef}`}>
        Body area
      </label>
      <select
        id={`mapping-area-${row.questionRef}`}
        className={`mt-1 ${FIELD}`}
        value={bodyAreaKey}
        onChange={(event) => setBodyAreaKey(event.target.value)}
      >
        <option value="">The signal&apos;s own area</option>
        {bodyAreas.map((area) => (
          <option key={area.areaKey} value={area.areaKey}>
            {area.displayName}
          </option>
        ))}
      </select>

      <label className="mt-3 flex items-center gap-2 text-sm text-[#1B3A2D]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        In use: answers to this question are filed under this signal
      </label>

      <label className={`mt-3 ${LABEL}`} htmlFor={`mapping-note-${row.questionRef}`}>
        Note (optional)
      </label>
      <input
        id={`mapping-note-${row.questionRef}`}
        className={`mt-1 ${FIELD}`}
        maxLength={MAPPING_NOTE_MAX_LENGTH}
        placeholder="Why this changed"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {error ? <p className="mt-2 text-sm text-[#9A3412]">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={pending} onClick={save}>
          {pending ? 'Saving' : 'Save as a new version'}
        </button>
        <button type="button" className={QUIET_BUTTON} disabled={pending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function MappingRow({
  row,
  signalNames,
  bodyAreas,
}: {
  row: SurveyMappingRowView;
  signalNames: StandardizedSignalName[];
  bodyAreas: SignalBodyArea[];
}) {
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <li className="border-t border-[#1B3A2D]/8 py-3 first:border-t-0" data-mapping-question={row.questionRef}>
      <p className="text-[13px] italic text-[#4F645A]">{row.prompt}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#1B3A2D]">{row.signalName}</span>
        {row.bodyAreaLabel ? (
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[11px] text-[#3E5C46]">
            {row.bodyAreaLabel}
          </span>
        ) : null}
        {!row.isActive ? (
          <span className="rounded-full border border-[#9A3412]/30 px-2 py-0.5 text-[11px] text-[#9A3412]">
            Not in use
          </span>
        ) : null}
        {row.branchLabel ? (
          <span className="text-[11px] text-[#6B7A72]">{row.branchLabel}</span>
        ) : null}
        <span className="text-[11px] text-[#6B7A72]">Version {row.revisionNumber}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {!editing ? (
          <button type="button" className={OUTLINE_BUTTON} onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
        <button
          type="button"
          className={QUIET_BUTTON}
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((value) => !value)}
        >
          Version history
        </button>
      </div>

      {editing ? (
        <EditForm
          row={row}
          signalNames={signalNames}
          bodyAreas={bodyAreas}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {historyOpen ? (
        <ol className="mt-2 space-y-2 border-l-2 border-[#C4A050]/40 pl-3">
          {row.revisions.map((revision) => (
            <li key={revision.revisionNumber} className="text-[12px] text-[#3E5C46]">
              <p className="font-semibold text-[#1B3A2D]">
                Version {revision.revisionNumber}, {revision.changedOnDisplay}
              </p>
              <p>
                {revision.signalName}
                {revision.bodyAreaLabel ? `, ${revision.bodyAreaLabel}` : ''}
                {revision.isActive ? '' : ', not in use'}
              </p>
              {revision.changes.map((change) => (
                <p key={change} className="text-[#6B7A72]">
                  {change}
                </p>
              ))}
              {revision.note ? <p className="text-[#6B7A72]">Note: {revision.note}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function Section({
  section,
  signalNames,
  bodyAreas,
}: {
  section: SurveyMappingSectionView;
  signalNames: StandardizedSignalName[];
  bodyAreas: SignalBodyArea[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${CARD} p-5`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className={SECTION_TITLE}>{section.sectionName}</span>
          <span className="ml-2 text-[12px] text-[#6B7A72]">
            {section.rows.length === 1 ? '1 question' : `${section.rows.length} questions`}
            {section.inactiveCount > 0 ? `, ${section.inactiveCount} not in use` : ''}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[#854D0E] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-3">
          {section.rows.map((row) => (
            <MappingRow key={row.questionRef} row={row} signalNames={signalNames} bodyAreas={bodyAreas} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SurveySignalMappingPanel({ view, signalNames, bodyAreas }: Props) {
  if (view.sections.length === 0) {
    return (
      <div className={`${CARD} p-5`}>
        <p className="text-sm text-[#4F645A]">The mapping could not be read. Reload to try again.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className={BLURB}>
        {view.mappedCount} of the survey&apos;s {view.questionCount} questions are mapped to a
        canonical signal
        {view.inactiveCount > 0 ? `, and ${view.inactiveCount} of those are not in use` : ''}. A
        change applies to surveys completed after it is saved. Signals already on a client&apos;s
        timeline keep the signal they were filed under.
      </p>
      {view.sections.map((section) => (
        <Section key={section.sectionKey} section={section} signalNames={signalNames} bodyAreas={bodyAreas} />
      ))}
    </div>
  );
}
