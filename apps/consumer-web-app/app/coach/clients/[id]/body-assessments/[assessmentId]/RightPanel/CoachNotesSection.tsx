'use client';

import { useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, NotebookPen } from 'lucide-react';
import { saveAssessmentNoteAction } from '@/app/actions/body-assessment';
import { EmptyState } from './EmptyState';

const TOOLBAR_BUTTONS: { command: string; icon: typeof Bold; label: string }[] = [
  { command: 'bold', icon: Bold, label: 'Bold' },
  { command: 'italic', icon: Italic, label: 'Italic' },
  { command: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
];

function isEmptyHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length === 0;
}

/** ContentEditable + document.execCommand — the codebase has no rich-text library, and this is the smallest thing that supports bold/italic/bullets/numbers with a debounced autosave. */
export function CoachNotesSection({
  assessmentId,
  clientId,
  initialContent,
}: {
  assessmentId: string;
  clientId: string;
  initialContent: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEmpty, setIsEmpty] = useState(isEmptyHtml(initialContent));
  const [isFocused, setIsFocused] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaveState('saving');
    saveTimeout.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? '';
      saveAssessmentNoteAction({ assessmentId, clientId, content: html }).then((result) =>
        setSaveState(result.error ? 'idle' : 'saved')
      );
    }, 1200);
  }

  function handleInput() {
    setIsEmpty(isEmptyHtml(editorRef.current?.innerHTML ?? ''));
    scheduleSave();
  }

  function runCommand(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    handleInput();
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 rounded-xl bg-[#FAFAF8] p-1">
        {TOOLBAR_BUTTONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(command)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B7A72] transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        ))}
        <span className="ml-auto pr-1 text-[11px] font-medium text-[#6B7A72]">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <div className="relative">
        {isEmpty && !isFocused && (
          <div className="pointer-events-none absolute inset-0">
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              description="Click below to add your observations for this assessment."
            />
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: initialContent }}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`min-h-[140px] rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm leading-relaxed text-[#1B3A2D] outline-none transition focus:border-[#F5B700] [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 ${
            isEmpty && !isFocused ? 'opacity-0' : ''
          }`}
        />
      </div>
    </div>
  );
}
