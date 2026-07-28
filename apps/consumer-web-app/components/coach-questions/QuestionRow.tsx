'use client';

import { useState } from 'react';
import { Eye, History, RotateCcw, Pencil, Archive, Copy } from 'lucide-react';
import type { Driver } from '@/lib/driver-library/types';
import type { QuestionWithStats, RevisionEntry } from '@/lib/driver-probe-admin/types';
import {
  listRevisionsAction,
  retireAndReplaceQuestionAction,
  retireQuestionAction,
  restoreQuestionAction,
  updateQuestionAction,
} from '@/app/actions/driverProbeAdmin';
import { QuestionEditorForm } from './QuestionEditorForm';
import { QuestionPreviewModal } from './QuestionPreviewModal';

const RESPONSE_TYPE_LABEL: Record<string, string> = {
  boolean: 'Yes / No',
  scale: 'Scale',
  count: 'Count',
  single_select: 'Multiple choice (pick one)',
  multi_select: 'Multiple choice (pick any)',
  time_pair: 'Time',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function RevisionRow({ revision }: { revision: RevisionEntry }) {
  const changedKeys = new Set([
    ...Object.keys(revision.before ?? {}),
    ...Object.keys(revision.after ?? {}),
  ]);
  const diffs = [...changedKeys].filter((key) => {
    const before = JSON.stringify((revision.before ?? {})[key]);
    const after = JSON.stringify((revision.after ?? {})[key]);
    return before !== after;
  });

  return (
    <div className="border-t border-[#1B3A2D]/5 py-2 text-xs text-[#6B7A72]">
      <p>
        <span className="font-medium text-[#1B3A2D]">{revision.changeType}</span> by{' '}
        {revision.changedByName} — {formatDate(revision.changedAt)}
      </p>
      {revision.changeType === 'updated' && diffs.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {diffs.map((key) => (
            <li key={key}>
              <span className="font-medium">{key}</span>:{' '}
              {JSON.stringify((revision.before ?? {})[key])} →{' '}
              {JSON.stringify((revision.after ?? {})[key])}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuestionRow({
  question,
  drivers,
  onChanged,
  onReplaced,
}: {
  question: QuestionWithStats;
  drivers: Driver[];
  /** Called with the updated row after a successful prompt edit, full edit, retire, or restore — the parent panel splices it into its own list (same optimistic-update convention as ProgramLibraryPanel.tsx), no full page reload needed. */
  onChanged: (updated: QuestionWithStats) => void;
  /** Called after a successful "retire and replace" — the old row (now retired) and the brand-new row it was replaced with. */
  onReplaced: (retiredOld: QuestionWithStats, replacement: QuestionWithStats) => void;
}) {
  const [promptDraft, setPromptDraft] = useState(question.prompt);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<RevisionEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const lockedFields: ('responseType' | 'options')[] =
    question.answeredCount > 0 ? ['responseType', 'options'] : [];

  async function savePromptIfChanged() {
    if (promptDraft.trim() === question.prompt || !promptDraft.trim()) {
      setPromptDraft(question.prompt);
      return;
    }
    setSavingPrompt(true);
    setError('');
    const result = await updateQuestionAction(question.questionKey, { prompt: promptDraft.trim() });
    setSavingPrompt(false);
    if (!result.ok) {
      setError(result.error);
      setPromptDraft(question.prompt);
      return;
    }
    onChanged({ ...question, prompt: promptDraft.trim() });
  }

  async function handleRetireToggle() {
    setBusy(true);
    setError('');
    const result = question.active
      ? await retireQuestionAction(question.questionKey)
      : await restoreQuestionAction(question.questionKey);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged({ ...question, active: !question.active });
  }

  async function loadHistory() {
    setShowHistory((prev) => !prev);
    if (revisions === null) {
      const data = await listRevisionsAction(question.questionKey);
      setRevisions(data);
    }
  }

  return (
    <div className="border-t border-[#1B3A2D]/5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            onBlur={savePromptIfChanged}
            disabled={!question.active}
            rows={2}
            className={`w-full resize-none rounded-xl border border-transparent px-2 py-1 text-[15px] leading-relaxed text-[#1B3A2D] transition-colors focus:border-[#F5B700]/60 focus:bg-white focus:outline-none ${!question.active ? 'text-[#6B7A72]' : ''}`}
          />
          {savingPrompt && <p className="px-2 text-xs text-[#6B7A72]">Saving…</p>}

          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2 text-xs text-[#6B7A72]">
            <span className="font-mono">{question.questionKey}</span>
            <span>·</span>
            <span>{RESPONSE_TYPE_LABEL[question.responseType] ?? question.responseType}</span>
            <span>·</span>
            <span>{question.screen === 'morning' ? 'Morning' : 'Evening'}</span>
            <span>·</span>
            <span className={question.active ? 'text-[#1B3A2D]' : 'font-medium text-[#854D0E]'}>
              {question.active ? 'Active' : 'Retired'}
            </span>
            <span>·</span>
            <span>
              Asked {question.askedCount === null ? 'not tracked' : `${question.askedCount}×`}
            </span>
            <span>·</span>
            <span>
              Answered {question.answeredCount}×
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/25"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            type="button"
            onClick={() => setShowEditor((prev) => !prev)}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/25"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          {question.answeredCount > 0 && (
            <button
              type="button"
              onClick={() => setShowReplace((prev) => !prev)}
              className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/25"
            >
              <Copy className="h-3.5 w-3.5" /> Retire &amp; replace
            </button>
          )}
          <button
            type="button"
            onClick={handleRetireToggle}
            disabled={busy}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/25 disabled:opacity-60"
          >
            {question.active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {question.active ? 'Retire' : 'Restore'}
          </button>
          <button
            type="button"
            onClick={loadHistory}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/25"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
        </div>
      </div>

      {error && <p className="mt-2 px-2 text-xs text-red-700">{error}</p>}

      {showEditor && (
        <div className="mt-3">
          <QuestionEditorForm
            mode="edit"
            initial={{
              prompt: question.prompt,
              driverId: question.driverId ?? '',
              responseType: question.responseType,
              options: question.options,
              screen: question.screen,
              questionKey: question.questionKey,
            }}
            drivers={drivers}
            lockedFields={[...lockedFields]}
            onCancel={() => setShowEditor(false)}
            onSubmit={async (input) => {
              const result = await updateQuestionAction(question.questionKey, {
                prompt: input.prompt,
                driverId: input.driverId,
                screen: input.screen,
                responseType: lockedFields.includes('responseType') ? undefined : input.responseType,
                options: lockedFields.includes('options') ? undefined : input.options,
              });
              if (result.ok) {
                setShowEditor(false);
                onChanged({
                  ...question,
                  prompt: input.prompt,
                  driverId: input.driverId,
                  screen: input.screen,
                  responseType: lockedFields.includes('responseType') ? question.responseType : input.responseType,
                  options: lockedFields.includes('options') ? question.options : input.options,
                });
                return { error: null };
              }
              return { error: result.error };
            }}
          />
        </div>
      )}

      {showReplace && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-[#854D0E]">
            This creates a brand-new question and retires this one — its {question.answeredCount}{' '}
            recorded answer{question.answeredCount === 1 ? '' : 's'} stay exactly as they are, under
            the old question key.
          </p>
          <QuestionEditorForm
            mode="replace"
            initial={{
              prompt: question.prompt,
              driverId: question.driverId ?? '',
              responseType: question.responseType,
              options: question.options,
              screen: question.screen,
            }}
            drivers={drivers}
            onCancel={() => setShowReplace(false)}
            onSubmit={async (input) => {
              const result = await retireAndReplaceQuestionAction(question.questionKey, input);
              if (!result.error) {
                setShowReplace(false);
                onReplaced(
                  { ...question, active: false },
                  {
                    questionKey: input.questionKey,
                    driverId: input.driverId,
                    prompt: input.prompt,
                    responseType: input.responseType,
                    options: input.options,
                    storage: 'probe_answer',
                    dailyCheckinsColumn: null,
                    wearableMetricCode: null,
                    requires: [],
                    excludes: [],
                    priority: 0,
                    active: true,
                    screen: input.screen,
                    displayStyle: null,
                    askedCount: 0,
                    answeredCount: 0,
                  }
                );
              }
              return { error: result.error };
            }}
          />
        </div>
      )}

      {showPreview && (
        <QuestionPreviewModal
          question={question}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showHistory && (
        <div className="mt-2 px-2">
          {revisions === null ? (
            <p className="text-xs text-[#6B7A72]">Loading…</p>
          ) : revisions.length === 0 ? (
            <p className="text-xs text-[#6B7A72]">No revisions recorded yet.</p>
          ) : (
            revisions.map((revision) => <RevisionRow key={revision.id} revision={revision} />)
          )}
        </div>
      )}
    </div>
  );
}
